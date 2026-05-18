/**
 * Data source router.
 *
 * Free tier + online  → local SQLite only   (no cloud)
 * Paid tier + online  → cloud API
 * Any tier + offline  → local SQLite (writes queued; auto-syncs when online)
 *
 * Exports the same function names as api.js so callers only need to
 * change one import path: `from '../lib/api'` → `from '../lib/dataSource'`
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
  apiGetPaymentModeEntries as _apiGetPaymentModeEntries,
} from './api';

/**
 * Returns true when the app should read/write from local SQLite.
 * Conditions:
 *   - User is on the free tier (always local), OR
 *   - User is on a paid tier but the device is currently offline.
 */
function useLocalDb() {
  const tier     = useAuthStore.getState().subscription_tier ?? 'free';
  const isOnline = useSyncStore.getState().isOnline;
  return tier === 'free' || !isOnline;
}

// ── Books ──────────────────────────────────────────────────────────────────────

export const apiGetBooks                = ()          => useLocalDb() ? Promise.resolve(L.localGetBooks())                     : _apiGetBooks();
export const apiCreateBook              = (name, cur) => useLocalDb() ? Promise.resolve(L.localCreateBook(name, cur))          : _apiCreateBook(name, cur);
export const apiUpdateBook              = (id, p)     => useLocalDb() ? Promise.resolve(L.localUpdateBook(id, p))              : _apiUpdateBook(id, p);
export const apiDeleteBook              = (id)        => useLocalDb() ? Promise.resolve(L.localDeleteBook(id))                 : _apiDeleteBook(id);
export const apiUpdateBookFieldSettings = (id, s)     => useLocalDb() ? Promise.resolve(L.localUpdateBookFieldSettings(id, s)) : _apiUpdateBookFieldSettings(id, s);

// ── Entries ────────────────────────────────────────────────────────────────────

export const apiGetEntries       = (bookId, params) => useLocalDb() ? Promise.resolve(L.localGetEntries(bookId, params))    : _apiGetEntries(bookId, params);
export const apiGetSummary       = (bookId)         => useLocalDb() ? Promise.resolve(L.localGetSummary(bookId))            : _apiGetSummary(bookId);
export const apiCreateEntry      = (bookId, p)      => useLocalDb() ? Promise.resolve(L.localCreateEntry(bookId, p))        : _apiCreateEntry(bookId, p);
export const apiUpdateEntry      = (bookId, id, p)  => useLocalDb() ? Promise.resolve(L.localUpdateEntry(bookId, id, p))    : _apiUpdateEntry(bookId, id, p);
export const apiDeleteEntry      = (bookId, id)     => useLocalDb() ? Promise.resolve(L.localDeleteEntry(bookId, id))       : _apiDeleteEntry(bookId, id);
export const apiDeleteAllEntries = (bookId)         => useLocalDb() ? Promise.resolve(L.localDeleteAllEntries(bookId))      : _apiDeleteAllEntries(bookId);

// ── Categories ─────────────────────────────────────────────────────────────────

export const apiGetCategories      = (bookId)        => useLocalDb() ? Promise.resolve(L.localGetCategories(bookId))          : _apiGetCategories(bookId);
export const apiCreateCategory     = (bookId, payload) => useLocalDb() ? L.localCreateCategory(bookId, typeof payload === 'object' ? payload.name : payload) : _apiCreateCategory(bookId, payload);
export const apiUpdateCategory     = (bookId, id, p) => useLocalDb() ? Promise.resolve(L.localUpdateCategory(bookId, id, p))  : _apiUpdateCategory(bookId, id, p);
export const apiDeleteCategory     = (bookId, id)    => useLocalDb() ? Promise.resolve(L.localDeleteCategory(bookId, id))     : _apiDeleteCategory(bookId, id);
export const apiGetCategoryEntries = (bookId, id)    => useLocalDb() ? Promise.resolve(L.localGetCategoryEntries(bookId, id)) : _apiGetCategoryEntries(bookId, id);

// ── Customers ──────────────────────────────────────────────────────────────────

export const apiGetCustomers       = (bookId)        => useLocalDb() ? Promise.resolve(L.localGetCustomers(bookId))           : _apiGetCustomers(bookId);
export const apiCreateCustomer     = (bookId, p)     => useLocalDb() ? Promise.resolve(L.localCreateCustomer(bookId, p))      : _apiCreateCustomer(bookId, p);
export const apiGetCustomer        = (bookId, id)    => useLocalDb() ? Promise.resolve(L.localGetCustomer(bookId, id))        : _apiGetCustomer(bookId, id);
export const apiUpdateCustomer     = (bookId, id, p) => useLocalDb() ? Promise.resolve(L.localUpdateCustomer(bookId, id, p))  : _apiUpdateCustomer(bookId, id, p);
export const apiDeleteCustomer     = (bookId, id)    => useLocalDb() ? Promise.resolve(L.localDeleteCustomer(bookId, id))     : _apiDeleteCustomer(bookId, id);
export const apiGetCustomerEntries = (bookId, id)    => useLocalDb() ? Promise.resolve(L.localGetCustomerEntries(bookId, id)) : _apiGetCustomerEntries(bookId, id);

// ── Suppliers ──────────────────────────────────────────────────────────────────

export const apiGetSuppliers       = (bookId)        => useLocalDb() ? Promise.resolve(L.localGetSuppliers(bookId))           : _apiGetSuppliers(bookId);
export const apiCreateSupplier     = (bookId, p)     => useLocalDb() ? Promise.resolve(L.localCreateSupplier(bookId, p))      : _apiCreateSupplier(bookId, p);
export const apiGetSupplier        = (bookId, id)    => useLocalDb() ? Promise.resolve(L.localGetSupplier(bookId, id))        : _apiGetSupplier(bookId, id);
export const apiUpdateSupplier     = (bookId, id, p) => useLocalDb() ? Promise.resolve(L.localUpdateSupplier(bookId, id, p))  : _apiUpdateSupplier(bookId, id, p);
export const apiDeleteSupplier     = (bookId, id)    => useLocalDb() ? Promise.resolve(L.localDeleteSupplier(bookId, id))     : _apiDeleteSupplier(bookId, id);
export const apiGetSupplierEntries = (bookId, id)    => useLocalDb() ? Promise.resolve(L.localGetSupplierEntries(bookId, id)) : _apiGetSupplierEntries(bookId, id);

// ── Payment Modes ──────────────────────────────────────────────────────────────

export const apiGetPaymentModes       = (bookId)        => useLocalDb() ? Promise.resolve(L.localGetPaymentModes(bookId))             : _apiGetPaymentModes(bookId);
export const apiCreatePaymentMode     = (bookId, p)     => useLocalDb() ? L.localCreatePaymentMode(bookId, typeof p === 'object' ? p.name : p) : _apiCreatePaymentMode(bookId, p);
export const apiUpdatePaymentMode     = (bookId, id, p) => useLocalDb() ? Promise.resolve(L.localUpdatePaymentMode(bookId, id, p))    : _apiUpdatePaymentMode(bookId, id, p);
export const apiDeletePaymentMode     = (bookId, id)    => useLocalDb() ? Promise.resolve(L.localDeletePaymentMode(bookId, id))       : _apiDeletePaymentMode(bookId, id);
export const apiGetPaymentModeEntries = (bookId, id)    => useLocalDb() ? Promise.resolve(L.localGetPaymentModeEntries(bookId, id))   : _apiGetPaymentModeEntries(bookId, id);
