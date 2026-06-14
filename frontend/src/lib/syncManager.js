/**
 * Sync engine — id-based, idempotent reconcile between local SQLite and cloud.
 *
 * Shared-id model: the client UUID is the primary key in BOTH SQLite and cloud
 * Postgres. So every match here is by id — there is NO name/fingerprint dedup.
 *
 *   syncLocalToCloud — drains everything not yet on the cloud, creating each row
 *                      WITH its local id (so update/delete by id work later).
 *   syncCloudToLocal — pulls via the delta endpoint and applies each row locally
 *                      (last-write-wins by updated_at), including tombstones.
 *
 * Return value for both: { synced, skipped, alreadySynced, total }
 */

import * as L from './localDb';
import {
  apiGetBooks,
  apiCreateBook,
  apiUpdateBook,
  apiCreateEntry,
  apiUpdateEntry,
  apiCreateCategory,
  apiCreateCustomer,
  apiCreateSupplier,
  apiCreatePaymentMode,
  apiGetSyncChanges,
  apiUploadAttachment,
} from './api';

// ── Stats ─────────────────────────────────────────────────────────────────────

/**
 * Counts of data currently in local SQLite (excludes soft-deleted rows).
 * Used by UpgradeSyncSheet and BackupSyncScreen.
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

/**
 * Compares local SQLite against the cloud using SHARED IDS (no fingerprints).
 * "new" = a local row whose id is not present (and not tombstoned) in the cloud.
 *
 * Return shape (kept stable for the upgrade/backup UI):
 *   hasCloudData, localEntries, newEntries, alreadySyncedEntries,
 *   onlyInCloudEntries, localBooks, newBooks, localCategories, toUpload
 */
export async function getCloudDeltaStats() {
  try {
    const data = await L.localGetAllDataForMigration();

    // Full cloud snapshot via the delta endpoint (since=empty → everything).
    let cloud = null;
    try { cloud = await apiGetSyncChanges(''); } catch { /* offline — treat as no cloud data */ }

    if (!cloud) {
      return {
        hasCloudData: false,
        localEntries: data.entries.length, newEntries: data.entries.length,
        alreadySyncedEntries: 0, onlyInCloudEntries: 0,
        localBooks: data.books.length, newBooks: data.books.length,
        localCategories: data.categories.length,
        toUpload: data.books.length + data.entries.length,
      };
    }

    const liveCloud = (rows) => (rows ?? []).filter(r => !r.deleted_at);
    const cloudBookIds  = new Set(liveCloud(cloud.books).map(b => b.id));
    const cloudEntryIds = new Set(liveCloud(cloud.entries).map(e => e.id));

    const hasCloudData = cloudBookIds.size > 0;

    let newBooks = 0;
    for (const b of data.books) if (!cloudBookIds.has(b.id)) newBooks++;

    let newEntries = 0;
    let alreadySyncedEntries = 0;
    for (const e of data.entries) {
      if (cloudEntryIds.has(e.id)) alreadySyncedEntries++;
      else newEntries++;
    }

    // Cloud entries with no live local match (deleted locally or pending pull).
    const localEntryIds = new Set(data.entries.map(e => e.id));
    let onlyInCloudEntries = 0;
    for (const id of cloudEntryIds) if (!localEntryIds.has(id)) onlyInCloudEntries++;

    return {
      hasCloudData,
      localEntries:         data.entries.length,
      newEntries,
      alreadySyncedEntries,
      onlyInCloudEntries,
      localBooks:           data.books.length,
      newBooks,
      localCategories:      data.categories.length,
      toUpload:             newBooks + newEntries,
    };
  } catch {
    return {
      hasCloudData: false,
      localEntries: 0, newEntries: 0, alreadySyncedEntries: 0, onlyInCloudEntries: 0,
      localBooks: 0, newBooks: 0, localCategories: 0, toUpload: 0,
    };
  }
}

// ── Local → Cloud (full reconcile, id-based) ────────────────────────────────────

