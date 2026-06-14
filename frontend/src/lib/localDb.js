import * as SQLite from 'expo-sqlite';
import { useAuthStore } from '../store/authStore';

// Lazy singleton — opened once, reused across all calls
let _dbPromise = null;

async function getDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = (async () => {
    const db = await SQLite.openDatabaseAsync('cashbook_local.db');
    await db.execAsync(`PRAGMA journal_mode = WAL;`);
    await db.execAsync(`PRAGMA foreign_keys = ON;`);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS books (
        id              TEXT PRIMARY KEY,
        user_id         TEXT NOT NULL,
        name            TEXT NOT NULL,
        currency        TEXT NOT NULL DEFAULT 'PKR',
        net_balance     REAL NOT NULL DEFAULT 0,
        show_customer   INTEGER NOT NULL DEFAULT 1,
        show_supplier   INTEGER NOT NULL DEFAULT 1,
        show_category   INTEGER NOT NULL DEFAULT 1,
        show_attachment INTEGER NOT NULL DEFAULT 1,
        created_at      TEXT NOT NULL,
        updated_at      TEXT,
        last_entry_at   TEXT
      );
    `);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS entries (
        id                  TEXT PRIMARY KEY,
        book_id             TEXT NOT NULL,
        user_id             TEXT NOT NULL,
        type                TEXT NOT NULL,
        amount              REAL NOT NULL,
        remark              TEXT,
        category            TEXT,
        payment_mode        TEXT NOT NULL DEFAULT 'cash',
        contact_name        TEXT,
        entry_date          TEXT NOT NULL,
        entry_time          TEXT NOT NULL DEFAULT '00:00',
        attachment_url      TEXT,
        attachment_path     TEXT,
        attachment_provider TEXT,
        created_at          TEXT NOT NULL,
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
      );
    `);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS categories (
        id          TEXT PRIMARY KEY,
        book_id     TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        name        TEXT NOT NULL,
        total_in    REAL NOT NULL DEFAULT 0,
        total_out   REAL NOT NULL DEFAULT 0,
        net_balance REAL NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
        UNIQUE (book_id, name)
      );
    `);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS customers (
        id          TEXT PRIMARY KEY,
        book_id     TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        name        TEXT NOT NULL,
        phone       TEXT,
        email       TEXT,
        address     TEXT,
        total_in    REAL NOT NULL DEFAULT 0,
        total_out   REAL NOT NULL DEFAULT 0,
        net_balance REAL NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT,
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
      );
    `);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id          TEXT PRIMARY KEY,
        book_id     TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        name        TEXT NOT NULL,
        phone       TEXT,
        email       TEXT,
        address     TEXT,
        total_in    REAL NOT NULL DEFAULT 0,
        total_out   REAL NOT NULL DEFAULT 0,
        net_balance REAL NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT,
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
      );
    `);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS payment_modes (
        id          TEXT PRIMARY KEY,
        book_id     TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        name        TEXT NOT NULL,
        total_in    REAL NOT NULL DEFAULT 0,
        total_out   REAL NOT NULL DEFAULT 0,
        net_balance REAL NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
        UNIQUE (book_id, name)
      );
    `);
    // Sync outbox — durable FIFO queue of cloud writes pending for paid/superadmin
    // users. Drained by AutoSyncMonitor (app/_layout.jsx) on reconnect/foreground.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_outbox (
        seq        INTEGER PRIMARY KEY AUTOINCREMENT,
        op         TEXT NOT NULL,        -- 'create' | 'update' | 'delete'
        entity     TEXT NOT NULL,        -- 'book' | 'entry' | 'category' | 'customer' | 'supplier' | 'payment_mode'
        entity_id  TEXT,                 -- the SHARED uuid (same in local + cloud)
        book_id    TEXT,
        payload    TEXT,                 -- JSON string
        created_at TEXT NOT NULL,
        attempts   INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );
    `);
    // Add columns introduced after initial schema — safe to run every time (errors ignored)
    for (const ddl of [
      'ALTER TABLE entries      ADD COLUMN customer_id          TEXT',
      'ALTER TABLE entries      ADD COLUMN supplier_id          TEXT',
      'ALTER TABLE entries      ADD COLUMN category_id          TEXT',
      'ALTER TABLE entries      ADD COLUMN payment_mode_id      TEXT',
      'ALTER TABLE entries      ADD COLUMN attachment_url       TEXT',
      'ALTER TABLE entries      ADD COLUMN attachment_path      TEXT',
      'ALTER TABLE entries      ADD COLUMN attachment_provider  TEXT',
      'ALTER TABLE books        ADD COLUMN cloud_id             TEXT',
      'ALTER TABLE categories   ADD COLUMN display_order        INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE customers    ADD COLUMN display_order        INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE suppliers    ADD COLUMN display_order        INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE payment_modes ADD COLUMN display_order       INTEGER NOT NULL DEFAULT 0',
      // Sync columns — the row id IS the cloud id now (cloud_id kept for back-compat only).
      'ALTER TABLE books         ADD COLUMN updated_at  TEXT',
      'ALTER TABLE books         ADD COLUMN deleted_at  TEXT',
      'ALTER TABLE entries       ADD COLUMN updated_at  TEXT',
      'ALTER TABLE entries       ADD COLUMN deleted_at  TEXT',
      'ALTER TABLE categories    ADD COLUMN updated_at  TEXT',
      'ALTER TABLE categories    ADD COLUMN deleted_at  TEXT',
      'ALTER TABLE customers     ADD COLUMN updated_at  TEXT',
      'ALTER TABLE customers     ADD COLUMN deleted_at  TEXT',
      'ALTER TABLE suppliers     ADD COLUMN updated_at  TEXT',
      'ALTER TABLE suppliers     ADD COLUMN deleted_at  TEXT',
      'ALTER TABLE payment_modes ADD COLUMN updated_at  TEXT',
      'ALTER TABLE payment_modes ADD COLUMN deleted_at  TEXT',
    ]) {
      await db.execAsync(ddl).catch(() => {});
    }
    // Backfill existing books: turn all show_* fields on (matches new default)
    await db.execAsync(
      `UPDATE books SET show_customer = 1, show_supplier = 1, show_category = 1, show_attachment = 1
       WHERE show_customer = 0 OR show_supplier = 0 OR show_category = 0 OR show_attachment = 0`,
    );
    return db;
  })();
  return _dbPromise;
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function currentUserId() {
  return useAuthStore.getState().user?.id ?? 'local';
}

function newId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function now() {
  return new Date().toISOString();
}

async function recomputeBookBalance(db, bookId) {
  const row = await db.getFirstAsync(
    `SELECT
       COALESCE(SUM(CASE WHEN type='in'  THEN amount ELSE 0 END), 0) AS ti,
       COALESCE(SUM(CASE WHEN type='out' THEN amount ELSE 0 END), 0) AS to_
     FROM entries WHERE book_id = ? AND deleted_at IS NULL`,
    [bookId],
  );
  const net = (row?.ti ?? 0) - (row?.to_ ?? 0);
  const last = await db.getFirstAsync(
    `SELECT created_at FROM entries WHERE book_id = ? AND deleted_at IS NULL
     ORDER BY entry_date DESC, entry_time DESC LIMIT 1`,
    [bookId],
  );
  await db.runAsync(
    `UPDATE books SET net_balance = ?, last_entry_at = ?, updated_at = ? WHERE id = ?`,
    [net, last?.created_at ?? null, now(), bookId],
  );
}

async function recomputeCategoryBalance(db, bookId, categoryName) {
  if (!categoryName) return;
  const row = await db.getFirstAsync(
    `SELECT
       COALESCE(SUM(CASE WHEN type='in'  THEN amount ELSE 0 END), 0) AS ti,
       COALESCE(SUM(CASE WHEN type='out' THEN amount ELSE 0 END), 0) AS to_
     FROM entries WHERE book_id = ? AND category = ? AND deleted_at IS NULL`,
    [bookId, categoryName],
  );
  const ti = row?.ti ?? 0;
  const to = row?.to_ ?? 0;
  await db.runAsync(
    `UPDATE categories SET total_in = ?, total_out = ?, net_balance = ?
     WHERE book_id = ? AND name = ?`,
    [ti, to, ti - to, bookId, categoryName],
  );
}

async function recomputeContactBalance(db, bookId, contactName, table) {
  if (!contactName) return;
  const row = await db.getFirstAsync(
    `SELECT
       COALESCE(SUM(CASE WHEN type='in'  THEN amount ELSE 0 END), 0) AS ti,
       COALESCE(SUM(CASE WHEN type='out' THEN amount ELSE 0 END), 0) AS to_
     FROM entries WHERE book_id = ? AND contact_name = ? AND deleted_at IS NULL`,
    [bookId, contactName],
  );
  const ti = row?.ti ?? 0;
  const to = row?.to_ ?? 0;
  await db.runAsync(
    `UPDATE ${table} SET total_in = ?, total_out = ?, net_balance = ?
     WHERE book_id = ? AND name = ?`,
    [ti, to, ti - to, bookId, contactName],
  );
}

async function recomputePaymentModeBalance(db, bookId, modeName) {
  if (!modeName) return;
  const row = await db.getFirstAsync(
    `SELECT
       COALESCE(SUM(CASE WHEN type='in'  THEN amount ELSE 0 END), 0) AS ti,
       COALESCE(SUM(CASE WHEN type='out' THEN amount ELSE 0 END), 0) AS to_
     FROM entries WHERE book_id = ? AND payment_mode = ? AND deleted_at IS NULL`,
    [bookId, modeName],
  );
  const ti = row?.ti ?? 0;
  const to = row?.to_ ?? 0;
  await db.runAsync(
    `UPDATE payment_modes SET total_in = ?, total_out = ?, net_balance = ?
     WHERE book_id = ? AND name = ?`,
    [ti, to, ti - to, bookId, modeName],
  );
}

// ── Books ──────────────────────────────────────────────────────────────────────

export async function localGetBooks() {
  const db   = await getDb();
  const rows = await db.getAllAsync(
    `SELECT * FROM books WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY updated_at DESC, created_at DESC`,
    [currentUserId()],
  );
  return rows.map(r => ({
    ...r,
    show_customer:   !!r.show_customer,
    show_supplier:   !!r.show_supplier,
    show_category:   !!r.show_category,
    show_attachment: !!r.show_attachment,
  }));
}

export async function localCreateBook(name, currency = 'PKR', id = newId()) {
  const db  = await getDb();
  const ts  = now();
  const uid = currentUserId();
  await db.runAsync(
    `INSERT INTO books
       (id, user_id, name, currency, net_balance,
        show_customer, show_supplier, show_category, show_attachment,
        created_at, updated_at)
     VALUES (?,?,?,?,0, 1,1,1,1, ?,?)`,
    [id, uid, name, currency, ts, ts],
  );
  // The client now owns default payment modes (the cloud seed trigger was removed
  // in migration 012). Seed Cash + Cheque locally; they push like any other row
  // using their shared ids. Caller (dataSource) enqueues them to the outbox.
  for (const modeName of ['Cash', 'Cheque']) {
    await db.runAsync(
      `INSERT OR IGNORE INTO payment_modes (id, book_id, user_id, name, created_at, updated_at)
       VALUES (?,?,?,?,?,?)`,
      [newId(), id, uid, modeName, ts, ts],
    );
  }
  return db.getFirstAsync(`SELECT * FROM books WHERE id = ?`, [id]);
}

export async function localUpdateBook(bookId, payload) {
  const db     = await getDb();
  const fields = [];
  const values = [];
  if (payload.name     !== undefined) { fields.push('name = ?');     values.push(payload.name); }
  if (payload.currency !== undefined) { fields.push('currency = ?'); values.push(payload.currency); }
  if (fields.length) {
    fields.push('updated_at = ?');
    values.push(now(), bookId);
    await db.runAsync(`UPDATE books SET ${fields.join(', ')} WHERE id = ?`, values);
  }
  return db.getFirstAsync(`SELECT * FROM books WHERE id = ?`, [bookId]);
}

export async function localDeleteBook(bookId) {
  const db = await getDb();
  const ts = now();
  // Soft delete locally so the deletion is hidden from reads AND can be replayed
  // to the cloud (delete by shared id). Cascade-soft-delete the book's children
  // so a stale reconnect can't resurrect them on another device.
  await db.runAsync(`UPDATE books         SET deleted_at = ?, updated_at = ? WHERE id = ?`,      [ts, ts, bookId]);
  await db.runAsync(`UPDATE entries       SET deleted_at = ?, updated_at = ? WHERE book_id = ?`, [ts, ts, bookId]);
  await db.runAsync(`UPDATE categories    SET deleted_at = ?, updated_at = ? WHERE book_id = ?`, [ts, ts, bookId]);
  await db.runAsync(`UPDATE customers     SET deleted_at = ?, updated_at = ? WHERE book_id = ?`, [ts, ts, bookId]);
  await db.runAsync(`UPDATE suppliers     SET deleted_at = ?, updated_at = ? WHERE book_id = ?`, [ts, ts, bookId]);
  await db.runAsync(`UPDATE payment_modes SET deleted_at = ?, updated_at = ? WHERE book_id = ?`, [ts, ts, bookId]);
}

export async function localUpdateBookFieldSettings(bookId, settings) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE books
     SET show_customer = ?, show_supplier = ?, show_category = ?, show_attachment = ?, updated_at = ?
     WHERE id = ?`,
    [
      settings.showCustomer   ? 1 : 0,
      settings.showSupplier   ? 1 : 0,
      settings.showCategory   ? 1 : 0,
      settings.showAttachment ? 1 : 0,
      now(),
      bookId,
    ],
  );
}

