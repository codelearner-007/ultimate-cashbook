/**
 * Data source router — offline-first with cloud backup.
 *
 * Read routing:
 *   Paid + online  → cloud API (freshest multi-device data)
 *   Free / offline → local SQLite
 *
 * Write routing (CREATE / UPDATE / DELETE):
 *   Free / offline → local SQLite only
 *   Paid + online  → cloud API (primary) + local SQLite (backup)
 *
 * Why dual-write on paid+online:
 *   If a user creates data while on a paid plan and later downgrades to free,
 *   the local DB must already have that data — otherwise it disappears.
 *   Cloud is the authoritative source while the plan is active; local is the
 *   safety net that survives plan changes and offline transitions.
 *
 * ID bridge:
 *   Cloud and local use different UUIDs for the same book. The `cloud_id`
 *   column on the local `books` table links them. It is populated:
 *     (a) when a book is created on paid+online (apiCreateBook dual-write), and
 *     (b) when syncLocalToCloud runs (syncManager sets cloud_id on matched books).
 *   All other entity backups (entries, categories, etc.) look up the local book
 *   via its cloud_id to find the correct local book_id for insertion.
 */

import { useAuthStore } from '../store/authStore';
import { useSyncStore }  from '../store/syncStore';
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
} from './api';

/**
 * Returns true when ALL operations should stay in local SQLite.
 * False means: cloud is primary, but local gets a backup copy of every write.
 */
function useLocalDb() {
  const tier     = useAuthStore.getState().subscription_tier ?? 'free';
  const isOnline = useSyncStore.getState().isOnline;
  return tier === 'free' || !isOnline;
}

/**
 * Resolve the local book record that corresponds to a cloud book ID.
 * Returns null if the mapping has not been established yet (no sync has run).
 */
function localBookForCloud(cloudBookId) {
  return L.localGetBookByCloudId(cloudBookId);
}

// ── Books ──────────────────────────────────────────────────────────────────────

export const apiGetBooks = () =>
  useLocalDb() ? L.localGetBooks() : _apiGetBooks();

export const apiCreateBook = async (name, cur) => {
  if (useLocalDb()) return L.localCreateBook(name, cur);

  // Paid + online: cloud is primary; backup to local and link IDs
  const cloudBook = await _apiCreateBook(name, cur);
  const localBook = await L.localCreateBook(name, cur).catch(() => null);
  if (localBook) {
    L.localSetBookCloudId(localBook.id, cloudBook.id).catch(() => {});
  }
  return cloudBook;
};

export const apiUpdateBook = async (id, p) => {
  if (useLocalDb()) return L.localUpdateBook(id, p);

  const result = await _apiUpdateBook(id, p);
  const local  = await localBookForCloud(id);
  if (local) L.localUpdateBook(local.id, p).catch(() => {});
  return result;
};

export const apiDeleteBook = async (id) => {
  if (useLocalDb()) return L.localDeleteBook(id);

  await _apiDeleteBook(id);
  const local = await localBookForCloud(id);
  if (local) L.localDeleteBook(local.id).catch(() => {});
};

export const apiUpdateBookFieldSettings = async (id, s) => {
  if (useLocalDb()) return L.localUpdateBookFieldSettings(id, s);

  const result = await _apiUpdateBookFieldSettings(id, s);
  const local  = await localBookForCloud(id);
  if (local) L.localUpdateBookFieldSettings(local.id, s).catch(() => {});
  return result;
};

// ── Entries ────────────────────────────────────────────────────────────────────

export const apiGetEntries = (bookId, params) =>
  useLocalDb() ? L.localGetEntries(bookId, params) : _apiGetEntries(bookId, params);

export const apiGetSummary = (bookId) =>
  useLocalDb() ? L.localGetSummary(bookId) : _apiGetSummary(bookId);

export const apiCreateEntry = async (bookId, p) => {
  if (useLocalDb()) return L.localCreateEntry(bookId, p);

  // Paid + online: cloud is primary; backup to local
  const cloudEntry = await _apiCreateEntry(bookId, p);
  const local      = await localBookForCloud(bookId);
  if (local) {
    // Null-out cloud FK IDs — local has different ID space; text snapshots are preserved
    L.localCreateEntry(local.id, {
      ...p,
      category_id:     null,
      customer_id:     null,
      supplier_id:     null,
      payment_mode_id: null,
    }).catch(() => {});
  }
  return cloudEntry;
};

export const apiUpdateEntry = (bookId, id, p) =>
  useLocalDb() ? L.localUpdateEntry(bookId, id, p) : _apiUpdateEntry(bookId, id, p);

export const apiDeleteEntry = (bookId, id) =>
  useLocalDb() ? L.localDeleteEntry(bookId, id) : _apiDeleteEntry(bookId, id);

export const apiDeleteAllEntries = async (bookId) => {
  if (useLocalDb()) return L.localDeleteAllEntries(bookId);

  await _apiDeleteAllEntries(bookId);
  const local = await localBookForCloud(bookId);
  if (local) L.localDeleteAllEntries(local.id).catch(() => {});
};

