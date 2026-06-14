/**
 * Web implementation of the local store — IndexedDB-backed.
 *
 * Metro resolves this file on web instead of localDb.js (which imports
 * expo-sqlite). expo-sqlite's web/WASM build is alpha (per the SDK 54 docs) and
 * requires app-wide COOP/COEP headers to use SharedArrayBuffer — those headers
 * would break this app's cross-origin Supabase / Google Sign-In / backend
 * traffic, and there is an open SDK 54 bug (expo/expo#39903) where
 * openDatabaseAsync fails in the browser. So web gets its own persistent store.
 *
 * This mirrors EVERY export of localDb.js with identical names, signatures,
 * argument shapes and return shapes — including the sync outbox, the delta-pull
 * appliers, soft-delete semantics, balance recompute, default Cash/Cheque
 * seeding on book create, and the cloud-id bridge. Reads exclude rows with a
 * non-null deleted_at exactly like the SQLite path. Data persists across reloads
 * in IndexedDB (one object store per table).
 *
 * NOTE: where localDb.js stores booleans as 0/1 (SQLite has no bool), this store
 * keeps the same 0/1 integers so callers (which do `!!r.show_customer`,
 * `r.net_balance ?? 0`, etc.) behave identically.
 */

import { useAuthStore } from '../store/authStore';

// ── IndexedDB plumbing ──────────────────────────────────────────────────────────

const DB_NAME = 'cashbook_local';
const DB_VERSION = 1;

// keyPath stores. sync_outbox uses an auto-incrementing `seq` to mirror the
// SQLite AUTOINCREMENT primary key.
const STORES = {
  books:         { keyPath: 'id' },
  entries:       { keyPath: 'id' },
  categories:    { keyPath: 'id' },
  customers:     { keyPath: 'id' },
  suppliers:     { keyPath: 'id' },
  payment_modes: { keyPath: 'id' },
  sync_outbox:   { keyPath: 'seq', autoIncrement: true },
};

let _dbPromise = null;

function getDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, opts] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, opts);
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Read every row of one or more stores. Returns { storeName: rows[] }.
async function readAll(storeNames) {
  const db = await getDb();
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  const tx = db.transaction(names, 'readonly');
  const out = {};
  await Promise.all(
    names.map(async (n) => { out[n] = await reqToPromise(tx.objectStore(n).getAll()); }),
  );
  await txDone(tx);
  return Array.isArray(storeNames) ? out : out[storeNames];
}

// Run a writer fn(stores) inside one readwrite transaction. `stores` maps store
// name → IDBObjectStore. Resolves once the transaction commits.
async function write(storeNames, fn) {
  const db = await getDb();
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  const tx = db.transaction(names, 'readwrite');
  const stores = {};
  for (const n of names) stores[n] = tx.objectStore(n);
  const result = await fn(stores);
  await txDone(tx);
  return result;
}

// ── Internal helpers (mirror localDb.js) ─────────────────────────────────────────

function currentUserId() {
  return useAuthStore.getState().user?.id ?? 'local';
}

function newId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function now() {
  return new Date().toISOString();
}

const LIVE = (r) => !r.deleted_at;

async function getAllRows(store) {
  return readAll(store);
}

async function getById(store, id) {
  const db = await getDb();
  const tx = db.transaction(store, 'readonly');
  const row = await reqToPromise(tx.objectStore(store).get(id));
  await txDone(tx);
  return row ?? null;
}

function sumInOut(rows) {
  let ti = 0;
  let to = 0;
  for (const r of rows) {
    if (r.type === 'in') ti += r.amount;
    else if (r.type === 'out') to += r.amount;
  }
  return { ti, to };
}

// Sort that mirrors SQLite's `ORDER BY x DESC` (stable, string/number compare).
function cmpDesc(field) {
  return (a, b) => {
    const av = a[field] ?? '';
    const bv = b[field] ?? '';
    if (av < bv) return 1;
    if (av > bv) return -1;
    return 0;
  };
}
function cmpAsc(field) {
  return (a, b) => {
    const av = a[field] ?? 0;
    const bv = b[field] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
  };
}

// ── Balance recompute (operate on already-open stores within a transaction) ──────