// ── Entries ────────────────────────────────────────────────────────────────────

export async function localGetEntries(bookId, params = {}) {
  const db   = await getDb();
  let sql    = `SELECT * FROM entries WHERE book_id = ? AND deleted_at IS NULL`;
  const args = [bookId];
  if (params.date_from) { sql += ` AND entry_date >= ?`; args.push(params.date_from); }
  if (params.date_to)   { sql += ` AND entry_date <= ?`; args.push(params.date_to); }
  if (params.type)      { sql += ` AND type = ?`;        args.push(params.type); }
  sql += ` ORDER BY entry_date DESC, entry_time DESC, created_at DESC`;
  return db.getAllAsync(sql, args);
}

export async function localGetSummary(bookId) {
  const db  = await getDb();
  const row = await db.getFirstAsync(
    `SELECT
       COALESCE(SUM(CASE WHEN type='in'  THEN amount ELSE 0 END), 0) AS ti,
       COALESCE(SUM(CASE WHEN type='out' THEN amount ELSE 0 END), 0) AS to_
     FROM entries WHERE book_id = ?`,
    [bookId],
  );
  const ti = row?.ti ?? 0;
  const to = row?.to_ ?? 0;
  return { total_in: ti, total_out: to, net_balance: ti - to };
}

export async function localCreateEntry(bookId, payload) {
  const db = await getDb();
  const id = payload.id ?? newId();   // accept the shared id from the caller if present
  const ts = now();
  await db.runAsync(
    `INSERT INTO entries
       (id, book_id, user_id, type, amount, remark,
        category, category_id,
        payment_mode, payment_mode_id,
        contact_name, customer_id, supplier_id,
        entry_date, entry_time,
        attachment_url, attachment_path, attachment_provider,
        created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, bookId, currentUserId(),
      payload.type, payload.amount,
      payload.remark              ?? null,
      payload.category            ?? null,
      payload.category_id         ?? null,
      payload.payment_mode        ?? 'cash',
      payload.payment_mode_id     ?? null,
      payload.contact_name        ?? null,
      payload.customer_id         ?? null,
      payload.supplier_id         ?? null,
      payload.entry_date,
      payload.entry_time          ?? '00:00',
      payload.attachment_url      ?? null,
      payload.attachment_path     ?? null,
      payload.attachment_provider ?? null,
      ts,
      ts,
    ],
  );
  await recomputeBookBalance(db, bookId);
  await recomputeCategoryBalance(db, bookId, payload.category);
  await recomputeContactBalance(db, bookId, payload.contact_name, 'customers');
  await recomputeContactBalance(db, bookId, payload.contact_name, 'suppliers');
  await recomputePaymentModeBalance(db, bookId, payload.payment_mode);
  return db.getFirstAsync(`SELECT * FROM entries WHERE id = ?`, [id]);
}

export async function localUpdateEntry(bookId, entryId, payload) {
  const db     = await getDb();
  const old    = await db.getFirstAsync(`SELECT * FROM entries WHERE id = ?`, [entryId]);
  const fields = [];
  const values = [];
  for (const k of ['type', 'amount', 'remark', 'category', 'category_id', 'payment_mode', 'payment_mode_id', 'contact_name', 'customer_id', 'supplier_id', 'entry_date', 'entry_time', 'attachment_url', 'attachment_path', 'attachment_provider']) {
    if (payload[k] !== undefined) { fields.push(`${k} = ?`); values.push(payload[k]); }
  }
  if (fields.length) {
    fields.push('updated_at = ?');
    values.push(now(), entryId);
    await db.runAsync(`UPDATE entries SET ${fields.join(', ')} WHERE id = ?`, values);
  }
  await recomputeBookBalance(db, bookId);
  for (const cat of new Set([old?.category, payload.category].filter(Boolean))) {
    await recomputeCategoryBalance(db, bookId, cat);
  }
  for (const name of new Set([old?.contact_name, payload.contact_name].filter(Boolean))) {
    await recomputeContactBalance(db, bookId, name, 'customers');
    await recomputeContactBalance(db, bookId, name, 'suppliers');
  }
  for (const mode of new Set([old?.payment_mode, payload.payment_mode].filter(Boolean))) {
    await recomputePaymentModeBalance(db, bookId, mode);
  }
  return db.getFirstAsync(`SELECT * FROM entries WHERE id = ?`, [entryId]);
}

export async function localDeleteEntry(bookId, entryId) {
  const db  = await getDb();
  const old = await db.getFirstAsync(`SELECT * FROM entries WHERE id = ?`, [entryId]);
  await db.runAsync(`DELETE FROM entries WHERE id = ?`, [entryId]);
  await recomputeBookBalance(db, bookId);
  await recomputeCategoryBalance(db, bookId, old?.category);
  await recomputeContactBalance(db, bookId, old?.contact_name, 'customers');
  await recomputeContactBalance(db, bookId, old?.contact_name, 'suppliers');
  await recomputePaymentModeBalance(db, bookId, old?.payment_mode);
}

export async function localDeleteAllEntries(bookId) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM entries WHERE book_id = ?`, [bookId]);
  await db.runAsync(
    `UPDATE books SET net_balance = 0, last_entry_at = NULL, updated_at = ? WHERE id = ?`,
    [now(), bookId],
  );
  await db.runAsync(`UPDATE categories    SET total_in = 0, total_out = 0, net_balance = 0 WHERE book_id = ?`, [bookId]);
  await db.runAsync(`UPDATE customers     SET total_in = 0, total_out = 0, net_balance = 0 WHERE book_id = ?`, [bookId]);
  await db.runAsync(`UPDATE suppliers     SET total_in = 0, total_out = 0, net_balance = 0 WHERE book_id = ?`, [bookId]);
  await db.runAsync(`UPDATE payment_modes SET total_in = 0, total_out = 0, net_balance = 0 WHERE book_id = ?`, [bookId]);
}

