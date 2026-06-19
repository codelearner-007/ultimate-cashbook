/**
 * Data source router — local-always, cloud-backup architecture.
 *
 * Golden rule: Internet is NEVER required for any CRUD operation.
 * Local SQLite is the primary store for ALL users. Cloud sync is a
 * background side-effect, never a prerequisite.
 *
 * Read routing (ALL tiers):
 *   Always → local SQLite (instant, works offline/online, no network check)
 *
 * Write routing:
 *   Free tier          → local SQLite only (never touches cloud)
 *   Paid / Superadmin  → local SQLite first (instant, returned to caller),
 *                        then fire-and-forget background push to cloud.
 *                        If offline or push fails → silent; AutoSyncMonitor
 *                        uploads queued writes on next reconnect.
 *
 * Initial cloud → local pull:
 *   When a paid/superadmin user logs in on a new device with no local data,
 *   syncManager.syncCloudToLocal() is triggered from _layout.jsx to
 *   download all cloud data into SQLite once.
 */

import { useAuthStore } from '../store/authStore';
import { useSyncStore }  from '../store/syncStore';
import { DEV_TIER, DEV_OVERRIDE_LOCAL } from './devConfig';
import * as L from './localDb';
import {
  apiGetBooks              as _apiGetBooks,
  apiCreateBook            as _apiCreateBook,
  apiUpdateBook            as _apiUpdateBook,
  apiDeleteBook            as _apiDeleteBook,
  apiUpdateBookFieldSettings as _apiUpdateBookFieldSettings,
  apiGetEntries            as _apiGetEntries,
  apiGetSummary            as _apiGetSummary,
  apiCreateEntry           as _apiCreateEntry,
  apiUpdateEntry           as _apiUpdateEntry,
  apiDeleteEntry           as _apiDeleteEntry,
  apiDeleteAllEntries      as _apiDeleteAllEntries,
  apiGetCategories         as _apiGetCategories,
  apiCreateCategory        as _apiCreateCategory,
  apiUpdateCategory        as _apiUpdateCategory,
  apiDeleteCategory        as _apiDeleteCategory,
  apiGetCategoryEntries    as _apiGetCategoryEntries,
  apiGetCustomers          as _apiGetCustomers,
  apiCreateCustomer        as _apiCreateCustomer,
  apiGetCustomer           as _apiGetCustomer,
  apiUpdateCustomer        as _apiUpdateCustomer,
  apiDeleteCustomer        as _apiDeleteCustomer,
  apiGetCustomerEntries    as _apiGetCustomerEntries,
  apiGetSuppliers          as _apiGetSuppliers,
  apiCreateSupplier        as _apiCreateSupplier,
  apiGetSupplier           as _apiGetSupplier,
  apiUpdateSupplier        as _apiUpdateSupplier,
  apiDeleteSupplier        as _apiDeleteSupplier,
  apiGetSupplierEntries    as _apiGetSupplierEntries,
  apiGetPaymentModes       as _apiGetPaymentModes,
  apiCreatePaymentMode     as _apiCreatePaymentMode,
  apiUpdatePaymentMode     as _apiUpdatePaymentMode,
  apiDeletePaymentMode     as _apiDeletePaymentMode,
  apiReorderPaymentModes   as _apiReorderPaymentModes,
  apiGetPaymentModeEntries as _apiGetPaymentModeEntries,
  apiReorderCategories     as _apiReorderCategories,
  apiReorderCustomers      as _apiReorderCustomers,
  apiReorderSuppliers      as _apiReorderSuppliers,
} from './api';

// Shared books exist only in the cloud — not in the local SQLite.
// This helper routes reads to the cloud API when the book has no local record.
async function isLocalBook(bookId) {
  return L.localBookExists(bookId);
}

/**
 * Returns true when this user/session is eligible for background cloud push.
 * Used ONLY to decide whether to fire a side-effect — never to block a write.
 *   - Must be paid tier or superadmin
 *   - Must currently be online
 *   - DEV_OVERRIDE_LOCAL disables cloud push for testing
 */