/**
 * Pushes every local row whose shared id is not yet on the cloud, creating it
 * WITH its local id. Matching is by id — never by name or fingerprint. Safe to
 * re-run: rows already on the cloud are skipped.
 *
 * @param {(done: number, total: number, step: string) => void} onProgress
 * @returns {{ synced, skipped, alreadySynced, total }}
 */
export async function syncLocalToCloud(onProgress) {
  const data = await L.localGetAllDataForMigration();

  const total = data.books.length + data.categories.length + data.customers.length +
                data.suppliers.length + data.payment_modes.length + data.entries.length;

  let done = 0, skipped = 0, alreadySynced = 0;
  const tick    = (step) => { done++;                  onProgress?.(done, total, step); };
  const skip    = (step) => { skipped++;       done++; onProgress?.(done, total, step); };
  const already = (step) => { alreadySynced++; done++; onProgress?.(done, total, step); };

  // Current cloud state via the delta endpoint (since=empty → everything).
  let cloud = { books: [], entries: [], categories: [], customers: [], suppliers: [], payment_modes: [] };
  try { cloud = await apiGetSyncChanges(''); } catch { /* offline — create everything */ }

  const idSet = (rows) => new Set((rows ?? []).map(r => r.id));
  const cloudBooks    = idSet(cloud.books);
  const cloudCats     = idSet(cloud.categories);
  const cloudCusts    = idSet(cloud.customers);
  const cloudSupps    = idSet(cloud.suppliers);
  const cloudModes    = idSet(cloud.payment_modes);
  const cloudEntries  = idSet(cloud.entries);

  // 1. Books
  for (const book of data.books) {
    if (cloudBooks.has(book.id)) { already(`Book already synced: ${book.name}`); continue; }
    try {
      await apiCreateBook(book.name, book.currency ?? 'PKR', book.id);
      L.localSetBookCloudId(book.id, book.id).catch(() => {}); // back-compat bookkeeping
      tick(`Uploading book: ${book.name}`);
    } catch { skip(`Skipped book: ${book.name}`); }
  }

  // 2. Categories
  for (const cat of data.categories) {
    if (cloudCats.has(cat.id)) { already(`Category already synced: ${cat.name}`); continue; }
    try {
      await apiCreateCategory(cat.book_id, { id: cat.id, name: cat.name });
      tick(`Uploading category: ${cat.name}`);
    } catch { skip(`Skipped category: ${cat.name}`); }
  }

  // 3. Customers
  for (const c of data.customers) {
    if (cloudCusts.has(c.id)) { already(`Customer already synced: ${c.name}`); continue; }
    try {
      await apiCreateCustomer(c.book_id, { id: c.id, name: c.name, phone: c.phone, email: c.email, address: c.address });
      tick(`Uploading customer: ${c.name}`);
    } catch { skip(`Skipped customer: ${c.name}`); }
  }

  // 4. Suppliers
  for (const s of data.suppliers) {
    if (cloudSupps.has(s.id)) { already(`Supplier already synced: ${s.name}`); continue; }
    try {
      await apiCreateSupplier(s.book_id, { id: s.id, name: s.name, phone: s.phone, email: s.email, address: s.address });
      tick(`Uploading supplier: ${s.name}`);
    } catch { skip(`Skipped supplier: ${s.name}`); }
  }

  // 5. Payment modes (the cloud seed trigger is gone — push them like any row)
  for (const pm of data.payment_modes) {
    if (cloudModes.has(pm.id)) { already(`Payment mode already synced: ${pm.name}`); continue; }
    try {
      await apiCreatePaymentMode(pm.book_id, { id: pm.id, name: pm.name });
      tick(`Uploading payment mode: ${pm.name}`);
    } catch { skip(`Skipped payment mode: ${pm.name}`); }
  }

  // 6. Entries
  for (const entry of data.entries) {
    if (cloudEntries.has(entry.id)) { already('Entry already synced'); continue; }
    try {
      const cloudEntry = await apiCreateEntry(entry.book_id, {
        id:           entry.id,
        type:         entry.type,
        amount:       entry.amount,
        remark:       entry.remark      ?? null,
        category:     entry.category    ?? null,
        category_id:  null,
        payment_mode: entry.payment_mode ?? 'cash',
        contact_name: entry.contact_name ?? null,
        customer_id:  null,
        supplier_id:  null,
        entry_date:   entry.entry_date,
        entry_time:   entry.entry_time  ?? '00:00',
      });

      // Upload a local attachment to cloud storage, then patch the entry by id.
      if (entry.attachment_provider === 'local' && entry.attachment_path && cloudEntry?.id) {
        try {
          const isPdf    = entry.attachment_path.toLowerCase().endsWith('.pdf');
          const mimeType = isPdf ? 'application/pdf' : 'image/jpeg';
          const filename = isPdf ? 'attachment.pdf'  : 'attachment.jpg';
          const uploaded = await apiUploadAttachment(entry.attachment_path, mimeType, filename, cloudEntry.id);
          await apiUpdateEntry(entry.book_id, cloudEntry.id, {
            attachment_url:      uploaded.attachment_url,
            attachment_path:     uploaded.path,
            attachment_provider: uploaded.provider ?? 'supabase',
          });
        } catch { /* attachment upload failed — entry data is saved; image stays local */ }
      }

      tick('Uploading entry…');
    } catch { skip('Skipped entry'); }
  }

  return { synced: done - skipped - alreadySynced, skipped, alreadySynced, total };
}