// ── Categories ─────────────────────────────────────────────────────────────────

export async function localGetCategories(bookId) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT * FROM categories WHERE book_id = ? AND deleted_at IS NULL
     ORDER BY display_order ASC, created_at ASC`,
    [bookId],
  );
}

export async function localCreateCategory(bookId, name, id = newId()) {
  const db       = await getDb();
  const existing = await db.getFirstAsync(
    `SELECT id FROM categories WHERE book_id = ? AND LOWER(name) = LOWER(?) AND deleted_at IS NULL`,
    [bookId, name],
  );
  if (existing) throw Object.assign(new Error('Category already exists'), { status: 409 });
  const ts = now();
  await db.runAsync(
    `INSERT INTO categories (id, book_id, user_id, name, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
    [id, bookId, currentUserId(), name, ts, ts],
  );
  return db.getFirstAsync(`SELECT * FROM categories WHERE id = ?`, [id]);
}

export async function localUpdateCategory(bookId, categoryId, payload) {
  const db = await getDb();
  if (payload.name !== undefined) {
    await db.runAsync(`UPDATE categories SET name = ?, updated_at = ? WHERE id = ?`, [payload.name, now(), categoryId]);
  }
  return db.getFirstAsync(`SELECT * FROM categories WHERE id = ?`, [categoryId]);
}

