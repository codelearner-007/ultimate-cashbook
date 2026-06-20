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
    // Add columns introduced after initial schema — safe to run every time (errors ignored)
    for (const ddl of [
      'ALTER TABLE entries      ADD COLUMN customer_id          TEXT',
      'ALTER TABLE entries      ADD COLUMN supplier_id          TEXT',
      'ALTER TABLE entries      ADD COLUMN category_id          TEXT',
      'ALTER TABLE entries      ADD COLUMN payment_mode_id      TEXT',
      'ALTER TABLE entries      ADD COLUMN attachment_url       TEXT',
      'ALTER TABLE entries      ADD COLUMN attachment_path      TEXT',
      'ALTER TABLE entries      ADD COLUMN attachment_provider  TEXT',
      // cloud_entry_id links a local entry row to its corresponding cloud UUID.
      // Set after a successful background push so update/delete can target the right cloud row.
      'ALTER TABLE entries      ADD COLUMN cloud_entry_id       TEXT',
      'ALTER TABLE books        ADD COLUMN cloud_id             TEXT',
      'ALTER TABLE categories   ADD COLUMN display_order        INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE customers    ADD COLUMN display_order        INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE suppliers    ADD COLUMN display_order        INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE payment_modes ADD COLUMN display_order       INTEGER NOT NULL DEFAULT 0',
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
     FROM entries WHERE book_id = ?`,
    [bookId],
  );
  const net = (row?.ti ?? 0) - (row?.to_ ?? 0);
  const last = await db.getFirstAsync(
    `SELECT created_at FROM entries WHERE book_id = ?
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
     FROM entries WHERE book_id = ? AND category = ?`,
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
     FROM entries WHERE book_id = ? AND contact_name = ?`,
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
     FROM entries WHERE book_id = ? AND payment_mode = ?`,
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
    `SELECT * FROM books WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC`,
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

export async function localCreateBook(name, currency = 'PKR') {
  const db  = await getDb();
  const id  = newId();
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
  // Mirror the cloud trigger: seed Cash and Cheque as default payment modes
  for (const modeName of ['Cash', 'Cheque']) {
    await db.runAsync(
      `INSERT OR IGNORE INTO payment_modes (id, book_id, user_id, name, created_at)
       VALUES (?,?,?,?,?)`,
      [newId(), id, uid, modeName, ts],
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
  await db.runAsync(`DELETE FROM books WHERE id = ?`, [bookId]);
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
  let sql    = `SELECT * FROM entries WHERE book_id = ?`;
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
  const id = newId();
  const ts = now();
  await db.runAsync(
    `INSERT INTO entries
       (id, book_id, user_id, type, amount, remark,
        category, category_id,
        payment_mode, payment_mode_id,
        contact_name, customer_id, supplier_id,
        entry_date, entry_time,
        attachment_url, attachment_path, attachment_provider,
        created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
    values.push(entryId);
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
    `SELECT * FROM categories WHERE book_id = ? ORDER BY display_order ASC, created_at ASC`,
    [bookId],
  );
}

export async function localCreateCategory(bookId, name) {
  const db       = await getDb();
  const existing = await db.getFirstAsync(
    `SELECT id FROM categories WHERE book_id = ? AND LOWER(name) = LOWER(?)`,
    [bookId, name],
  );
  if (existing) throw Object.assign(new Error('Category already exists'), { status: 409 });
  const id = newId();
  const ts = now();
  await db.runAsync(
    `INSERT INTO categories (id, book_id, user_id, name, created_at) VALUES (?,?,?,?,?)`,
    [id, bookId, currentUserId(), name, ts],
  );
  return db.getFirstAsync(`SELECT * FROM categories WHERE id = ?`, [id]);
}

export async function localUpdateCategory(bookId, categoryId, payload) {
  const db = await getDb();
  if (payload.name !== undefined) {
    await db.runAsync(`UPDATE categories SET name = ? WHERE id = ?`, [payload.name, categoryId]);
  }
  return db.getFirstAsync(`SELECT * FROM categories WHERE id = ?`, [categoryId]);
}

export async function localDeleteCategory(bookId, categoryId) {
  const db  = await getDb();
  const cat = await db.getFirstAsync(`SELECT * FROM categories WHERE id = ?`, [categoryId]);
  if (cat) {
    await db.runAsync(
      `UPDATE entries SET category = NULL, category_id = NULL WHERE book_id = ? AND category = ?`,
      [bookId, cat.name],
    );
  }
  await db.runAsync(`DELETE FROM categories WHERE id = ?`, [categoryId]);
}

export async function localGetCategoryEntries(bookId, categoryId) {
  const db  = await getDb();
  const cat = await db.getFirstAsync(`SELECT * FROM categories WHERE id = ?`, [categoryId]);
  if (!cat) return [];
  return db.getAllAsync(
    `SELECT * FROM entries WHERE book_id = ? AND category = ? ORDER BY entry_date DESC`,
    [bookId, cat.name],
  );
}

// ── Customers ──────────────────────────────────────────────────────────────────

export async function localGetCustomers(bookId) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT * FROM customers WHERE book_id = ? ORDER BY display_order ASC, created_at ASC`,
    [bookId],
  );
  return rows.map(r => ({ ...r, balance: r.net_balance ?? 0 }));
}

export async function localCreateCustomer(bookId, payload) {
  const db = await getDb();
  const id = newId();
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
    `SELECT * FROM customers WHERE id = ? AND book_id = ?`,
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
  await db.runAsync(`UPDATE entries SET customer_id = NULL WHERE book_id = ? AND customer_id = ?`, [bookId, customerId]);
  await db.runAsync(`DELETE FROM customers WHERE id = ?`, [customerId]);
}

export async function localGetCustomerEntries(bookId, customerId) {
  const db = await getDb();
  const c  = await db.getFirstAsync(`SELECT * FROM customers WHERE id = ?`, [customerId]);
  if (!c) return [];
  return db.getAllAsync(
    `SELECT * FROM entries WHERE book_id = ? AND contact_name = ? ORDER BY entry_date DESC`,
    [bookId, c.name],
  );
}

// ── Suppliers ──────────────────────────────────────────────────────────────────

export async function localGetSuppliers(bookId) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT * FROM suppliers WHERE book_id = ? ORDER BY display_order ASC, created_at ASC`,
    [bookId],
  );
  return rows.map(r => ({ ...r, balance: r.net_balance ?? 0 }));
}

