import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const LAST_SYNC_KEY    = 'cashbook_last_synced_at';
const HAS_RESTORED_KEY = 'cashbook_has_restored';

export const useSyncStore = create((set) => ({
  isOnline:            false,
  isSyncing:           false,
  lastSyncedAt:        null,   // ISO string | null
  progress:            { done: 0, total: 0, step: '' },
  syncError:           null,
  showRestorePrompt:   false,

  // Restore (cloud → local) state
  isRestoring:         false,
  restoreProgress:     { done: 0, total: 0, step: '' },
  restoreError:        null,

  // Persisted flag — hides "Restore from Cloud" button once data is local
  // Also set to true after "Start Fresh" (cloud is empty, nothing to restore)
  hasRestoredFromCloud: false,

  setOnline:  (v) => set({ isOnline: v }),

  startSync:   () => set({ isSyncing: true, syncError: null, progress: { done: 0, total: 0, step: 'Starting…' } }),
  setProgress: (done, total, step) => set({ progress: { done, total, step } }),
  finishSync:  (isoTimestamp) => {
    if (isoTimestamp) SecureStore.setItemAsync(LAST_SYNC_KEY, isoTimestamp).catch(() => {});
    set({ isSyncing: false, lastSyncedAt: isoTimestamp, progress: { done: 0, total: 0, step: '' } });
  },
  failSync: (msg) => set({ isSyncing: false, syncError: msg, progress: { done: 0, total: 0, step: '' } }),

  // Restore actions
  startRestore:       () => set({ isRestoring: true, restoreError: null, restoreProgress: { done: 0, total: 0, step: 'Connecting…' } }),
  setRestoreProgress: (done, total, step) => set({ restoreProgress: { done, total, step } }),
  finishRestore:      () => set({ isRestoring: false, restoreProgress: { done: 0, total: 0, step: '' } }),
  failRestore:        (msg) => set({ isRestoring: false, restoreError: msg, restoreProgress: { done: 0, total: 0, step: '' } }),

  // Call after a successful restore OR after Start Fresh — hides the restore button
  setHasRestored: (v) => {
    SecureStore.setItemAsync(HAS_RESTORED_KEY, v ? '1' : '').catch(() => {});
    set({ hasRestoredFromCloud: v });
  },

  setRestorePrompt: (v) => set({ showRestorePrompt: v }),
}));

// Hydrate persisted values from SecureStore
SecureStore.getItemAsync(LAST_SYNC_KEY)
  .then(v => { if (v) useSyncStore.setState({ lastSyncedAt: v }); })
  .catch(() => {});

SecureStore.getItemAsync(HAS_RESTORED_KEY)
  .then(v => { if (v === '1') useSyncStore.setState({ hasRestoredFromCloud: true }); })
  .catch(() => {});