export async function localDeleteCategory(bookId, categoryId) {
  const db  = await getDb();
  const cat = await db.getFirstAsync(`SELECT * FROM categories WHERE id = ?`, [categoryId]);
  if (cat) {
    await db.runAsync(
      `UPDATE entries SET category = NULL, category_id = NULL, updated_at = ? WHERE book_id = ? AND category = ?`,
      [now(), bookId, cat.name],
    );
  }
  // Soft delete so the deletion can be replayed to the cloud by shared id.
  await db.runAsync(`UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now(), now(), categoryId]);
}

export async function localGetCategoryEntries(bookId, categoryId) {
  const db  = await getDb();
  const cat = await db.getFirstAsync(`SELECT * FROM categories WHERE id = ?`, [categoryId]);
  if (!cat) return [];
  return db.getAllAsync(
    `SELECT * FROM entries WHERE book_id = ? AND category = ? AND deleted_at IS NULL ORDER BY entry_date DESC`,
    [bookId, cat.name],
  );
}

// ── Customers ──────────────────────────────────────────────────────────────────

export async function localGetCustomers(bookId) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT * FROM customers WHERE book_id = ? AND deleted_at IS NULL
     ORDER BY display_order ASC, created_at ASC`,
    [bookId],
  );
  return rows.map(r => ({ ...r, balance: r.net_balance ?? 0 }));
}