// ── Cloud → Local (delta pull, id-based) ────────────────────────────────────────

/**
 * Pulls cloud data into local SQLite via the delta endpoint (since=empty for a
 * full pull) and applies each row with localApplyServerChange (last-write-wins)
 * / localApplyTombstone. No name/fingerprint dedup — everything is by shared id.
 *
 * @param {(done: number, total: number, step: string) => void} onProgress
 * @returns {{ synced, skipped, alreadySynced, total }}
 */
export async function syncCloudToLocal(onProgress) {
  return pullDelta('', onProgress);
}

/**
 * Core delta-pull used by syncCloudToLocal AND the AutoSyncMonitor's incremental
 * pulls. Returns { synced, skipped, alreadySynced, total, server_time } so the
 * caller can persist the next cursor.
 */
export async function pullDelta(since, onProgress) {
  let done = 0, skipped = 0, alreadySynced = 0;

  let cloud = null;
  try { cloud = await apiGetSyncChanges(since || ''); }
  catch { return { synced: 0, skipped: 0, alreadySynced: 0, total: 0, server_time: null }; }

  const groups = [
    ['book',         cloud.books],
    ['category',     cloud.categories],
    ['customer',     cloud.customers],
    ['supplier',     cloud.suppliers],
    ['payment_mode', cloud.payment_modes],
    ['entry',        cloud.entries],
  ];
  const deletedEntryIds = cloud.deleted_entry_ids ?? [];

  const total = groups.reduce((n, [, rows]) => n + (rows?.length ?? 0), 0) + deletedEntryIds.length;
  onProgress?.(done, total, 'Applying cloud changes…');

  // Books first so child rows have their parent present, entries last so their
  // balances recompute against fully-applied categories/contacts/modes.
  for (const [entity, rows] of groups) {
    for (const row of rows ?? []) {
      try {
        if (row.deleted_at) {
          await L.localApplyTombstone(entity, row.id);
          done++; onProgress?.(done, total, `Removing ${entity}…`);
        } else {
          const applied = await L.localApplyServerChange(entity, row);
          if (applied) { done++; onProgress?.(done, total, `Downloaded ${entity}…`); }
          else         { alreadySynced++; done++; onProgress?.(done, total, `${entity} up to date`); }
        }
      } catch { skipped++; done++; onProgress?.(done, total, `Skipped ${entity}`); }
    }
  }

  // Hard-deleted entry tombstones
  for (const id of deletedEntryIds) {
    try { await L.localApplyTombstone('entry', id); }
    catch { skipped++; }
    done++; onProgress?.(done, total, 'Removing entry…');
  }

  return {
    synced: done - skipped - alreadySynced,
    skipped,
    alreadySynced,
    total,
    server_time: cloud.server_time ?? null,
  };
}