function shouldBackupToCloud() {
  if (DEV_OVERRIDE_LOCAL) return false;
  const state    = useAuthStore.getState();
  const isOnline = useSyncStore.getState().isOnline;
  if (!isOnline) return false;
  if (state.user?.role === 'superadmin') return true;
  const tier = DEV_TIER ?? state.user?.subscription_tier ?? 'free';
  return tier !== 'free';
}

/**
 * Resolve the local book record that corresponds to a cloud book ID.
 * Returns null if no mapping exists yet (sync hasn't run for this book).
 */
function localBookForCloud(cloudBookId) {
  return L.localGetBookByCloudId(cloudBookId);
}

/**
 * Given a local book ID, return the corresponding cloud UUID.
 * Falls back to the input ID itself when the book has no cloud_id yet
 * (e.g. the book was created but sync hasn't run, or the ID was already a cloud ID).
 * Used by sharing hooks that must send the cloud UUID to the backend.
 */
export async function resolveCloudBookId(localId) {
  const cloudId = await L.localGetCloudBookId(localId);
  return cloudId ?? localId;
}

// ── Books ──────────────────────────────────────────────────────────────────────

// Reads always come from local SQLite regardless of tier or connectivity.
export const apiGetBooks = () => L.localGetBooks();

export const apiCreateBook = async (name, cur) => {
  // Write local first — instant, no network involved.
  const localBook = await L.localCreateBook(name, cur);

  if (shouldBackupToCloud()) {
    // Fire-and-forget — user never waits on this.
    _apiCreateBook(name, cur)
      .then(cloud => L.localSetBookCloudId(localBook.id, cloud.id).catch(() => {}))
      .catch(() => {}); // silent — AutoSyncMonitor retries on reconnect
  }

  return localBook;
};

export const apiUpdateBook = async (id, p) => {
  const result = await L.localUpdateBook(id, p);

  if (shouldBackupToCloud()) {
    // id here is a local book id; look up the cloud id for the push.
    localBookForCloud(id)
      .then(local => {
        // If id is already a cloud id (superadmin case during initial sync),
        // fall back to using it directly.
        const cloudId = local?.cloud_id ?? id;
        _apiUpdateBook(cloudId, p).catch(() => {});
      })
      .catch(() => {});
  }

  return result;
};

export const apiDeleteBook = async (id) => {
  // Capture cloud_id BEFORE deleting — the row won't exist after localDeleteBook
  const cloudId = await L.localGetCloudBookId(id).catch(() => null);

  await L.localDeleteBook(id);

  if (cloudId && shouldBackupToCloud()) {
    _apiDeleteBook(cloudId).catch(() => {});
  }
};

export const apiUpdateBookFieldSettings = async (id, s) => {
  const result = await L.localUpdateBookFieldSettings(id, s);

  if (shouldBackupToCloud()) {
    localBookForCloud(id)
      .then(local => {
        const cloudId = local?.cloud_id ?? id;
        _apiUpdateBookFieldSettings(cloudId, s).catch(() => {});
      })
      .catch(() => {});
  }

  return result;
};

// ── Entries ────────────────────────────────────────────────────────────────────

export const apiGetEntries = async (bookId, params) => {
  if (await isLocalBook(bookId)) return L.localGetEntries(bookId, params);
  return _apiGetEntries(bookId, params);
};

export const apiGetSummary = async (bookId) => {
  if (await isLocalBook(bookId)) return L.localGetSummary(bookId);
  return _apiGetSummary(bookId);
};

export const apiCreateEntry = async (bookId, p) => {
  if (!await isLocalBook(bookId)) return _apiCreateEntry(bookId, p);

  const localEntry = await L.localCreateEntry(bookId, p);

  if (shouldBackupToCloud()) {
    localBookForCloud(bookId)
      .then(local => {
        const cloudBookId = local?.cloud_id ?? bookId;
        _apiCreateEntry(cloudBookId, {
          ...p,
          // FK IDs are local — null them out; text snapshots (category, contact_name) are preserved
          category_id:     null,
          customer_id:     null,
          supplier_id:     null,
          payment_mode_id: null,
        }).catch(() => {});
      })
      .catch(() => {});
  }

  return localEntry;
};

