/**
 * Data source router — local-first, cloud-mirror architecture.
 *
 * Golden rule: Internet is NEVER required for any CRUD operation.
 * Local SQLite is the primary store for ALL users. Cloud sync is a background
 * mirror for paid/superadmin users, driven entirely through a durable write
 * outbox (sync_outbox) that the AutoSyncMonitor (app/_layout.jsx) drains on
 * reconnect and app-foreground.
 *
 * Read routing (ALL tiers):
 *   Always → local SQLite (instant, works offline/online, no network check)
 *
 * Write routing:
 *   Free tier          → local SQLite only (never touches cloud)
 *   Paid / Superadmin  → local SQLite first (instant, returned to caller), THEN
 *                        ALWAYS enqueue an outbox row (online or offline). The
 *                        outbox carries the LOCAL row id so the cloud create uses
 *                        the SAME id — update/delete by id then work everywhere.
 *
 * Shared-id model: the client UUID (localDb.newId()) is the primary key in BOTH
 * SQLite and Postgres. There is no local→cloud id mapping any more — the id IS
 * the cloud id. (The books.cloud_id column is kept only for back-compat.)
 */

import { useAuthStore } from '../store/authStore';
import { DEV_TIER, DEV_OVERRIDE_LOCAL } from './devConfig';
import * as L from './localDb';

/**
 * Returns true when this user/session should mirror writes to the cloud.
 * NOTE: this is tier-only — it does NOT check connectivity. Writes are queued
 * in the outbox whether online or offline; the AutoSyncMonitor drains them when
 * a connection is available. Never used to block a local write.
 *   - Must be paid tier or superadmin
 *   - DEV_OVERRIDE_LOCAL disables cloud mirroring for testing
 */
function shouldBackupToCloud() {
  if (DEV_OVERRIDE_LOCAL) return false;
  const state = useAuthStore.getState();
  if (state.user?.role === 'superadmin') return true;
  const tier = DEV_TIER ?? state.user?.subscription_tier ?? 'free';
  return tier !== 'free';
}

/**
 * Given a local book id, return the id to send to the backend. Since the id is
 * shared between local and cloud now, this is the identity function — kept so
 * the sharing hooks (useSharing.js) keep working unchanged.
 */
export async function resolveCloudBookId(localId) {
  return localId;
}

// ── Books ──────────────────────────────────────────────────────────────────────

// Reads always come from local SQLite regardless of tier or connectivity.
export const apiGetBooks = () => L.localGetBooks();

export const apiCreateBook = async (name, cur) => {
  const localBook = await L.localCreateBook(name, cur);

  if (shouldBackupToCloud()) {
    // Push the book with its shared id, then push the locally-seeded default
    // payment modes (the cloud seed trigger was removed in migration 012).
    await L.localEnqueueOutbox('create', 'book', localBook.id, localBook.id, {
      id: localBook.id, name: localBook.name, currency: localBook.currency ?? cur ?? 'PKR',
    });
    const modes = await L.localGetPaymentModes(localBook.id).catch(() => []);
    for (const m of modes) {
      await L.localEnqueueOutbox('create', 'payment_mode', m.id, localBook.id, { id: m.id, name: m.name });
    }
  }

  return localBook;
};

export const apiUpdateBook = async (id, p) => {
  const result = await L.localUpdateBook(id, p);
  if (shouldBackupToCloud()) {
    await L.localEnqueueOutbox('update', 'book', id, id, p);
  }
  return result;
};

export const apiDeleteBook = async (id) => {
  await L.localDeleteBook(id);
  if (shouldBackupToCloud()) {
    await L.localEnqueueOutbox('delete', 'book', id, id, null);
  }
};

export const apiUpdateBookFieldSettings = async (id, s) => {
  const result = await L.localUpdateBookFieldSettings(id, s);
  if (shouldBackupToCloud()) {
    await L.localEnqueueOutbox('field_settings', 'book', id, id, s);
  }
  return result;
};

// ── Entries ────────────────────────────────────────────────────────────────────