export async function localCreateCustomer(bookId, payload) {
  const db = await getDb();
  const id = payload.id ?? newId();
  const ts = now();
  await db.runAsync(
    `INSERT INTO customers (id, book_id, user_id, name, phone, email, address, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, bookId, currentUserId(), payload.name, payload.phone ?? null, payload.email ?? null, payload.address ?? null, ts, ts],
  );
  return db.getFirstAsync(`SELECT * FROM customers WHERE id = ?`, [id]);
}

export async function localGetCustomer(bookId, customerId) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT * FROM customers WHERE id = ? AND book_id = ? AND deleted_at IS NULL`,
    [customerId, bookId],
  );
  return row ? { ...row, balance: row.net_balance ?? 0 } : null;
}

export async function localUpdateCustomer(bookId, customerId, payload) {
  const db     = await getDb();
  const fields = [];
  const values = [];
  for (const k of ['name', 'phone', 'email', 'address']) {
    if (payload[k] !== undefined) { fields.push(`${k} = ?`); values.push(payload[k]); }
  }
  if (fields.length) {
    fields.push('updated_at = ?');
    values.push(now(), customerId);
    await db.runAsync(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`, values);
  }
  return db.getFirstAsync(`SELECT * FROM customers WHERE id = ?`, [customerId]);
}

export async function localDeleteCustomer(bookId, customerId) {
  const db = await getDb();
  await db.runAsync(`UPDATE entries SET customer_id = NULL, updated_at = ? WHERE book_id = ? AND customer_id = ?`, [now(), bookId, customerId]);
  // Soft delete so the deletion can be replayed to the cloud by shared id.
  await db.runAsync(`UPDATE customers SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now(), now(), customerId]);
}