// ── Categories ─────────────────────────────────────────────────────────────────

export const apiGetCategories = (bookId) =>
  useLocalDb() ? L.localGetCategories(bookId) : _apiGetCategories(bookId);

export const apiCreateCategory = async (bookId, payload) => {
  const name = typeof payload === 'object' ? payload.name : payload;
  if (useLocalDb()) return L.localCreateCategory(bookId, name);

  const cloudResult = await _apiCreateCategory(bookId, payload);
  const local       = await localBookForCloud(bookId);
  if (local) L.localCreateCategory(local.id, name).catch(() => {});
  return cloudResult;
};

export const apiUpdateCategory = (bookId, id, p) =>
  useLocalDb() ? L.localUpdateCategory(bookId, id, p) : _apiUpdateCategory(bookId, id, p);

export const apiDeleteCategory = (bookId, id) =>
  useLocalDb() ? L.localDeleteCategory(bookId, id) : _apiDeleteCategory(bookId, id);

export const apiGetCategoryEntries = (bookId, id) =>
  useLocalDb() ? L.localGetCategoryEntries(bookId, id) : _apiGetCategoryEntries(bookId, id);

// ── Customers ──────────────────────────────────────────────────────────────────

export const apiGetCustomers = (bookId) =>
  useLocalDb() ? L.localGetCustomers(bookId) : _apiGetCustomers(bookId);

export const apiCreateCustomer = async (bookId, p) => {
  if (useLocalDb()) return L.localCreateCustomer(bookId, p);

  const cloudResult = await _apiCreateCustomer(bookId, p);
  const local       = await localBookForCloud(bookId);
  if (local) L.localCreateCustomer(local.id, p).catch(() => {});
  return cloudResult;
};

export const apiGetCustomer = (bookId, id) =>
  useLocalDb() ? L.localGetCustomer(bookId, id) : _apiGetCustomer(bookId, id);

export const apiUpdateCustomer = (bookId, id, p) =>
  useLocalDb() ? L.localUpdateCustomer(bookId, id, p) : _apiUpdateCustomer(bookId, id, p);

export const apiDeleteCustomer = (bookId, id) =>
  useLocalDb() ? L.localDeleteCustomer(bookId, id) : _apiDeleteCustomer(bookId, id);

export const apiGetCustomerEntries = (bookId, id) =>
  useLocalDb() ? L.localGetCustomerEntries(bookId, id) : _apiGetCustomerEntries(bookId, id);

// ── Suppliers ──────────────────────────────────────────────────────────────────

export const apiGetSuppliers = (bookId) =>
  useLocalDb() ? L.localGetSuppliers(bookId) : _apiGetSuppliers(bookId);

export const apiCreateSupplier = async (bookId, p) => {
  if (useLocalDb()) return L.localCreateSupplier(bookId, p);

  const cloudResult = await _apiCreateSupplier(bookId, p);
  const local       = await localBookForCloud(bookId);
  if (local) L.localCreateSupplier(local.id, p).catch(() => {});
  return cloudResult;
};

export const apiGetSupplier = (bookId, id) =>
  useLocalDb() ? L.localGetSupplier(bookId, id) : _apiGetSupplier(bookId, id);

export const apiUpdateSupplier = (bookId, id, p) =>
  useLocalDb() ? L.localUpdateSupplier(bookId, id, p) : _apiUpdateSupplier(bookId, id, p);

export const apiDeleteSupplier = (bookId, id) =>
  useLocalDb() ? L.localDeleteSupplier(bookId, id) : _apiDeleteSupplier(bookId, id);

export const apiGetSupplierEntries = (bookId, id) =>
  useLocalDb() ? L.localGetSupplierEntries(bookId, id) : _apiGetSupplierEntries(bookId, id);

// ── Payment Modes ──────────────────────────────────────────────────────────────

export const apiGetPaymentModes = (bookId) =>
  useLocalDb() ? L.localGetPaymentModes(bookId) : _apiGetPaymentModes(bookId);

export const apiCreatePaymentMode = async (bookId, p) => {
  const name = typeof p === 'object' ? p.name : p;
  if (useLocalDb()) return L.localCreatePaymentMode(bookId, name);

  const cloudResult = await _apiCreatePaymentMode(bookId, p);
  const local       = await localBookForCloud(bookId);
  if (local) L.localCreatePaymentMode(local.id, name).catch(() => {});
  return cloudResult;
};

export const apiUpdatePaymentMode = (bookId, id, p) =>
  useLocalDb() ? L.localUpdatePaymentMode(bookId, id, p) : _apiUpdatePaymentMode(bookId, id, p);

export const apiDeletePaymentMode = (bookId, id) =>
  useLocalDb() ? L.localDeletePaymentMode(bookId, id) : _apiDeletePaymentMode(bookId, id);

export const apiReorderPaymentModes = (bookId, orderedIds) =>
  _apiReorderPaymentModes(bookId, orderedIds);

export const apiGetPaymentModeEntries = (bookId, id) =>
  useLocalDb() ? L.localGetPaymentModeEntries(bookId, id) : _apiGetPaymentModeEntries(bookId, id);