async function recomputeBookBalance(stores, bookId) {
  const all = await reqToPromise(stores.entries.getAll());
  const live = all.filter((e) => e.book_id === bookId && LIVE(e));
  const { ti, to } = sumInOut(live);
  const net = ti - to;
  // last entry by (entry_date, entry_time) desc
  let last = null;
  for (const e of live) {
    const key = `${e.entry_date} ${e.entry_time}`;
    if (!last || key > `${last.entry_date} ${last.entry_time}`) last = e;
  }
  const book = await reqToPromise(stores.books.get(bookId));
  if (book) {
    book.net_balance = net;
    book.last_entry_at = last?.created_at ?? null;
    book.updated_at = now();
    await reqToPromise(stores.books.put(book));
  }
}

// Recompute totals for a row identified by (book_id, name) in a balance table,
// summing over entries that match `matchField === name`.
async function recomputeAggBalance(stores, table, entriesMatchField, bookId, name) {
  if (!name) return;
  const allEntries = await reqToPromise(stores.entries.getAll());
  const matched = allEntries.filter(
    (e) => e.book_id === bookId && e[entriesMatchField] === name && LIVE(e),
  );
  const { ti, to } = sumInOut(matched);
  const rows = await reqToPromise(stores[table].getAll());
  for (const row of rows) {
    if (row.book_id === bookId && row.name === name) {
      row.total_in = ti;
      row.total_out = to;
      row.net_balance = ti - to;
      await reqToPromise(stores[table].put(row));
    }
  }
}

const recomputeCategoryBalance = (stores, bookId, name) =>
  recomputeAggBalance(stores, 'categories', 'category', bookId, name);
const recomputeContactBalance = (stores, bookId, name, table) =>
  recomputeAggBalance(stores, table, 'contact_name', bookId, name);
const recomputePaymentModeBalance = (stores, bookId, name) =>
  recomputeAggBalance(stores, 'payment_modes', 'payment_mode', bookId, name);

// ── Books ──────────────────────────────────────────────────────────────────────

export async function localGetBooks() {
  const uid = currentUserId();
  const rows = (await getAllRows('books'))
    .filter((r) => r.user_id === uid && LIVE(r))
    .sort((a, b) => {
      // ORDER BY updated_at DESC, created_at DESC
      const ua = a.updated_at ?? '';
      const ub = b.updated_at ?? '';
      if (ua !== ub) return ua < ub ? 1 : -1;
      const ca = a.created_at ?? '';
      const cb = b.created_at ?? '';
      return ca < cb ? 1 : ca > cb ? -1 : 0;
    });
  return rows.map((r) => ({
    ...r,
    show_customer:   !!r.show_customer,
    show_supplier:   !!r.show_supplier,
    show_category:   !!r.show_category,
    show_attachment: !!r.show_attachment,
  }));
}

export async function localCreateBook(name, currency = 'PKR', id = newId()) {
  const ts = now();
  const uid = currentUserId();
  const book = {
    id,
    user_id: uid,
    name,
    currency,
    net_balance: 0,
    show_customer: 1,
    show_supplier: 1,
    show_category: 1,
    show_attachment: 1,
    created_at: ts,
    updated_at: ts,
    last_entry_at: null,
    cloud_id: null,
    deleted_at: null,
  };
  await write(['books', 'payment_modes'], async (stores) => {
    await reqToPromise(stores.books.put(book));
    // Client owns default payment modes; seed Cash + Cheque (INSERT OR IGNORE:
    // skip if a mode with the same (book_id, name) already exists).
    const existing = (await reqToPromise(stores.payment_modes.getAll())).filter(
      (m) => m.book_id === id,
    );
    for (const modeName of ['Cash', 'Cheque']) {
      const dup = existing.some((m) => m.name === modeName);
      if (dup) continue;
      await reqToPromise(
        stores.payment_modes.put({
          id: newId(),
          book_id: id,
          user_id: uid,
          name: modeName,
          total_in: 0,
          total_out: 0,
          net_balance: 0,
          display_order: 0,
          created_at: ts,
          updated_at: ts,
          deleted_at: null,
        }),
      );
    }
  });
  return getById('books', id);
}

export async function localUpdateBook(bookId, payload) {
  await write('books', async (stores) => {
    const book = await reqToPromise(stores.books.get(bookId));
    if (!book) return;
    let changed = false;
    if (payload.name !== undefined)     { book.name = payload.name; changed = true; }
    if (payload.currency !== undefined) { book.currency = payload.currency; changed = true; }
    if (changed) {
      book.updated_at = now();
      await reqToPromise(stores.books.put(book));
    }
  });
  return getById('books', bookId);
}