export async function localGetCustomerEntries(bookId, customerId) {
  const db = await getDb();
  const c  = await db.getFirstAsync(`SELECT * FROM customers WHERE id = ?`, [customerId]);
  if (!c) return [];
  return db.getAllAsync(
    `SELECT * FROM entries WHERE book_id = ? AND contact_name = ? AND deleted_at IS NULL ORDER BY entry_date DESC`,
    [bookId, c.name],
  );
}

// ── Suppliers ──────────────────────────────────────────────────────────────────

export async function localGetSuppliers(bookId) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT * FROM suppliers WHERE book_id = ? AND deleted_at IS NULL
     ORDER BY display_order ASC, created_at ASC`,
    [bookId],
  );
  return rows.map(r => ({ ...r, balance: r.net_balance ?? 0 }));
}

export async function localCreateSupplier(bookId, payload) {
  const db = await getDb();
  const id = payload.id ?? newId();
  const ts = now();
  await db.runAsync(
    `INSERT INTO suppliers (id, book_id, user_id, name, phone, email, address, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, bookId, currentUserId(), payload.name, payload.phone ?? null, payload.email ?? null, payload.address ?? null, ts, ts],
  );
  return db.getFirstAsync(`SELECT * FROM suppliers WHERE id = ?`, [id]);
}

export async function localGetSupplier(bookId, supplierId) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT * FROM suppliers WHERE id = ? AND book_id = ? AND deleted_at IS NULL`,
    [supplierId, bookId],
  );
  return row ? { ...row, balance: row.net_balance ?? 0 } : null;
}

export async function localUpdateSupplier(bookId, supplierId, payload) {
  const db     = await getDb();
  const fields = [];
  const values = [];
  for (const k of ['name', 'phone', 'email', 'address']) {
    if (payload[k] !== undefined) { fields.push(`${k} = ?`); values.push(payload[k]); }
  }
  if (fields.length) {
    fields.push('updated_at = ?');
    values.push(now(), supplierId);
    await db.runAsync(`UPDATE suppliers SET ${fields.join(', ')} WHERE id = ?`, values);
  }
  return db.getFirstAsync(`SELECT * FROM suppliers WHERE id = ?`, [supplierId]);
}

export async function localDeleteSupplier(bookId, supplierId) {
  const db = await getDb();
  await db.runAsync(`UPDATE entries SET supplier_id = NULL, updated_at = ? WHERE book_id = ? AND supplier_id = ?`, [now(), bookId, supplierId]);
  // Soft delete so the deletion can be replayed to the cloud by shared id.
  await db.runAsync(`UPDATE suppliers SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now(), now(), supplierId]);
}

export async function localGetSupplierEntries(bookId, supplierId) {
  const db = await getDb();
  const s  = await db.getFirstAsync(`SELECT * FROM suppliers WHERE id = ?`, [supplierId]);
  if (!s) return [];
  return db.getAllAsync(
    `SELECT * FROM entries WHERE book_id = ? AND contact_name = ? AND deleted_at IS NULL ORDER BY entry_date DESC`,
    [bookId, s.name],
  );
}

// ── Payment Modes ──────────────────────────────────────────────────────────────

export async function localGetPaymentModes(bookId) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT * FROM payment_modes WHERE book_id = ? AND deleted_at IS NULL
     ORDER BY display_order ASC, created_at ASC`,
    [bookId],
  );
}

export async function localCreatePaymentMode(bookId, name, id = newId()) {
  const db       = await getDb();
  const existing = await db.getFirstAsync(
    `SELECT id FROM payment_modes WHERE book_id = ? AND LOWER(name) = LOWER(?) AND deleted_at IS NULL`,
    [bookId, name],
  );
  if (existing) throw Object.assign(new Error('Payment mode already exists'), { status: 409 });
  const ts = now();
  await db.runAsync(
    `INSERT INTO payment_modes (id, book_id, user_id, name, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
    [id, bookId, currentUserId(), name, ts, ts],
  );
  return db.getFirstAsync(`SELECT * FROM payment_modes WHERE id = ?`, [id]);
}

export async function localUpdatePaymentMode(bookId, modeId, payload) {
  const db  = await getDb();
  const old = await db.getFirstAsync(`SELECT * FROM payment_modes WHERE id = ?`, [modeId]);
  if (payload.name !== undefined) {
    await db.runAsync(`UPDATE payment_modes SET name = ?, updated_at = ? WHERE id = ?`, [payload.name, now(), modeId]);
    // Rename the snapshot text on entries so balances remain correct
    if (old?.name && payload.name !== old.name) {
      await db.runAsync(
        `UPDATE entries SET payment_mode = ?, updated_at = ? WHERE book_id = ? AND payment_mode = ?`,
        [payload.name, now(), bookId, old.name],
      );
      await recomputePaymentModeBalance(db, bookId, payload.name);
    }
  }
  return db.getFirstAsync(`SELECT * FROM payment_modes WHERE id = ?`, [modeId]);
}