export async function localCreateSupplier(bookId, payload) {
  const db = await getDb();
  const id = newId();
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
    `SELECT * FROM suppliers WHERE id = ? AND book_id = ?`,
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
  await db.runAsync(`UPDATE entries SET supplier_id = NULL WHERE book_id = ? AND supplier_id = ?`, [bookId, supplierId]);
  await db.runAsync(`DELETE FROM suppliers WHERE id = ?`, [supplierId]);
}

export async function localGetSupplierEntries(bookId, supplierId) {
  const db = await getDb();
  const s  = await db.getFirstAsync(`SELECT * FROM suppliers WHERE id = ?`, [supplierId]);
  if (!s) return [];
  return db.getAllAsync(
    `SELECT * FROM entries WHERE book_id = ? AND contact_name = ? ORDER BY entry_date DESC`,
    [bookId, s.name],
  );
}

// ── Payment Modes ──────────────────────────────────────────────────────────────

export async function localGetPaymentModes(bookId) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT * FROM payment_modes WHERE book_id = ? ORDER BY display_order ASC, created_at ASC`,
    [bookId],
  );
}

export async function localCreatePaymentMode(bookId, name) {
  const db       = await getDb();
  const existing = await db.getFirstAsync(
    `SELECT id FROM payment_modes WHERE book_id = ? AND LOWER(name) = LOWER(?)`,
    [bookId, name],
  );
  if (existing) throw Object.assign(new Error('Payment mode already exists'), { status: 409 });
  const id = newId();
  const ts = now();
  await db.runAsync(
    `INSERT INTO payment_modes (id, book_id, user_id, name, created_at) VALUES (?,?,?,?,?)`,
    [id, bookId, currentUserId(), name, ts],
  );
  return db.getFirstAsync(`SELECT * FROM payment_modes WHERE id = ?`, [id]);
}

export async function localUpdatePaymentMode(bookId, modeId, payload) {
  const db  = await getDb();
  const old = await db.getFirstAsync(`SELECT * FROM payment_modes WHERE id = ?`, [modeId]);
  if (payload.name !== undefined) {
    await db.runAsync(`UPDATE payment_modes SET name = ? WHERE id = ?`, [payload.name, modeId]);
    // Rename the snapshot text on entries so balances remain correct
    if (old?.name && payload.name !== old.name) {
      await db.runAsync(
        `UPDATE entries SET payment_mode = ? WHERE book_id = ? AND payment_mode = ?`,
        [payload.name, bookId, old.name],
      );
      await recomputePaymentModeBalance(db, bookId, payload.name);
    }
  }
  return db.getFirstAsync(`SELECT * FROM payment_modes WHERE id = ?`, [modeId]);
}

export async function localDeletePaymentMode(bookId, modeId) {
  const db    = await getDb();
  const count = await db.getFirstAsync(
    `SELECT COUNT(*) AS n FROM payment_modes WHERE book_id = ?`, [bookId],
  );
  if ((count?.n ?? 0) <= 1) {
    throw Object.assign(new Error('Cannot delete the last payment mode'), { status: 400 });
  }
  await db.runAsync(`DELETE FROM payment_modes WHERE id = ?`, [modeId]);
}

export async function localGetPaymentModeEntries(bookId, modeId) {
  const db   = await getDb();
  const mode = await db.getFirstAsync(`SELECT * FROM payment_modes WHERE id = ?`, [modeId]);
  if (!mode) return [];
  return db.getAllAsync(
    `SELECT * FROM entries WHERE book_id = ? AND payment_mode = ? ORDER BY entry_date DESC`,
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
  return {
    books:      await db.getAllAsync(`SELECT * FROM books WHERE user_id = ?`, [userId]),
    entries:    await db.getAllAsync(`SELECT * FROM entries WHERE user_id = ?`, [userId]),
    categories: await db.getAllAsync(
      `SELECT c.* FROM categories c JOIN books b ON b.id = c.book_id WHERE b.user_id = ?`, [userId],
    ),
    customers: await db.getAllAsync(
      `SELECT c.* FROM customers c JOIN books b ON b.id = c.book_id WHERE b.user_id = ?`, [userId],
    ),
    suppliers: await db.getAllAsync(
      `SELECT s.* FROM suppliers s JOIN books b ON b.id = s.book_id WHERE b.user_id = ?`, [userId],
    ),
    payment_modes: await db.getAllAsync(
      `SELECT pm.* FROM payment_modes pm JOIN books b ON b.id = pm.book_id WHERE b.user_id = ?`, [userId],
    ),
  };
}

export async function localClearAll() {
  const db     = await getDb();
  const userId = currentUserId();
  await db.runAsync(`DELETE FROM entries    WHERE user_id = ?`, [userId]);
  await db.runAsync(`DELETE FROM categories WHERE user_id = ?`, [userId]);
  await db.runAsync(`DELETE FROM customers  WHERE user_id = ?`, [userId]);
  await db.runAsync(`DELETE FROM suppliers  WHERE user_id = ?`, [userId]);
  await db.runAsync(`DELETE FROM books      WHERE user_id = ?`, [userId]);
}

// ── Cloud-ID bridge (links local books to their cloud counterparts) ─────────────

export async function localGetUserStats() {
  const db     = await getDb();
  const userId = currentUserId();
  const booksRow   = await db.getFirstAsync(`SELECT COUNT(*) AS cnt FROM books   WHERE user_id = ?`, [userId]);
  const entriesRow = await db.getFirstAsync(`SELECT COUNT(*) AS cnt FROM entries WHERE user_id = ?`, [userId]);
  return {
    book_count:  booksRow?.cnt  ?? 0,
    entry_count: entriesRow?.cnt ?? 0,
  };
}

export async function localBookExists(bookId) {
  const db  = await getDb();
  const row = await db.getFirstAsync(`SELECT 1 FROM books WHERE id = ?`, [bookId]);
  return !!row;
}

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

// ── Entry cloud-ID bridge ──────────────────────────────────────────────────────
// After a background push creates an entry in the cloud, we store the returned
// cloud UUID so that subsequent updates/deletes can target the right cloud row.

export async function localSetEntryCloudId(localEntryId, cloudEntryId) {
  const db = await getDb();
  await db.runAsync(`UPDATE entries SET cloud_entry_id = ? WHERE id = ?`, [cloudEntryId, localEntryId]);
}

export async function localGetCloudEntryId(localEntryId) {
  const db = await getDb();
  const row = await db.getFirstAsync(`SELECT cloud_entry_id FROM entries WHERE id = ?`, [localEntryId]);
  return row?.cloud_entry_id ?? null;
}