export async function localDeleteBook(bookId) {
  const ts = now();
  // Soft delete the book and cascade-soft-delete its children.
  const childStores = ['entries', 'categories', 'customers', 'suppliers', 'payment_modes'];
  await write(['books', ...childStores], async (stores) => {
    const book = await reqToPromise(stores.books.get(bookId));
    if (book) {
      book.deleted_at = ts;
      book.updated_at = ts;
      await reqToPromise(stores.books.put(book));
    }
    for (const table of childStores) {
      const rows = await reqToPromise(stores[table].getAll());
      for (const r of rows) {
        if (r.book_id === bookId) {
          r.deleted_at = ts;
          r.updated_at = ts;
          await reqToPromise(stores[table].put(r));
        }
      }
    }
  });
}

export async function localUpdateBookFieldSettings(bookId, settings) {
  await write('books', async (stores) => {
    const book = await reqToPromise(stores.books.get(bookId));
    if (!book) return;
    book.show_customer   = settings.showCustomer   ? 1 : 0;
    book.show_supplier   = settings.showSupplier   ? 1 : 0;
    book.show_category   = settings.showCategory   ? 1 : 0;
    book.show_attachment = settings.showAttachment ? 1 : 0;
    book.updated_at = now();
    await reqToPromise(stores.books.put(book));
  });
}

// ── Entries ────────────────────────────────────────────────────────────────────

export async function localGetEntries(bookId, params = {}) {
  let rows = (await getAllRows('entries')).filter((r) => r.book_id === bookId && LIVE(r));
  if (params.date_from) rows = rows.filter((r) => r.entry_date >= params.date_from);
  if (params.date_to)   rows = rows.filter((r) => r.entry_date <= params.date_to);
  if (params.type)      rows = rows.filter((r) => r.type === params.type);
  // ORDER BY entry_date DESC, entry_time DESC, created_at DESC
  rows.sort((a, b) => {
    if (a.entry_date !== b.entry_date) return a.entry_date < b.entry_date ? 1 : -1;
    if (a.entry_time !== b.entry_time) return a.entry_time < b.entry_time ? 1 : -1;
    const ca = a.created_at ?? '';
    const cb = b.created_at ?? '';
    return ca < cb ? 1 : ca > cb ? -1 : 0;
  });
  return rows;
}

export async function localGetSummary(bookId) {
  // Mirrors localDb.js: this query does NOT exclude deleted_at.
  const rows = (await getAllRows('entries')).filter((r) => r.book_id === bookId);
  const { ti, to } = sumInOut(rows);
  return { total_in: ti, total_out: to, net_balance: ti - to };
}

export async function localCreateEntry(bookId, payload) {
  const id = payload.id ?? newId();
  const ts = now();
  const entry = {
    id,
    book_id: bookId,
    user_id: currentUserId(),
    type: payload.type,
    amount: payload.amount,
    remark: payload.remark ?? null,
    category: payload.category ?? null,
    category_id: payload.category_id ?? null,
    payment_mode: payload.payment_mode ?? 'cash',
    payment_mode_id: payload.payment_mode_id ?? null,
    contact_name: payload.contact_name ?? null,
    customer_id: payload.customer_id ?? null,
    supplier_id: payload.supplier_id ?? null,
    entry_date: payload.entry_date,
    entry_time: payload.entry_time ?? '00:00',
    attachment_url: payload.attachment_url ?? null,
    attachment_path: payload.attachment_path ?? null,
    attachment_provider: payload.attachment_provider ?? null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  };
  await write(['entries', 'books', 'categories', 'customers', 'suppliers', 'payment_modes'], async (stores) => {
    await reqToPromise(stores.entries.put(entry));
    await recomputeBookBalance(stores, bookId);
    await recomputeCategoryBalance(stores, bookId, payload.category);
    await recomputeContactBalance(stores, bookId, payload.contact_name, 'customers');
    await recomputeContactBalance(stores, bookId, payload.contact_name, 'suppliers');
    await recomputePaymentModeBalance(stores, bookId, payload.payment_mode);
  });
  return getById('entries', id);
}