export async function localDeletePaymentMode(bookId, modeId) {
  const db    = await getDb();
  const count = await db.getFirstAsync(
    `SELECT COUNT(*) AS n FROM payment_modes WHERE book_id = ? AND deleted_at IS NULL`, [bookId],
  );
  if ((count?.n ?? 0) <= 1) {
    throw Object.assign(new Error('Cannot delete the last payment mode'), { status: 400 });
  }
  // Soft delete so the deletion can be replayed to the cloud by shared id.
  await db.runAsync(`UPDATE payment_modes SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now(), now(), modeId]);
}

export async function localGetPaymentModeEntries(bookId, modeId) {
  const db   = await getDb();
  const mode = await db.getFirstAsync(`SELECT * FROM payment_modes WHERE id = ?`, [modeId]);
  if (!mode) return [];
  return db.getAllAsync(
    `SELECT * FROM entries WHERE book_id = ? AND payment_mode = ? AND deleted_at IS NULL ORDER BY entry_date DESC`,
    [bookId, mode.name],
  );
}

// ── Reorder helpers ────────────────────────────────────────────────────────────

export async function localReorderCategories(bookId, orderedIds) {
  const db = await getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.runAsync(
      `UPDATE categories SET display_order = ? WHERE id = ? AND book_id = ?`,
      [i, orderedIds[i], bookId],
    );
  }
}

export async function localReorderCustomers(bookId, orderedIds) {
  const db = await getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.runAsync(
      `UPDATE customers SET display_order = ? WHERE id = ? AND book_id = ?`,
      [i, orderedIds[i], bookId],
    );
  }
}

export async function localReorderSuppliers(bookId, orderedIds) {
  const db = await getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.runAsync(
      `UPDATE suppliers SET display_order = ? WHERE id = ? AND book_id = ?`,
      [i, orderedIds[i], bookId],
    );
  }
}

export async function localReorderPaymentModes(bookId, orderedIds) {
  const db = await getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.runAsync(
      `UPDATE payment_modes SET display_order = ? WHERE id = ? AND book_id = ?`,
      [i, orderedIds[i], bookId],
    );
  }
}

// ── Migration helpers ──────────────────────────────────────────────────────────

export async function localGetAllDataForMigration() {
  const db     = await getDb();
  const userId = currentUserId();
  // Exclude soft-deleted rows — a full reconcile must not re-push deleted data.
  return {
    books:      await db.getAllAsync(`SELECT * FROM books WHERE user_id = ? AND deleted_at IS NULL`, [userId]),
    entries:    await db.getAllAsync(`SELECT * FROM entries WHERE user_id = ? AND deleted_at IS NULL`, [userId]),
    categories: await db.getAllAsync(
      `SELECT c.* FROM categories c JOIN books b ON b.id = c.book_id
       WHERE b.user_id = ? AND c.deleted_at IS NULL AND b.deleted_at IS NULL`, [userId],
    ),
    customers: await db.getAllAsync(
      `SELECT c.* FROM customers c JOIN books b ON b.id = c.book_id
       WHERE b.user_id = ? AND c.deleted_at IS NULL AND b.deleted_at IS NULL`, [userId],
    ),
    suppliers: await db.getAllAsync(
      `SELECT s.* FROM suppliers s JOIN books b ON b.id = s.book_id
       WHERE b.user_id = ? AND s.deleted_at IS NULL AND b.deleted_at IS NULL`, [userId],
    ),
    payment_modes: await db.getAllAsync(
      `SELECT pm.* FROM payment_modes pm JOIN books b ON b.id = pm.book_id
       WHERE b.user_id = ? AND pm.deleted_at IS NULL AND b.deleted_at IS NULL`, [userId],
    ),
  };
}

export async function localClearAll() {
  const db     = await getDb();
  const userId = currentUserId();
  await db.runAsync(`DELETE FROM entries       WHERE user_id = ?`, [userId]);
  await db.runAsync(`DELETE FROM categories    WHERE user_id = ?`, [userId]);
  await db.runAsync(`DELETE FROM customers     WHERE user_id = ?`, [userId]);
  await db.runAsync(`DELETE FROM suppliers     WHERE user_id = ?`, [userId]);
  await db.runAsync(`DELETE FROM payment_modes WHERE user_id = ?`, [userId]);
  await db.runAsync(`DELETE FROM books         WHERE user_id = ?`, [userId]);
  // Drop any pending cloud writes — they refer to now-deleted local rows.
  await db.runAsync(`DELETE FROM sync_outbox`);
}

// ── Cloud-ID bridge (links local books to their cloud counterparts) ─────────────

export async function localGetBookByCloudId(cloudId) {
  const db = await getDb();
  return db.getFirstAsync(`SELECT * FROM books WHERE cloud_id = ?`, [cloudId]);
}

export async function localSetBookCloudId(localId, cloudId) {
  const db = await getDb();
  await db.runAsync(`UPDATE books SET cloud_id = ? WHERE id = ?`, [cloudId, localId]);
}

export async function localGetCloudBookId(localId) {
  const db = await getDb();
  const row = await db.getFirstAsync(`SELECT cloud_id FROM books WHERE id = ?`, [localId]);
  return row?.cloud_id ?? null;
}

// ── Sync outbox (durable FIFO queue of pending cloud writes) ─────────────────────

const OUTBOX_ENTITIES = ['book', 'entry', 'category', 'customer', 'supplier', 'payment_mode'];

export async function localEnqueueOutbox(op, entity, entityId, bookId, payload) {
  if (!OUTBOX_ENTITIES.includes(entity)) return;
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO sync_outbox (op, entity, entity_id, book_id, payload, created_at)
     VALUES (?,?,?,?,?,?)`,
    [op, entity, entityId ?? null, bookId ?? null, payload ? JSON.stringify(payload) : null, now()],
  );
}

