import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { localGetAllDataForMigration, localClearAll, localImportAllData } from './localDb';
import { useAuthStore } from '../store/authStore';

const BACKUP_APP_ID = 'ultimate-cashbook-local-backup';
const BACKUP_VERSION = 1;
const ATTACHMENTS_DIR = `${FileSystem.documentDirectory}attachments/`;

function attachmentExtension(url) {
  const match = /\.([a-zA-Z0-9]+)$/.exec(url || '');
  return match ? match[1].toLowerCase() : 'jpg';
}

export async function generateLocalBackup(onProgress) {
  const data = await localGetAllDataForMigration();

  const attachmentEntries = (data.entries ?? []).filter(
    (e) => e.attachment_provider === 'local' && e.attachment_url,
  );

  const attachments = {};
  const total = attachmentEntries.length;
  for (let i = 0; i < attachmentEntries.length; i++) {
    const entry = attachmentEntries[i];
    try {
      const base64 = await FileSystem.readAsStringAsync(entry.attachment_url, {
        encoding: FileSystem.EncodingType.Base64,
      });
      attachments[entry.id] = { ext: attachmentExtension(entry.attachment_url), base64 };
    } catch {
      // Missing/corrupt file — skip it, the entry's text data is still backed up.
    }
    if (total > 0) onProgress?.(i + 1, total);
  }

  const exportedAt = new Date().toISOString();
  const counts = {
    books:          (data.books ?? []).length,
    entries:        (data.entries ?? []).length,
    categories:     (data.categories ?? []).length,
    customers:      (data.customers ?? []).length,
    suppliers:      (data.suppliers ?? []).length,
    payment_modes:  (data.payment_modes ?? []).length,
    attachments:    Object.keys(attachments).length,
  };

  const payload = {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exported_at: exportedAt,
    user_email: useAuthStore.getState().user?.email ?? null,
    counts,
    data,
    attachments,
  };

  const filename = `cashbook-backup-${exportedAt.slice(0, 10)}.json`;
  const dest = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(dest, JSON.stringify(payload));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(dest, {
      mimeType: 'application/json',
      dialogTitle: 'Save Ultimate CashBook Backup',
    });
  }

  return counts;
}

export async function pickBackupFile() {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', '*/*'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const raw = await FileSystem.readAsStringAsync(result.assets[0].uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('This file is not a valid Ultimate CashBook local backup.');
  }
  if (parsed?.app !== BACKUP_APP_ID) {
    throw new Error('This file is not a valid Ultimate CashBook local backup.');
  }
  return parsed;
}

export async function restoreLocalBackup(payload, onProgress) {
  await FileSystem.makeDirectoryAsync(ATTACHMENTS_DIR, { intermediates: true }).catch(() => {});

  const entriesById = new Map((payload.data?.entries ?? []).map((e) => [e.id, e]));

  const attachmentPairs = Object.entries(payload.attachments ?? {});
  const total = attachmentPairs.length;
  for (let i = 0; i < attachmentPairs.length; i++) {
    const [entryId, attachmentInfo] = attachmentPairs[i];
    try {
      const dest = `${ATTACHMENTS_DIR}restored_backup_${entryId}.${attachmentInfo.ext}`;
      await FileSystem.writeAsStringAsync(dest, attachmentInfo.base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const entry = entriesById.get(entryId);
      if (entry) {
        entry.attachment_url = dest;
        entry.attachment_path = dest;
        entry.attachment_provider = 'local';
      }
    } catch {
      // Bad attachment — leave that entry's attachment fields as they were in the backup.
    }
    if (total > 0) onProgress?.(i + 1, total);
  }

  // Attachments must be written and payload.data.entries patched with the new paths
  // BEFORE localImportAllData runs — it inserts these entry objects as-is, and the
  // old attachment_url pointed at the previous install's sandboxed file path, which
  // no longer exists after a reinstall.
  await localClearAll();
  await localImportAllData(payload.data ?? {});
}