export async function localUpdateEntry(bookId, entryId, payload) {
  await write(['entries', 'books', 'categories', 'customers', 'suppliers', 'payment_modes'], async (stores) => {
    const old = await reqToPromise(stores.entries.get(entryId));
    const entry = old ? { ...old } : null;
    if (entry) {
      let changed = false;
      for (const k of ['type', 'amount', 'remark', 'category', 'category_id', 'payment_mode', 'payment_mode_id', 'contact_name', 'customer_id', 'supplier_id', 'entry_date', 'entry_time', 'attachment_url', 'attachment_path', 'attachment_provider']) {
        if (payload[k] !== undefined) { entry[k] = payload[k]; changed = true; }
      }
      if (changed) {
        entry.updated_at = now();
        await reqToPromise(stores.entries.put(entry));
      }
    }
    await recomputeBookBalance(stores, bookId);
    for (const cat of new Set([old?.category, payload.category].filter(Boolean))) {
      await recomputeCategoryBalance(stores, bookId, cat);
    }
    for (const name of new Set([old?.contact_name, payload.contact_name].filter(Boolean))) {
      await recomputeContactBalance(stores, bookId, name, 'customers');
      await recomputeContactBalance(stores, bookId, name, 'suppliers');
    }
    for (const mode of new Set([old?.payment_mode, payload.payment_mode].filter(Boolean))) {
      await recomputePaymentModeBalance(stores, bookId, mode);
    }
  });
  return getById('entries', entryId);
}

export async function localDeleteEntry(bookId, entryId) {
  await write(['entries', 'books', 'categories', 'customers', 'suppliers', 'payment_modes'], async (stores) => {
    const old = await reqToPromise(stores.entries.get(entryId));
    await reqToPromise(stores.entries.delete(entryId));
    await recomputeBookBalance(stores, bookId);
    await recomputeCategoryBalance(stores, bookId, old?.category);
    await recomputeContactBalance(stores, bookId, old?.contact_name, 'customers');
    await recomputeContactBalance(stores, bookId, old?.contact_name, 'suppliers');
    await recomputePaymentModeBalance(stores, bookId, old?.payment_mode);
  });
}

export async function localDeleteAllEntries(bookId) {
  const ts = now();
  await write(['entries', 'books', 'categories', 'customers', 'suppliers', 'payment_modes'], async (stores) => {
    const entries = await reqToPromise(stores.entries.getAll());
    for (const e of entries) {
      if (e.book_id === bookId) await reqToPromise(stores.entries.delete(e.id));
    }
    const book = await reqToPromise(stores.books.get(bookId));
    if (book) {
      book.net_balance = 0;
      book.last_entry_at = null;
      book.updated_at = ts;
      await reqToPromise(stores.books.put(book));
    }
    for (const table of ['categories', 'customers', 'suppliers', 'payment_modes']) {
      const rows = await reqToPromise(stores[table].getAll());
      for (const r of rows) {
        if (r.book_id === bookId) {
          r.total_in = 0;
          r.total_out = 0;
          r.net_balance = 0;
          await reqToPromise(stores[table].put(r));
        }
      }
    }
  });
}

// ── Categories ─────────────────────────────────────────────────────────────────

export async function localGetCategories(bookId) {
  return (await getAllRows('categories'))
    .filter((r) => r.book_id === bookId && LIVE(r))
    .sort((a, b) => cmpAsc('display_order')(a, b) || cmpAsc('created_at')(a, b));
}

export async function localCreateCategory(bookId, name, id = newId()) {
  const existing = (await getAllRows('categories')).find(
    (r) => r.book_id === bookId && (r.name ?? '').toLowerCase() === name.toLowerCase() && LIVE(r),
  );
  if (existing) throw Object.assign(new Error('Category already exists'), { status: 409 });
  const ts = now();
  await write('categories', async (stores) => {
    await reqToPromise(stores.categories.put({
      id, book_id: bookId, user_id: currentUserId(), name,
      total_in: 0, total_out: 0, net_balance: 0, display_order: 0,
      created_at: ts, updated_at: ts, deleted_at: null,
    }));
  });
  return getById('categories', id);
}

export async function localUpdateCategory(bookId, categoryId, payload) {
  if (payload.name !== undefined) {
    await write('categories', async (stores) => {
      const cat = await reqToPromise(stores.categories.get(categoryId));
      if (cat) {
        cat.name = payload.name;
        cat.updated_at = now();
        await reqToPromise(stores.categories.put(cat));
      }
    });
  }
  return getById('categories', categoryId);
}

export async function localDeleteCategory(bookId, categoryId) {
  const ts = now();
  await write(['categories', 'entries'], async (stores) => {
    const cat = await reqToPromise(stores.categories.get(categoryId));
    if (cat) {
      const entries = await reqToPromise(stores.entries.getAll());
      for (const e of entries) {
        if (e.book_id === bookId && e.category === cat.name) {
          e.category = null;
          e.category_id = null;
          e.updated_at = now();
          await reqToPromise(stores.entries.put(e));
        }
      }
      cat.deleted_at = ts;
      cat.updated_at = ts;
      await reqToPromise(stores.categories.put(cat));
    }
  });
}