export const apiUpdateEntry = async (bookId, id, p) => {
  if (!await isLocalBook(bookId)) return _apiUpdateEntry(bookId, id, p);

  const result = await L.localUpdateEntry(bookId, id, p);

  if (shouldBackupToCloud()) {
    localBookForCloud(bookId)
      .then(local => {
        const cloudBookId = local?.cloud_id ?? bookId;
        _apiUpdateEntry(cloudBookId, id, p).catch(() => {});
      })
      .catch(() => {});
  }

  return result;
};

export const apiDeleteEntry = async (bookId, id) => {
  if (!await isLocalBook(bookId)) return _apiDeleteEntry(bookId, id);

  await L.localDeleteEntry(bookId, id);

  if (shouldBackupToCloud()) {
    localBookForCloud(bookId)
      .then(local => {
        const cloudBookId = local?.cloud_id ?? bookId;
        _apiDeleteEntry(cloudBookId, id).catch(() => {});
      })
      .catch(() => {});
  }
};

export const apiDeleteAllEntries = async (bookId) => {
  if (!await isLocalBook(bookId)) return _apiDeleteAllEntries(bookId);

  await L.localDeleteAllEntries(bookId);

  if (shouldBackupToCloud()) {
    localBookForCloud(bookId)
      .then(local => {
        const cloudBookId = local?.cloud_id ?? bookId;
        _apiDeleteAllEntries(cloudBookId).catch(() => {});
      })
      .catch(() => {});
  }
};

// ── Categories ─────────────────────────────────────────────────────────────────

export const apiGetCategories = async (bookId) => {
  if (await isLocalBook(bookId)) return L.localGetCategories(bookId);
  return _apiGetCategories(bookId);
};

export const apiGetCategoryEntries = async (bookId, id) => {
  if (await isLocalBook(bookId)) return L.localGetCategoryEntries(bookId, id);
  return _apiGetCategoryEntries(bookId, id);
};

export const apiCreateCategory = async (bookId, payload) => {
  if (!await isLocalBook(bookId)) return _apiCreateCategory(bookId, payload);
  const name = typeof payload === 'object' ? payload.name : payload;
  const result = await L.localCreateCategory(bookId, name);

  if (shouldBackupToCloud()) {
    localBookForCloud(bookId)
      .then(local => {
        const cloudBookId = local?.cloud_id ?? bookId;
        _apiCreateCategory(cloudBookId, payload).catch(() => {});
      })
      .catch(() => {});
  }

  return result;
};

export const apiUpdateCategory = async (bookId, id, p) => {
  if (!await isLocalBook(bookId)) return _apiUpdateCategory(bookId, id, p);
  const result = await L.localUpdateCategory(bookId, id, p);

  if (shouldBackupToCloud()) {
    localBookForCloud(bookId)
      .then(local => {
        const cloudBookId = local?.cloud_id ?? bookId;
        _apiUpdateCategory(cloudBookId, id, p).catch(() => {});
      })
      .catch(() => {});
  }

  return result;
};

export const apiDeleteCategory = async (bookId, id) => {
  if (!await isLocalBook(bookId)) return _apiDeleteCategory(bookId, id);
  await L.localDeleteCategory(bookId, id);

  if (shouldBackupToCloud()) {
    localBookForCloud(bookId)
      .then(local => {
        const cloudBookId = local?.cloud_id ?? bookId;
        _apiDeleteCategory(cloudBookId, id).catch(() => {});
      })
      .catch(() => {});
  }
};

export const apiReorderCategories = async (bookId, orderedIds) => {
  if (!await isLocalBook(bookId)) return _apiReorderCategories(bookId, orderedIds);
  const result = await L.localReorderCategories(bookId, orderedIds);

  if (shouldBackupToCloud()) {
    localBookForCloud(bookId)
      .then(local => {
        const cloudBookId = local?.cloud_id ?? bookId;
        _apiReorderCategories(cloudBookId, orderedIds).catch(() => {});
      })
      .catch(() => {});
  }

  return result;
};

