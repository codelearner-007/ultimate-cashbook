import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { localGetAllDataForMigration, localClearAll, localImportAllData } from './localDb';
import { useAuthStore } from '../store/authStore';

const BACKUP_APP_ID = 'ultimate-cashbook-local-backup';
const BACKUP_VERSION = 1;
const ATTACHMENTS_DIR = `${FileSystem.documentDirectory}attachments/`;
const BACKUPS_DIR = `${FileSystem.documentDirectory}backups/`;
const SAF_DIR_KEY = 'local_backup_saf_dir_uri';

// In-memory cache for the resolved public-folder URI — avoids a SecureStore round-trip
// (Android Keystore-backed, not free) on every single backup once it's been resolved once
// this app session.
let cachedPublicDirUri;

function attachmentExtension(url) {
  const match = /\.([a-zA-Z0-9]+)$/.exec(url || '');
  return match ? match[1].toLowerCase() : 'jpg';
}

// Android-only: resolves a persisted public-folder URI (e.g. Downloads), asking the user to
// pick one via the system folder picker the first time and reusing it on every backup after.
async function getOrRequestPublicDir() {
  if (Platform.OS !== 'android') return null;
  if (cachedPublicDirUri) return cachedPublicDirUri;
  try {
    const saved = await SecureStore.getItemAsync(SAF_DIR_KEY);
    if (saved) {
      cachedPublicDirUri = saved;
      return saved;
    }
  } catch {
    // SecureStore unavailable — fall through to a fresh request below.
  }
  try {
    const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!result.granted) return null;
    await SecureStore.setItemAsync(SAF_DIR_KEY, result.directoryUri).catch(() => {});
    cachedPublicDirUri = result.directoryUri;
    return result.directoryUri;
  } catch {
    return null;
  }
}

// The granted folder may have been deleted/revoked outside the app — drop it (cache and
// persisted) so the next backup re-prompts instead of silently failing every time after.
async function invalidatePublicDir() {
  cachedPublicDirUri = undefined;
  await SecureStore.deleteItemAsync(SAF_DIR_KEY).catch(() => {});
}

// Writes a copy of the backup into the user-chosen public folder so it shows up in a file
// manager under Internal Storage, not just inside the app's private sandbox. Best-effort —
// returns false (never throws) if the user has no folder granted or the write fails, since the
// documentDirectory copy written by generateLocalBackup() is always the durable source of truth.
async function saveToPublicStorage(filename, json) {
  const dirUri = await getOrRequestPublicDir();
  if (!dirUri) return false;
  try {
    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
      dirUri, filename, 'application/json',
    );
    await FileSystem.writeAsStringAsync(fileUri, json, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return true;
  } catch {
    await invalidatePublicDir();
    return false;
  }
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
  const json = JSON.stringify(payload);

  await FileSystem.makeDirectoryAsync(BACKUPS_DIR, { intermediates: true }).catch(() => {});
  const dest = `${BACKUPS_DIR}${filename}`;

  // The persistent, app-private copy and the best-effort public-folder copy (Android only,
  // via saveToPublicStorage) are independent of each other, so they run concurrently rather
  // than back-to-back. The private copy is what fixes backups disappearing when the share
  // sheet below is dismissed/cancelled or the OS clears the cache directory the file
  // previously lived in — it's always written regardless of what happens to the other two.
  const [, savedToPublicStorage] = await Promise.all([
    FileSystem.writeAsStringAsync(dest, json),
    saveToPublicStorage(filename, json),
  ]);

  // The file is already durably saved at this point (dest, and optionally the public-storage
  // copy above) — a share-sheet hiccup (no share target, user swipes it away oddly, native
  // error) must not turn an already-successful backup into a reported failure.
  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(dest, {
        mimeType: 'application/json',
        dialogTitle: 'Save Ultimate CashBook Backup',
      });
    }
  } catch {
    // Non-fatal — the backup file itself is already safely saved.
  }

  return { ...counts, savedToPublicStorage };
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