export async function localGetCategoryEntries(bookId, categoryId) {
  const cat = await getById('categories', categoryId);
  if (!cat) return [];
  return (await getAllRows('entries'))
    .filter((r) => r.book_id === bookId && r.category === cat.name && LIVE(r))
    .sort(cmpDesc('entry_date'));
}

// ── Customers ──────────────────────────────────────────────────────────────────

export async function localGetCustomers(bookId) {
  return (await getAllRows('customers'))
    .filter((r) => r.book_id === bookId && LIVE(r))
    .sort((a, b) => cmpAsc('display_order')(a, b) || cmpAsc('created_at')(a, b))
    .map((r) => ({ ...r, balance: r.net_balance ?? 0 }));
}

export async function localCreateCustomer(bookId, payload) {
  const id = payload.id ?? newId();
  const ts = now();
  await write('customers', async (stores) => {
    await reqToPromise(stores.customers.put({
      id, book_id: bookId, user_id: currentUserId(), name: payload.name,
      phone: payload.phone ?? null, email: payload.email ?? null, address: payload.address ?? null,
      total_in: 0, total_out: 0, net_balance: 0, display_order: 0,
      created_at: ts, updated_at: ts, deleted_at: null,
    }));
  });
  return getById('customers', id);
}

export async function localGetCustomer(bookId, customerId) {
  const row = await getById('customers', customerId);
  if (!row || row.book_id !== bookId || !LIVE(row)) return null;
  return { ...row, balance: row.net_balance ?? 0 };
}

export async function localUpdateCustomer(bookId, customerId, payload) {
  await write('customers', async (stores) => {
    const row = await reqToPromise(stores.customers.get(customerId));
    if (!row) return;
    let changed = false;
    for (const k of ['name', 'phone', 'email', 'address']) {
      if (payload[k] !== undefined) { row[k] = payload[k]; changed = true; }
    }
    if (changed) {
      row.updated_at = now();
      await reqToPromise(stores.customers.put(row));
    }
  });
  return getById('customers', customerId);
}

export async function localDeleteCustomer(bookId, customerId) {
  const ts = now();
  await write(['customers', 'entries'], async (stores) => {
    const entries = await reqToPromise(stores.entries.getAll());
    for (const e of entries) {
      if (e.book_id === bookId && e.customer_id === customerId) {
        e.customer_id = null;
        e.updated_at = now();
        await reqToPromise(stores.entries.put(e));
      }
    }
    const row = await reqToPromise(stores.customers.get(customerId));
    if (row) {
      row.deleted_at = ts;
      row.updated_at = ts;
      await reqToPromise(stores.customers.put(row));
    }
  });
}

export async function localGetCustomerEntries(bookId, customerId) {
  const c = await getById('customers', customerId);
  if (!c) return [];
  return (await getAllRows('entries'))
    .filter((r) => r.book_id === bookId && r.contact_name === c.name && LIVE(r))
    .sort(cmpDesc('entry_date'));
}

// ── Suppliers ──────────────────────────────────────────────────────────────────

export async function localGetSuppliers(bookId) {
  return (await getAllRows('suppliers'))
    .filter((r) => r.book_id === bookId && LIVE(r))
    .sort((a, b) => cmpAsc('display_order')(a, b) || cmpAsc('created_at')(a, b))
    .map((r) => ({ ...r, balance: r.net_balance ?? 0 }));
}

export async function localCreateSupplier(bookId, payload) {
  const id = payload.id ?? newId();
  const ts = now();
  await write('suppliers', async (stores) => {
    await reqToPromise(stores.suppliers.put({
      id, book_id: bookId, user_id: currentUserId(), name: payload.name,
      phone: payload.phone ?? null, email: payload.email ?? null, address: payload.address ?? null,
      total_in: 0, total_out: 0, net_balance: 0, display_order: 0,
      created_at: ts, updated_at: ts, deleted_at: null,
    }));
  });
  return getById('suppliers', id);
}

export async function localGetSupplier(bookId, supplierId) {
  const row = await getById('suppliers', supplierId);
  if (!row || row.book_id !== bookId || !LIVE(row)) return null;
  return { ...row, balance: row.net_balance ?? 0 };
}