// ── Customers ──────────────────────────────────────────────────────────────────

export const apiGetCustomers = async (bookId) => {
  if (await isLocalBook(bookId)) return L.localGetCustomers(bookId);
  return _apiGetCustomers(bookId);
};

export const apiGetCustomer = async (bookId, id) => {
  if (await isLocalBook(bookId)) return L.localGetCustomer(bookId, id);
  return _apiGetCustomer(bookId, id);
};

export const apiGetCustomerEntries = async (bookId, id) => {
  if (await isLocalBook(bookId)) return L.localGetCustomerEntries(bookId, id);
  return _apiGetCustomerEntries(bookId, id);
};

export const apiCreateCustomer = async (bookId, p) => {
  if (!await isLocalBook(bookId)) return _apiCreateCustomer(bookId, p);
  const result = await L.localCreateCustomer(bookId, p);

  if (shouldBackupToCloud()) {
    localBookForCloud(bookId)
      .then(local => {
        const cloudBookId = local?.cloud_id ?? bookId;
        _apiCreateCustomer(cloudBookId, p).catch(() => {});
      })
      .catch(() => {});
  }

  return result;
};

export const apiUpdateCustomer = async (bookId, id, p) => {
  if (!await isLocalBook(bookId)) return _apiUpdateCustomer(bookId, id, p);
  const result = await L.localUpdateCustomer(bookId, id, p);

  if (shouldBackupToCloud()) {
    localBookForCloud(bookId)
      .then(local => {
        const cloudBookId = local?.cloud_id ?? bookId;
        _apiUpdateCustomer(cloudBookId, id, p).catch(() => {});
      })
      .catch(() => {});
  }

  return result;
};

export const apiDeleteCustomer = async (bookId, id) => {
  if (!await isLocalBook(bookId)) return _apiDeleteCustomer(bookId, id);
  await L.localDeleteCustomer(bookId, id);

  if (shouldBackupToCloud()) {
    localBookForCloud(bookId)
      .then(local => {
        const cloudBookId = local?.cloud_id ?? bookId;
        _apiDeleteCustomer(cloudBookId, id).catch(() => {});
      })
      .catch(() => {});
  }
};

export const apiReorderCustomers = async (bookId, orderedIds) => {
  if (!await isLocalBook(bookId)) return _apiReorderCustomers(bookId, orderedIds);
  const result = await L.localReorderCustomers(bookId, orderedIds);

  if (shouldBackupToCloud()) {
    localBookForCloud(bookId)
      .then(local => {
        const cloudBookId = local?.cloud_id ?? bookId;
        _apiReorderCustomers(cloudBookId, orderedIds).catch(() => {});
      })
      .catch(() => {});
  }

  return result;
};

// ── Suppliers ──────────────────────────────────────────────────────────────────

export const apiGetSuppliers = async (bookId) => {
  if (await isLocalBook(bookId)) return L.localGetSuppliers(bookId);
  return _apiGetSuppliers(bookId);
};

export const apiGetSupplier = async (bookId, id) => {
  if (await isLocalBook(bookId)) return L.localGetSupplier(bookId, id);
  return _apiGetSupplier(bookId, id);
};

export const apiGetSupplierEntries = async (bookId, id) => {
  if (await isLocalBook(bookId)) return L.localGetSupplierEntries(bookId, id);
  return _apiGetSupplierEntries(bookId, id);
};

export const apiCreateSupplier = async (bookId, p) => {
  if (!await isLocalBook(bookId)) return _apiCreateSupplier(bookId, p);
  const result = await L.localCreateSupplier(bookId, p);

  if (shouldBackupToCloud()) {
    localBookForCloud(bookId)
      .then(local => {
        const cloudBookId = local?.cloud_id ?? bookId;
        _apiCreateSupplier(cloudBookId, p).catch(() => {});
      })
      .catch(() => {});
  }

  return result;
};