export const apiGetEntries  = (bookId, params) => L.localGetEntries(bookId, params);
export const apiGetSummary  = (bookId)          => L.localGetSummary(bookId);

export const apiCreateEntry = async (bookId, p) => {
  const localEntry = await L.localCreateEntry(bookId, p);
  if (shouldBackupToCloud()) {
    // Send the shared id; null the local FK ids (the cloud resolves its own FKs,
    // but the text snapshots category/contact_name/payment_mode are preserved).
    await L.localEnqueueOutbox('create', 'entry', localEntry.id, bookId, {
      id:              localEntry.id,
      type:            p.type,
      amount:          p.amount,
      remark:          p.remark ?? null,
      category:        p.category ?? null,
      category_id:     null,
      payment_mode:    p.payment_mode ?? 'cash',
      payment_mode_id: null,
      contact_name:    p.contact_name ?? null,
      customer_id:     null,
      supplier_id:     null,
      entry_date:      p.entry_date,
      entry_time:      p.entry_time ?? '00:00',
      attachment_url:      p.attachment_url ?? null,
      attachment_path:     p.attachment_path ?? null,
      attachment_provider: p.attachment_provider ?? null,
    });
  }
  return localEntry;
};

export const apiUpdateEntry = async (bookId, id, p) => {
  const result = await L.localUpdateEntry(bookId, id, p);
  if (shouldBackupToCloud()) {
    await L.localEnqueueOutbox('update', 'entry', id, bookId, p);
  }
  return result;
};

export const apiDeleteEntry = async (bookId, id) => {
  await L.localDeleteEntry(bookId, id);
  if (shouldBackupToCloud()) {
    await L.localEnqueueOutbox('delete', 'entry', id, bookId, null);
  }
};

export const apiDeleteAllEntries = async (bookId) => {
  // Capture ids BEFORE wiping so each cloud delete targets the shared id.
  let entryIds = [];
  if (shouldBackupToCloud()) {
    entryIds = (await L.localGetEntries(bookId).catch(() => [])).map(e => e.id);
  }
  await L.localDeleteAllEntries(bookId);
  if (shouldBackupToCloud()) {
    for (const eid of entryIds) {
      await L.localEnqueueOutbox('delete', 'entry', eid, bookId, null);
    }
  }
};

// ── Categories ─────────────────────────────────────────────────────────────────

export const apiGetCategories      = (bookId)     => L.localGetCategories(bookId);
export const apiGetCategoryEntries = (bookId, id) => L.localGetCategoryEntries(bookId, id);

export const apiCreateCategory = async (bookId, payload) => {
  const name   = typeof payload === 'object' ? payload.name : payload;
  const result = await L.localCreateCategory(bookId, name);
  if (shouldBackupToCloud()) {
    await L.localEnqueueOutbox('create', 'category', result.id, bookId, { id: result.id, name });
  }
  return result;
};

export const apiUpdateCategory = async (bookId, id, p) => {
  const result = await L.localUpdateCategory(bookId, id, p);
  if (shouldBackupToCloud()) {
    await L.localEnqueueOutbox('update', 'category', id, bookId, p);
  }
  return result;
};

export const apiDeleteCategory = async (bookId, id) => {
  await L.localDeleteCategory(bookId, id);
  if (shouldBackupToCloud()) {
    await L.localEnqueueOutbox('delete', 'category', id, bookId, null);
  }
};

export const apiReorderCategories = async (bookId, orderedIds) => {
  const result = await L.localReorderCategories(bookId, orderedIds);
  if (shouldBackupToCloud()) {
    await L.localEnqueueOutbox('reorder', 'category', null, bookId, { ordered_ids: orderedIds });
  }
  return result;
};

// ── Customers ──────────────────────────────────────────────────────────────────

export const apiGetCustomers       = (bookId)     => L.localGetCustomers(bookId);
export const apiGetCustomer        = (bookId, id) => L.localGetCustomer(bookId, id);
export const apiGetCustomerEntries = (bookId, id) => L.localGetCustomerEntries(bookId, id);