export async function localUpdateSupplier(bookId, supplierId, payload) {
  await write('suppliers', async (stores) => {
    const row = await reqToPromise(stores.suppliers.get(supplierId));
    if (!row) return;
    let changed = false;
    for (const k of ['name', 'phone', 'email', 'address']) {
      if (payload[k] !== undefined) { row[k] = payload[k]; changed = true; }
    }
    if (changed) {
      row.updated_at = now();
      await reqToPromise(stores.suppliers.put(row));
    }
  });
  return getById('suppliers', supplierId);
}

export async function localDeleteSupplier(bookId, supplierId) {
  const ts = now();
  await write(['suppliers', 'entries'], async (stores) => {
    const entries = await reqToPromise(stores.entries.getAll());
    for (const e of entries) {
      if (e.book_id === bookId && e.supplier_id === supplierId) {
        e.supplier_id = null;
        e.updated_at = now();
        await reqToPromise(stores.entries.put(e));
      }
    }
    const row = await reqToPromise(stores.suppliers.get(supplierId));
    if (row) {
      row.deleted_at = ts;
      row.updated_at = ts;
      await reqToPromise(stores.suppliers.put(row));
    }
  });
}

export async function localGetSupplierEntries(bookId, supplierId) {
  const s = await getById('suppliers', supplierId);
  if (!s) return [];
  return (await getAllRows('entries'))
    .filter((r) => r.book_id === bookId && r.contact_name === s.name && LIVE(r))
    .sort(cmpDesc('entry_date'));
}

// ── Payment Modes ──────────────────────────────────────────────────────────────

export async function localGetPaymentModes(bookId) {
  return (await getAllRows('payment_modes'))
    .filter((r) => r.book_id === bookId && LIVE(r))
    .sort((a, b) => cmpAsc('display_order')(a, b) || cmpAsc('created_at')(a, b));
}

export async function localCreatePaymentMode(bookId, name, id = newId()) {
  const existing = (await getAllRows('payment_modes')).find(
    (r) => r.book_id === bookId && (r.name ?? '').toLowerCase() === name.toLowerCase() && LIVE(r),
  );
  if (existing) throw Object.assign(new Error('Payment mode already exists'), { status: 409 });
  const ts = now();
  await write('payment_modes', async (stores) => {
    await reqToPromise(stores.payment_modes.put({
      id, book_id: bookId, user_id: currentUserId(), name,
      total_in: 0, total_out: 0, net_balance: 0, display_order: 0,
      created_at: ts, updated_at: ts, deleted_at: null,
    }));
  });
  return getById('payment_modes', id);
}

export async function localUpdatePaymentMode(bookId, modeId, payload) {
  if (payload.name !== undefined) {
    await write(['payment_modes', 'entries'], async (stores) => {
      const old = await reqToPromise(stores.payment_modes.get(modeId));
      const mode = old ? { ...old } : null;
      if (mode) {
        mode.name = payload.name;
        mode.updated_at = now();
        await reqToPromise(stores.payment_modes.put(mode));
        if (old?.name && payload.name !== old.name) {
          const entries = await reqToPromise(stores.entries.getAll());
          for (const e of entries) {
            if (e.book_id === bookId && e.payment_mode === old.name) {
              e.payment_mode = payload.name;
              e.updated_at = now();
              await reqToPromise(stores.entries.put(e));
            }
          }
          await recomputePaymentModeBalance(stores, bookId, payload.name);
        }
      }
    });
  }
  return getById('payment_modes', modeId);
}

export async function localDeletePaymentMode(bookId, modeId) {
  const live = (await getAllRows('payment_modes')).filter((r) => r.book_id === bookId && LIVE(r));
  if (live.length <= 1) {
    throw Object.assign(new Error('Cannot delete the last payment mode'), { status: 400 });
  }
  const ts = now();
  await write('payment_modes', async (stores) => {
    const row = await reqToPromise(stores.payment_modes.get(modeId));
    if (row) {
      row.deleted_at = ts;
      row.updated_at = ts;
      await reqToPromise(stores.payment_modes.put(row));
    }
  });
}

export async function localGetPaymentModeEntries(bookId, modeId) {
  const mode = await getById('payment_modes', modeId);
  if (!mode) return [];
  return (await getAllRows('entries'))
    .filter((r) => r.book_id === bookId && r.payment_mode === mode.name && LIVE(r))
    .sort(cmpDesc('entry_date'));
}

// ── Reorder helpers ────────────────────────────────────────────────────────────

async function reorder(store, bookId, orderedIds) {
  await write(store, async (stores) => {
    for (let i = 0; i < orderedIds.length; i++) {
      const row = await reqToPromise(stores[store].get(orderedIds[i]));
      if (row && row.book_id === bookId) {
        row.display_order = i;
        await reqToPromise(stores[store].put(row));
      }
    }
  });
}

