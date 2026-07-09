/**
 * Storage abstraction for entry attachments (images and PDFs).
 *
 * All tiers, online or offline → local provider (copies file to app documents dir).
 * Attachments only reach Supabase Storage via syncManager.js's syncLocalToCloud(),
 * which is triggered manually (Backup & Sync → "Upload to Cloud") — never at
 * picker time, regardless of subscription tier. This keeps attachments consistent
 * with the rest of the app's local-first, manual-sync-only data model.
 *
 * To migrate to another provider (S3, Cloudinary, R2, etc.):
 *  1. Add a new key to PROVIDERS below, implementing the same { upload, remove } interface.
 *  2. Update removeAttachment's provider dispatch if the new provider needs cleanup.
 *  3. Run a migration script that:
 *       SELECT id, attachment_path, attachment_provider
 *       FROM entries
 *       WHERE attachment_path IS NOT NULL AND attachment_provider = 'supabase';
 *     For each row: download from Supabase using attachment_path, upload to the
 *     new provider, then UPDATE attachment_url + attachment_path + attachment_provider.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { apiDeleteAttachment } from './api';

const ATTACHMENTS_DIR = `${FileSystem.documentDirectory}attachments/`;

const PROVIDERS = {
  // Upload is only ever called by syncManager.js directly via apiUploadAttachment
  // (not through this module) — this entry exists solely so removeAttachment can
  // clean up a Supabase Storage object for an already-synced entry.
  supabase: {
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

export const uploadAttachment = (params) => PROVIDERS.local.upload(params);

export const removeAttachment = (params) => {
  const provider = params.provider ?? 'supabase';
  return (PROVIDERS[provider] ?? PROVIDERS.supabase).remove(params);
};
