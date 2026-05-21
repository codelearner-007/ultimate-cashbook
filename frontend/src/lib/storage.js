/**
 * Storage abstraction for entry attachments (images and PDFs).
 *
 * Free tier / offline  → local provider  (copies file to app documents dir)
 * Paid tier + online   → supabase provider (uploads via FastAPI backend)
 *
 * To migrate to another provider (S3, Cloudinary, R2, etc.):
 *  1. Add a new key to PROVIDERS below, implementing the same { upload, remove } interface.
 *  2. Update the routing logic in uploadAttachment / removeAttachment.
 *  3. Run a migration script that:
 *       SELECT id, attachment_path, attachment_provider
 *       FROM entries
 *       WHERE attachment_path IS NOT NULL AND attachment_provider = 'supabase';
 *     For each row: download from Supabase using attachment_path, upload to the
 *     new provider, then UPDATE attachment_url + attachment_path + attachment_provider.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { apiUploadAttachment, apiDeleteAttachment } from './api';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';

const ATTACHMENTS_DIR = `${FileSystem.documentDirectory}attachments/`;

const PROVIDERS = {
  supabase: {
    async upload({ entryId, uri, mimeType, filename }) {
      const data = await apiUploadAttachment(uri, mimeType, filename, entryId);
      return { url: data.attachment_url, path: data.path, provider: 'supabase' };
    },
    async remove({ path }) {
      await apiDeleteAttachment(path);
    },
  },

  local: {
    async upload({ uri, filename }) {
      await FileSystem.makeDirectoryAsync(ATTACHMENTS_DIR, { intermediates: true });
      const dest = `${ATTACHMENTS_DIR}${Date.now()}_${filename}`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      return { url: dest, path: dest, provider: 'local' };
    },
    async remove({ path }) {
      await FileSystem.deleteAsync(path, { idempotent: true });
    },
  },
};

function shouldUseLocal() {
  const state    = useAuthStore.getState();
  const tier     = state.subscription_tier ?? 'free';
  const role     = state.user?.role;
  const isOnline = useSyncStore.getState()?.isOnline ?? true;
  if (!isOnline) return true;
  if (role === 'superadmin') return false;   // superadmin always uses Supabase Storage
  return tier === 'free';
}

export const uploadAttachment = (params) =>
  shouldUseLocal() ? PROVIDERS.local.upload(params) : PROVIDERS.supabase.upload(params);

export const removeAttachment = (params) => {
  const provider = params.provider ?? 'supabase';
  return (PROVIDERS[provider] ?? PROVIDERS.supabase).remove(params);
};