export const localReorderCategories   = (bookId, ids) => reorder('categories', bookId, ids);
export const localReorderCustomers    = (bookId, ids) => reorder('customers', bookId, ids);
export const localReorderSuppliers    = (bookId, ids) => reorder('suppliers', bookId, ids);
export const localReorderPaymentModes = (bookId, ids) => reorder('payment_modes', bookId, ids);

// ── Migration helpers ──────────────────────────────────────────────────────────

export async function localGetAllDataForMigration() {
  const userId = currentUserId();
  const all = await readAll(['books', 'entries', 'categories', 'customers', 'suppliers', 'payment_modes']);
  const liveBookIds = new Set(all.books.filter((b) => b.user_id === userId && LIVE(b)).map((b) => b.id));
  const childLive = (rows) => rows.filter((r) => liveBookIds.has(r.book_id) && LIVE(r));
  return {
    books:         all.books.filter((b) => b.user_id === userId && LIVE(b)),
    entries:       all.entries.filter((e) => e.user_id === userId && LIVE(e)),
    categories:    childLive(all.categories),
    customers:     childLive(all.customers),
    suppliers:     childLive(all.suppliers),
    payment_modes: childLive(all.payment_modes),
  };
}

export async function localClearAll() {
  const userId = currentUserId();
  await write(['books', 'entries', 'categories', 'customers', 'suppliers', 'payment_modes', 'sync_outbox'], async (stores) => {
    for (const table of ['entries', 'categories', 'customers', 'suppliers', 'payment_modes', 'books']) {
      const rows = await reqToPromise(stores[table].getAll());
      for (const r of rows) {
        if (r.user_id === userId) await reqToPromise(stores[table].delete(r[STORES[table].keyPath]));
      }
    }
    await reqToPromise(stores.sync_outbox.clear());
  });
}

// ── Cloud-ID bridge ──────────────────────────────────────────────────────────────

export async function localGetBookByCloudId(cloudId) {
  return (await getAllRows('books')).find((b) => b.cloud_id === cloudId) ?? null;
}

export async function localSetBookCloudId(localId, cloudId) {
  await write('books', async (stores) => {
    const book = await reqToPromise(stores.books.get(localId));
    if (book) {
      book.cloud_id = cloudId;
      await reqToPromise(stores.books.put(book));
    }
  });
}

export async function localGetCloudBookId(localId) {
  const book = await getById('books', localId);
  return book?.cloud_id ?? null;
}

// ── Sync outbox ──────────────────────────────────────────────────────────────────

const OUTBOX_ENTITIES = ['book', 'entry', 'category', 'customer', 'supplier', 'payment_mode'];

export async function localEnqueueOutbox(op, entity, entityId, bookId, payload) {
  if (!OUTBOX_ENTITIES.includes(entity)) return;
  await write('sync_outbox', async (stores) => {
    // seq is autoIncrement — omit it so IndexedDB assigns the next key.
    await reqToPromise(stores.sync_outbox.add({
      op,
      entity,
      entity_id: entityId ?? null,
      book_id: bookId ?? null,
      payload: payload ? JSON.stringify(payload) : null,
      created_at: now(),
      attempts: 0,
      last_error: null,
    }));
  });
}

export async function localGetOutbox(limit = 200) {
  const rows = (await getAllRows('sync_outbox')).sort((a, b) => a.seq - b.seq).slice(0, limit);
  return rows.map((r) => ({ ...r, payload: r.payload ? JSON.parse(r.payload) : null }));
}

export async function localDeleteOutboxRow(seq) {
  await write('sync_outbox', async (stores) => {
    await reqToPromise(stores.sync_outbox.delete(seq));
  });
}

export async function localBumpOutboxAttempt(seq, err) {
  await write('sync_outbox', async (stores) => {
    const row = await reqToPromise(stores.sync_outbox.get(seq));
    if (row) {
      row.attempts = (row.attempts ?? 0) + 1;
      row.last_error = err ? String(err).slice(0, 500) : null;
      await reqToPromise(stores.sync_outbox.put(row));
    }
  });
}

export async function localOutboxCount() {
  return (await getAllRows('sync_outbox')).length;
}

// ── Delta-pull appliers (last-write-wins by updated_at, dedup by shared id) ──────