export const apiUpdateSupplier = async (bookId, id, p) => {
  if (!await isLocalBook(bookId)) return _apiUpdateSupplier(bookId, id, p);
  const result = await L.localUpdateSupplier(bookId, id, p);

  if (shouldBackupToCloud()) {
    localBookForCloud(bookId)
      .then(local => {
        const cloudBookId = local?.cloud_id ?? bookId;
        _apiUpdateSupplier(cloudBookId, id, p).catch(() => {});
      })
      .catch(() => {});
  }

  return result;
};

export const apiDeleteSupplier = async (bookId, id) => {
  if (!await isLocalBook(bookId)) return _apiDeleteSupplier(bookId, id);
  await L.localDeleteSupplier(bookId, id);

  if (shouldBackupToCloud()) {
    localBookForCloud(bookId)
      .then(local => {
        const cloudBookId = local?.cloud_id ?? bookId;
        _apiDeleteSupplier(cloudBookId, id).catch(() => {});
      })
      .catch(() => {});
  }
};

export const apiReorderSuppliers = async (bookId, orderedIds) => {
  if (!await isLocalBook(bookId)) return _apiReorderSuppliers(bookId, orderedIds);
  const result = await L.localReorderSuppliers(bookId, orderedIds);

  if (shouldBackupToCloud()) {
    localBookForCloud(bookId)
      .then(local => {
        const cloudBookId = local?.cloud_id ?? bookId;
        _apiReorderSuppliers(cloudBookId, orderedIds).catch(() => {});
      })
      .catch(() => {});
  }

  return result;
};

// ── Payment Modes ──────────────────────────────────────────────────────────────

export const apiGetPaymentModes = async (bookId) => {
  if (await isLocalBook(bookId)) return L.localGetPaymentModes(bookId);
  return _apiGetPaymentModes(bookId);
};

export const apiGetPaymentModeEntries = async (bookId, id) => {
  if (await isLocalBook(bookId)) return L.localGetPaymentModeEntries(bookId, id);
  return _apiGetPaymentModeEntries(bookId, id);
};

export const apiCreatePaymentMode = async (bookId, p) => {
  if (!await isLocalBook(bookId)) return _apiCreatePaymentMode(bookId, p);
  const name = typeof p === 'object' ? p.name : p;
  const result = await L.localCreatePaymentMode(bookId, name);

  if (shouldBackupToCloud()) {
    localBookForCloud(bookId)
      .then(local => {
        const cloudBookId = local?.cloud_id ?? bookId;
        _apiCreatePaymentMode(cloudBookId, p).catch(() => {});
      })
      .catch(() => {});
  }

  return result;
};

export const apiUpdatePaymentMode = async (bookId, id, p) => {
  if (!await isLocalBook(bookId)) return _apiUpdatePaymentMode(bookId, id, p);
  const result = await L.localUpdatePaymentMode(bookId, id, p);

  if (shouldBackupToCloud()) {
    localBookForCloud(bookId)
      .then(local => {
        const cloudBookId = local?.cloud_id ?? bookId;
        _apiUpdatePaymentMode(cloudBookId, id, p).catch(() => {});
      })
      .catch(() => {});
  }

  return result;
};

export const apiDeletePaymentMode = async (bookId, id) => {
  if (!await isLocalBook(bookId)) return _apiDeletePaymentMode(bookId, id);
  await L.localDeletePaymentMode(bookId, id);

  if (shouldBackupToCloud()) {
    localBookForCloud(bookId)
      .then(local => {
        const cloudBookId = local?.cloud_id ?? bookId;
        _apiDeletePaymentMode(cloudBookId, id).catch(() => {});
      })
      .catch(() => {});
  }
};

export const apiReorderPaymentModes = async (bookId, orderedIds) => {
  if (!await isLocalBook(bookId)) return _apiReorderPaymentModes(bookId, orderedIds);
  const result = await L.localReorderPaymentModes(bookId, orderedIds);

  if (shouldBackupToCloud()) {
    localBookForCloud(bookId)
      .then(local => {
        const cloudBookId = local?.cloud_id ?? bookId;
        _apiReorderPaymentModes(cloudBookId, orderedIds).catch(() => {});
      })
      .catch(() => {});
  }

  return result;
};
