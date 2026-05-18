/**
 * Sync engine — uploads local SQLite data to the cloud API.
 *
 * Used when a free user upgrades to Pro/Business, or when a paid user
 * reconnects after working offline.
 *
 * ID strategy: local UUIDs are replaced by new cloud UUIDs, and a mapping
 * table is used so foreign keys (entries → books, entries → categories …)
 * point to the correct cloud IDs.
 */

import * as L from './localDb';
import {
  apiCreateBook,
  apiCreateEntry,
  apiCreateCategory,
  apiCreateCustomer,
  apiCreateSupplier,
  apiCreatePaymentMode,
} from './api';

// ── Stats ─────────────────────────────────────────────────────────────────────

/**
 * Returns counts of data currently sitting in the local SQLite DB.
 * Used to populate the UpgradeSyncSheet and BackupSyncScreen.
 */
export async function getLocalStats() {
  try {
    const data = await L.localGetAllDataForMigration();
    return {
      books:         data.books.length,
      entries:       data.entries.length,
      categories:    data.categories.length,
      customers:     data.customers.length,
      suppliers:     data.suppliers.length,
      payment_modes: data.payment_modes.length,
      total: data.books.length + data.entries.length + data.categories.length +
             data.customers.length + data.suppliers.length + data.payment_modes.length,
    };
  } catch {
    return { books: 0, entries: 0, categories: 0, customers: 0, suppliers: 0, payment_modes: 0, total: 0 };
  }
}

// ── Main sync ─────────────────────────────────────────────────────────────────

/**
 * Uploads all local SQLite data to the cloud.
 *
 * @param {(done: number, total: number, step: string) => void} onProgress
 * @returns {{ synced: number, skipped: number, total: number }}
 */
export async function syncLocalToCloud(onProgress) {
  const data = await L.localGetAllDataForMigration();

  const total = data.books.length + data.categories.length + data.customers.length +
                data.suppliers.length + data.payment_modes.length + data.entries.length;

  let done    = 0;
  let skipped = 0;

  const tick = (step) => {
    done++;
    onProgress?.(done, total, step);
  };

  const skip = (step) => {
    skipped++;
    done++;
    onProgress?.(done, total, step);
  };

  // ── 1. Books ────────────────────────────────────────────────────────────────
  const bookIdMap = {};   // localId → cloudId
  for (const book of data.books) {
    try {
      const cloud = await apiCreateBook(book.name, book.currency ?? 'PKR');
      bookIdMap[book.id] = cloud.id;
      tick(`Uploading book: ${book.name}`);
    } catch {
      skip(`Skipped book: ${book.name}`);
    }
  }

  // ── 2. Categories ───────────────────────────────────────────────────────────
  const catIdMap = {};    // localId → cloudId
  for (const cat of data.categories) {
    const cloudBookId = bookIdMap[cat.book_id];
    if (!cloudBookId) { skip('Skipped category (book not synced)'); continue; }
    try {
      const cloud = await apiCreateCategory(cloudBookId, { name: cat.name });
      catIdMap[cat.id] = cloud.id;
      tick(`Uploading category: ${cat.name}`);
    } catch {
      skip(`Skipped category: ${cat.name}`);
    }
  }

  // ── 3. Customers ────────────────────────────────────────────────────────────
  const custIdMap = {};
  for (const c of data.customers) {
    const cloudBookId = bookIdMap[c.book_id];
    if (!cloudBookId) { skip('Skipped customer'); continue; }
    try {
      const cloud = await apiCreateCustomer(cloudBookId, {
        name: c.name, phone: c.phone, email: c.email, address: c.address,
      });
      custIdMap[c.id] = cloud.id;
      tick(`Uploading customer: ${c.name}`);
    } catch {
      skip(`Skipped customer: ${c.name}`);
    }
  }

  // ── 4. Suppliers ────────────────────────────────────────────────────────────
  const suppIdMap = {};
  for (const s of data.suppliers) {
    const cloudBookId = bookIdMap[s.book_id];
    if (!cloudBookId) { skip('Skipped supplier'); continue; }
    try {
      const cloud = await apiCreateSupplier(cloudBookId, {
        name: s.name, phone: s.phone, email: s.email, address: s.address,
      });
      suppIdMap[s.id] = cloud.id;
      tick(`Uploading supplier: ${s.name}`);
    } catch {
      skip(`Skipped supplier: ${s.name}`);
    }
  }

  // ── 5. Payment modes (Cash & Cheque already exist on cloud from book creation) ─
  // Skip — the cloud trigger seeds them automatically. Just tick progress.
  for (const pm of data.payment_modes) {
    tick(`Payment mode: ${pm.name}`);
  }

  // ── 6. Entries ──────────────────────────────────────────────────────────────
  for (const entry of data.entries) {
    const cloudBookId = bookIdMap[entry.book_id];
    if (!cloudBookId) { skip('Skipped entry (book not synced)'); continue; }
    try {
      await apiCreateEntry(cloudBookId, {
        type:         entry.type,
        amount:       entry.amount,
        remark:       entry.remark     ?? null,
        category:     entry.category   ?? null,
        category_id:  catIdMap[entry.category_id]  ?? null,
        payment_mode: entry.payment_mode ?? 'cash',
        contact_name: entry.contact_name ?? null,
        customer_id:  custIdMap[entry.customer_id] ?? null,
        supplier_id:  suppIdMap[entry.supplier_id] ?? null,
        entry_date:   entry.entry_date,
        entry_time:   entry.entry_time ?? '00:00',
      });
      tick('Uploading entry…');
    } catch {
      skip('Skipped entry');
    }
  }

  return { synced: done - skipped, skipped, total };
}
