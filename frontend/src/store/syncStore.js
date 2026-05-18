import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const LAST_SYNC_KEY = 'cashbook_last_synced_at';

export const useSyncStore = create((set) => ({
  isOnline:     true,
  isSyncing:    false,
  lastSyncedAt: null,         // ISO string | null
  progress:     { done: 0, total: 0, step: '' },
  syncError:    null,

  setOnline:  (v) => set({ isOnline: v }),

  startSync:  ()  => set({ isSyncing: true, syncError: null, progress: { done: 0, total: 0, step: 'Starting…' } }),

  setProgress: (done, total, step) => set({ progress: { done, total, step } }),

  finishSync: (isoTimestamp) => {
    if (isoTimestamp) {
      SecureStore.setItemAsync(LAST_SYNC_KEY, isoTimestamp).catch(() => {});
    }
    set({ isSyncing: false, lastSyncedAt: isoTimestamp, progress: { done: 0, total: 0, step: '' } });
  },

  failSync: (msg) => set({ isSyncing: false, syncError: msg, progress: { done: 0, total: 0, step: '' } }),
}));

// Hydrate last-sync timestamp from SecureStore so it's visible before any API call
SecureStore.getItemAsync(LAST_SYNC_KEY)
  .then(v => { if (v) useSyncStore.setState({ lastSyncedAt: v }); })
  .catch(() => {});