export async function localGetOutbox(limit = 200) {
  const db   = await getDb();
  const rows = await db.getAllAsync(
    `SELECT * FROM sync_outbox ORDER BY seq ASC LIMIT ?`, [limit],
  );
  return rows.map(r => ({ ...r, payload: r.payload ? JSON.parse(r.payload) : null }));
}

export async function localDeleteOutboxRow(seq) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM sync_outbox WHERE seq = ?`, [seq]);
}

export async function localBumpOutboxAttempt(seq, err) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE sync_outbox SET attempts = attempts + 1, last_error = ? WHERE seq = ?`,
    [err ? String(err).slice(0, 500) : null, seq],
  );
}

export async function localOutboxCount() {
  const db  = await getDb();
  const row = await db.getFirstAsync(`SELECT COUNT(*) AS n FROM sync_outbox`);
  return row?.n ?? 0;
}

// ── Delta-pull appliers (last-write-wins by updated_at, dedup by shared id) ──────

// entity name → { table, cols } where cols are the columns we mirror from cloud.
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
 * Upsert a server row by its shared id with last-write-wins on updated_at:
 * if the local copy is newer (or equal), the server row is ignored.
 * Recomputes affected balances after applying an entry change.
 * Returns true if anything was written locally.
 */
export async function localApplyServerChange(entity, row) {
  const def = APPLY_TABLES[entity];
  if (!def || !row?.id) return false;
  const db = await getDb();

  const existing = await db.getFirstAsync(
    `SELECT updated_at FROM ${def.table} WHERE id = ?`, [row.id],
  );
  const serverTs = row.updated_at ?? null;
  if (existing && existing.updated_at && serverTs && existing.updated_at >= serverTs) {
    return false;  // local is newer or same — keep it
  }

  // Normalise booleans (SQLite stores 0/1) and build the value list.
  const values = def.cols.map((c) => {
    let v = row[c];
    if (def.bools.includes(c)) return v ? 1 : 0;
    return v === undefined ? null : v;
  });
  const placeholders = def.cols.map(() => '?').join(',');
  await db.runAsync(
    `INSERT OR REPLACE INTO ${def.table} (${def.cols.join(',')}) VALUES (${placeholders})`,
    values,
  );

  if (entity === 'entry') {
    await recomputeBookBalance(db, row.book_id);
    await recomputeCategoryBalance(db, row.book_id, row.category);
    await recomputeContactBalance(db, row.book_id, row.contact_name, 'customers');
    await recomputeContactBalance(db, row.book_id, row.contact_name, 'suppliers');
    await recomputePaymentModeBalance(db, row.book_id, row.payment_mode);
  }
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
  const db = await getDb();

  if (entity === 'entry') {
    const old = await db.getFirstAsync(`SELECT * FROM entries WHERE id = ?`, [id]);
    if (!old) return false;
    await db.runAsync(`DELETE FROM entries WHERE id = ?`, [id]);
    await recomputeBookBalance(db, old.book_id);
    await recomputeCategoryBalance(db, old.book_id, old.category);
    await recomputeContactBalance(db, old.book_id, old.contact_name, 'customers');
    await recomputeContactBalance(db, old.book_id, old.contact_name, 'suppliers');
    await recomputePaymentModeBalance(db, old.book_id, old.payment_mode);
    return true;
  }

  await db.runAsync(`UPDATE ${def.table} SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now(), now(), id]);
  return true;
}