export const apiCreateCustomer = async (bookId, p) => {
  const result = await L.localCreateCustomer(bookId, p);
  if (shouldBackupToCloud()) {
    await L.localEnqueueOutbox('create', 'customer', result.id, bookId, { ...p, id: result.id });
  }
  return result;
};

export const apiUpdateCustomer = async (bookId, id, p) => {
  const result = await L.localUpdateCustomer(bookId, id, p);
  if (shouldBackupToCloud()) {
    await L.localEnqueueOutbox('update', 'customer', id, bookId, p);
  }
  return result;
};

export const apiDeleteCustomer = async (bookId, id) => {
  await L.localDeleteCustomer(bookId, id);
  if (shouldBackupToCloud()) {
    await L.localEnqueueOutbox('delete', 'customer', id, bookId, null);
  }
};

export const apiReorderCustomers = async (bookId, orderedIds) => {
  const result = await L.localReorderCustomers(bookId, orderedIds);
  if (shouldBackupToCloud()) {
    await L.localEnqueueOutbox('reorder', 'customer', null, bookId, { ordered_ids: orderedIds });
  }
  return result;
};

// ── Suppliers ──────────────────────────────────────────────────────────────────

export const apiGetSuppliers       = (bookId)     => L.localGetSuppliers(bookId);
export const apiGetSupplier        = (bookId, id) => L.localGetSupplier(bookId, id);
export const apiGetSupplierEntries = (bookId, id) => L.localGetSupplierEntries(bookId, id);

export const apiCreateSupplier = async (bookId, p) => {
  const result = await L.localCreateSupplier(bookId, p);
  if (shouldBackupToCloud()) {
    await L.localEnqueueOutbox('create', 'supplier', result.id, bookId, { ...p, id: result.id });
  }
  return result;
};

export const apiUpdateSupplier = async (bookId, id, p) => {
  const result = await L.localUpdateSupplier(bookId, id, p);
  if (shouldBackupToCloud()) {
    await L.localEnqueueOutbox('update', 'supplier', id, bookId, p);
  }
  return result;
};

export const apiDeleteSupplier = async (bookId, id) => {
  await L.localDeleteSupplier(bookId, id);
  if (shouldBackupToCloud()) {
    await L.localEnqueueOutbox('delete', 'supplier', id, bookId, null);
  }
};

export const apiReorderSuppliers = async (bookId, orderedIds) => {
  const result = await L.localReorderSuppliers(bookId, orderedIds);
  if (shouldBackupToCloud()) {
    await L.localEnqueueOutbox('reorder', 'supplier', null, bookId, { ordered_ids: orderedIds });
  }
  return result;
};

// ── Payment Modes ──────────────────────────────────────────────────────────────

export const apiGetPaymentModes       = (bookId)     => L.localGetPaymentModes(bookId);
export const apiGetPaymentModeEntries = (bookId, id) => L.localGetPaymentModeEntries(bookId, id);

export const apiCreatePaymentMode = async (bookId, p) => {
  const name   = typeof p === 'object' ? p.name : p;
  const result = await L.localCreatePaymentMode(bookId, name);
  if (shouldBackupToCloud()) {
    await L.localEnqueueOutbox('create', 'payment_mode', result.id, bookId, { id: result.id, name });
  }
  return result;
};

export const apiUpdatePaymentMode = async (bookId, id, p) => {
  const result = await L.localUpdatePaymentMode(bookId, id, p);
  if (shouldBackupToCloud()) {
    await L.localEnqueueOutbox('update', 'payment_mode', id, bookId, p);
  }
  return result;
};

export const apiDeletePaymentMode = async (bookId, id) => {
  await L.localDeletePaymentMode(bookId, id);
  if (shouldBackupToCloud()) {
    await L.localEnqueueOutbox('delete', 'payment_mode', id, bookId, null);
  }
};

export const apiReorderPaymentModes = async (bookId, orderedIds) => {
  const result = await L.localReorderPaymentModes(bookId, orderedIds);
  if (shouldBackupToCloud()) {
    await L.localEnqueueOutbox('reorder', 'payment_mode', null, bookId, { ordered_ids: orderedIds });
  }
  return result;
};