const APPLY_TABLES = {
  book: {
    table: 'books',
    cols: ['id', 'user_id', 'name', 'currency', 'net_balance',
           'show_customer', 'show_supplier', 'show_category', 'show_attachment',
           'created_at', 'updated_at', 'deleted_at'],
    bools: ['show_customer', 'show_supplier', 'show_category', 'show_attachment'],
  },
  entry: {
    table: 'entries',
    cols: ['id', 'book_id', 'user_id', 'type', 'amount', 'remark',
           'category', 'category_id', 'payment_mode', 'payment_mode_id',
           'contact_name', 'customer_id', 'supplier_id',
           'entry_date', 'entry_time',
           'attachment_url', 'attachment_path', 'attachment_provider',
           'created_at', 'updated_at', 'deleted_at'],
    bools: [],
  },
  category: {
    table: 'categories',
    cols: ['id', 'book_id', 'user_id', 'name', 'total_in', 'total_out', 'net_balance',
           'display_order', 'created_at', 'updated_at', 'deleted_at'],
    bools: [],
  },
  customer: {
    table: 'customers',
    cols: ['id', 'book_id', 'user_id', 'name', 'phone', 'email', 'address',
           'total_in', 'total_out', 'net_balance', 'display_order',
           'created_at', 'updated_at', 'deleted_at'],
    bools: [],
  },
  supplier: {
    table: 'suppliers',
    cols: ['id', 'book_id', 'user_id', 'name', 'phone', 'email', 'address',
           'total_in', 'total_out', 'net_balance', 'display_order',
           'created_at', 'updated_at', 'deleted_at'],
    bools: [],
  },
  payment_mode: {
    table: 'payment_modes',
    cols: ['id', 'book_id', 'user_id', 'name', 'total_in', 'total_out', 'net_balance',
           'display_order', 'created_at', 'updated_at', 'deleted_at'],
    bools: [],
  },
};

/**
 * Upsert a server row by its shared id with last-write-wins on updated_at.
 * Mirrors INSERT OR REPLACE — only the mirrored columns are written, so any
 * column not in `cols` (e.g. cloud_id, last_entry_at) is reset to undefined,
 * exactly as the SQLite REPLACE drops unspecified columns to their default.
 * Returns true if anything was written locally.
 */
export async function localApplyServerChange(entity, row) {
  const def = APPLY_TABLES[entity];
  if (!def || !row?.id) return false;

  const existing = await getById(def.table, row.id);
  const serverTs = row.updated_at ?? null;
  if (existing && existing.updated_at && serverTs && existing.updated_at >= serverTs) {
    return false; // local is newer or same — keep it
  }

  const record = {};
  for (const c of def.cols) {
    let v = row[c];
    if (def.bools.includes(c)) record[c] = v ? 1 : 0;
    else record[c] = v === undefined ? null : v;
  }

  await write([def.table, 'books', 'categories', 'customers', 'suppliers', 'payment_modes'], async (stores) => {
    await reqToPromise(stores[def.table].put(record));
    if (entity === 'entry') {
      await recomputeBookBalance(stores, row.book_id);
      await recomputeCategoryBalance(stores, row.book_id, row.category);
      await recomputeContactBalance(stores, row.book_id, row.contact_name, 'customers');
      await recomputeContactBalance(stores, row.book_id, row.contact_name, 'suppliers');
      await recomputePaymentModeBalance(stores, row.book_id, row.payment_mode);
    }
  });
  return true;
}

/**
 * Apply a deletion received from the cloud delta:
 *   - entries → hard delete locally (then reverse balances)
 *   - everything else → set deleted_at so the row is hidden but convergent
 */
export async function localApplyTombstone(entity, id) {
  const def = APPLY_TABLES[entity];
  if (!def || !id) return false;

  if (entity === 'entry') {
    const old = await getById('entries', id);
    if (!old) return false;
    await write(['entries', 'books', 'categories', 'customers', 'suppliers', 'payment_modes'], async (stores) => {
      await reqToPromise(stores.entries.delete(id));
      await recomputeBookBalance(stores, old.book_id);
      await recomputeCategoryBalance(stores, old.book_id, old.category);
      await recomputeContactBalance(stores, old.book_id, old.contact_name, 'customers');
      await recomputeContactBalance(stores, old.book_id, old.contact_name, 'suppliers');
      await recomputePaymentModeBalance(stores, old.book_id, old.payment_mode);
    });
    return true;
  }

  await write(def.table, async (stores) => {
    const row = await reqToPromise(stores[def.table].get(id));
    if (row) {
      row.deleted_at = now();
      row.updated_at = now();
      await reqToPromise(stores[def.table].put(row));
    }
  });
  return true;
}
