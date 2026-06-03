/**
 * Sync engine — bidirectional sync between local SQLite and cloud API.
 *
 * syncLocalToCloud — uploads local data to cloud (upgrade / reconnect)
 * syncCloudToLocal — downloads cloud data into local SQLite (new device / reinstall)
 *
 * Both directions are duplicate-safe:
 *   - Books matched by name (case-insensitive)
 *   - Categories / customers / suppliers matched by name within their book
 *   - Entries matched by fingerprint: date + time + type + amount + remark
 *
 * Return value for both: { synced, skipped, alreadySynced, total }
 */

import * as L from './localDb';
import { localSetBookCloudId } from './localDb';
import {
  apiGetBooks,
  apiCreateBook,
  apiGetEntries,
  apiCreateEntry,
  apiUpdateEntry,
  apiGetCategories,
  apiCreateCategory,
  apiGetCustomers,
  apiCreateCustomer,
  apiGetSuppliers,
  apiCreateSupplier,
  apiGetPaymentModes,
  apiCreatePaymentMode,
  apiUploadAttachment,
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

/**
 * Compares local SQLite data against the current cloud state.
 * Returns a delta breakdown so the UI can show exactly what would be uploaded
 * (as opposed to raw local totals, which are misleading for re-subscribers).
 *
 * Return shape:
 *   hasCloudData        — true if the user already has books in cloud
 *   localEntries        — total entries in local DB
 *   newEntries          — local entries NOT in cloud (new or edited since last sync)
 *   alreadySyncedEntries — local entries that match a cloud fingerprint exactly
 *   onlyInCloudEntries  — cloud entries with no local match (deleted/edited locally)
 *   newBooks            — local books not yet created in cloud
 *   toUpload            — total items that would actually be sent (newBooks + newEntries)
 */
export async function getCloudDeltaStats() {
  try {
    const data = await L.localGetAllDataForMigration();

    // ── Fetch cloud books ──────────────────────────────────────────────────────
    let cloudBooks = [];
    try { cloudBooks = await apiGetBooks(); } catch { /* no network — treat as no cloud data */ }

    const hasCloudData = cloudBooks.length > 0;
    const cloudBookByName = {};
    for (const b of cloudBooks) cloudBookByName[key(b.name)] = b;

    // Map local book ID → cloud book ID (matched by name)
    const bookIdMap = {};
    let newBooks = 0;
    for (const book of data.books) {
      const existing = cloudBookByName[key(book.name)];
      if (existing) {
        bookIdMap[book.id] = existing.id;
      } else {
        newBooks++;
      }
    }

    // ── Fetch cloud entries for every matched book ─────────────────────────────
    const cloudFPSet = {};  // cloudBookId → Set<fingerprint>
    const uniqueCloudIds = [...new Set(Object.values(bookIdMap))];
    await Promise.all(
      uniqueCloudIds.map(async (cloudBookId) => {
        const entries = await apiGetEntries(cloudBookId).catch(() => []);
        cloudFPSet[cloudBookId] = new Set(entries.map(entryFingerprint));
      })
    );

    // ── Diff local entries against cloud ──────────────────────────────────────
    let newEntries          = 0;
    let alreadySyncedEntries = 0;
    const matchedFPs = {};  // cloudBookId → Set<fingerprint> (cloud FPs we found locally)
    for (const cid of uniqueCloudIds) matchedFPs[cid] = new Set();

    for (const entry of data.entries) {
      const cloudBookId = bookIdMap[entry.book_id];
      if (!cloudBookId) { newEntries++; continue; }  // book not in cloud → entry is new

      const fp = entryFingerprint(entry);
      if ((cloudFPSet[cloudBookId] ?? new Set()).has(fp)) {
        alreadySyncedEntries++;
        matchedFPs[cloudBookId].add(fp);
      } else {
        newEntries++;
      }
    }

    // ── Count cloud entries with no local match ────────────────────────────────
    // These were either deleted locally, or are old versions of edited entries.
    let onlyInCloudEntries = 0;
    for (const [cloudBookId, fps] of Object.entries(cloudFPSet)) {
      const matched = matchedFPs[cloudBookId] ?? new Set();
      for (const fp of fps) {
        if (!matched.has(fp)) onlyInCloudEntries++;
      }
    }

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

// ── Helpers ───────────────────────────────────────────────────────────────────

const key = (str) => (str ?? '').trim().toLowerCase();

const entryFingerprint = (e) =>
  `${e.entry_date}|${e.entry_time ?? '00:00'}|${e.type}|${e.amount}|${key(e.remark)}`;

// ── Main sync ─────────────────────────────────────────────────────────────────

/**
 * Uploads all local SQLite data to the cloud, skipping anything already there.
 *
 * @param {(done: number, total: number, step: string) => void} onProgress
 * @returns {{ synced: number, skipped: number, alreadySynced: number, total: number }}
 */
export async function syncLocalToCloud(onProgress) {
  const data = await L.localGetAllDataForMigration();

  const total = data.books.length + data.categories.length + data.customers.length +
                data.suppliers.length + data.payment_modes.length + data.entries.length;

  let done          = 0;
  let skipped       = 0;
  let alreadySynced = 0;

  const tick    = (step) => { done++;                       onProgress?.(done, total, step); };
  const skip    = (step) => { skipped++;       done++;      onProgress?.(done, total, step); };
  const already = (step) => { alreadySynced++; done++;      onProgress?.(done, total, step); };

  // ── Fetch existing cloud books ───────────────────────────────────────────────
  let cloudBooks = [];
  try { cloudBooks = await apiGetBooks(); } catch { /* proceed without cloud state — will create all */ }

  // name (lowercased) → cloud book object
  const cloudBookByName = {};
  for (const b of cloudBooks) cloudBookByName[key(b.name)] = b;

  // ── 1. Books ─────────────────────────────────────────────────────────────────
  const bookIdMap = {};   // localId → cloudId

  for (const book of data.books) {
    const existing = cloudBookByName[key(book.name)];
    if (existing) {
      // Reuse the existing cloud book — do NOT create a duplicate
      bookIdMap[book.id] = existing.id;
      localSetBookCloudId(book.id, existing.id).catch(() => {});
      tick(`Checking book: ${book.name}`);
    } else {
      try {
        const cloud = await apiCreateBook(book.name, book.currency ?? 'PKR');
        bookIdMap[book.id] = cloud.id;
        localSetBookCloudId(book.id, cloud.id).catch(() => {});
        tick(`Uploading book: ${book.name}`);
      } catch {
        skip(`Skipped book: ${book.name}`);
      }
    }
  }

  // ── Prefetch cloud state for all matched books ───────────────────────────────
  // Runs in parallel per book so we don't hammer the API sequentially.
  const cloudCats   = {};   // cloudBookId → [categories]
  const cloudCusts  = {};   // cloudBookId → [customers]
  const cloudSupps  = {};   // cloudBookId → [suppliers]
  const cloudEntryFP = {};  // cloudBookId → Set<fingerprint>

  const uniqueCloudIds = [...new Set(Object.values(bookIdMap))];
  await Promise.all(
    uniqueCloudIds.map(async (cloudBookId) => {
      const [cats, custs, supps, entries] = await Promise.all([
        apiGetCategories(cloudBookId).catch(() => []),
        apiGetCustomers(cloudBookId).catch(() => []),
        apiGetSuppliers(cloudBookId).catch(() => []),
        apiGetEntries(cloudBookId).catch(() => []),
      ]);
      cloudCats[cloudBookId]    = cats;
      cloudCusts[cloudBookId]   = custs;
      cloudSupps[cloudBookId]   = supps;
      cloudEntryFP[cloudBookId] = new Set(entries.map(entryFingerprint));
    })
  );

  // ── 2. Categories ─────────────────────────────────────────────────────────────
  const catIdMap = {};

  for (const cat of data.categories) {
    const cloudBookId = bookIdMap[cat.book_id];
    if (!cloudBookId) { skip('Skipped category (book not synced)'); continue; }

    const existing = (cloudCats[cloudBookId] ?? [])
      .find(c => key(c.name) === key(cat.name));

    if (existing) {
      catIdMap[cat.id] = existing.id;
      already(`Category already synced: ${cat.name}`);
    } else {
      try {
        const cloud = await apiCreateCategory(cloudBookId, { name: cat.name });
        catIdMap[cat.id] = cloud.id;
        tick(`Uploading category: ${cat.name}`);
      } catch {
        skip(`Skipped category: ${cat.name}`);
      }
    }
  }

  // ── 3. Customers ──────────────────────────────────────────────────────────────
  const custIdMap = {};

  for (const c of data.customers) {
    const cloudBookId = bookIdMap[c.book_id];
    if (!cloudBookId) { skip('Skipped customer'); continue; }

    const existing = (cloudCusts[cloudBookId] ?? [])
      .find(x => key(x.name) === key(c.name));

    if (existing) {
      custIdMap[c.id] = existing.id;
      already(`Customer already synced: ${c.name}`);
    } else {
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
  }

  // ── 4. Suppliers ──────────────────────────────────────────────────────────────
  const suppIdMap = {};

  for (const s of data.suppliers) {
    const cloudBookId = bookIdMap[s.book_id];
    if (!cloudBookId) { skip('Skipped supplier'); continue; }

    const existing = (cloudSupps[cloudBookId] ?? [])
      .find(x => key(x.name) === key(s.name));

    if (existing) {
      suppIdMap[s.id] = existing.id;
      already(`Supplier already synced: ${s.name}`);
    } else {
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
  }

  // ── 5. Payment modes (seeded by cloud trigger — just tick progress) ───────────
  for (const pm of data.payment_modes) {
    tick(`Payment mode: ${pm.name}`);
  }

  // ── 6. Entries ────────────────────────────────────────────────────────────────
  for (const entry of data.entries) {
    const cloudBookId = bookIdMap[entry.book_id];
    if (!cloudBookId) { skip('Skipped entry (book not synced)'); continue; }

    const fp = entryFingerprint(entry);
    if ((cloudEntryFP[cloudBookId] ?? new Set()).has(fp)) {
      already('Entry already synced');
      continue;
    }

    try {
      const cloudEntry = await apiCreateEntry(cloudBookId, {
        type:         entry.type,
        amount:       entry.amount,
        remark:       entry.remark      ?? null,
        category:     entry.category    ?? null,
        category_id:  catIdMap[entry.category_id]  ?? null,
        payment_mode: entry.payment_mode ?? 'cash',
        contact_name: entry.contact_name ?? null,
        customer_id:  custIdMap[entry.customer_id] ?? null,
        supplier_id:  suppIdMap[entry.supplier_id] ?? null,
        entry_date:   entry.entry_date,
        entry_time:   entry.entry_time  ?? '00:00',
      });

      // Upload local attachment to cloud storage
      if (entry.attachment_provider === 'local' && entry.attachment_path && cloudEntry?.id) {
        try {
          const isPdf    = entry.attachment_path.toLowerCase().endsWith('.pdf');
          const mimeType = isPdf ? 'application/pdf' : 'image/jpeg';
          const filename = isPdf ? 'attachment.pdf'  : 'attachment.jpg';
          const uploaded = await apiUploadAttachment(entry.attachment_path, mimeType, filename, cloudEntry.id);
          await apiUpdateEntry(cloudBookId, cloudEntry.id, {
            attachment_url:      uploaded.attachment_url,
            attachment_path:     uploaded.path,
            attachment_provider: uploaded.provider ?? 'supabase',
          });
        } catch {
          // Attachment upload failed — entry data is saved; image stays local
        }
      }

      tick('Uploading entry…');
    } catch {
      skip('Skipped entry');
    }
  }

  return { synced: done - skipped - alreadySynced, skipped, alreadySynced, total };
}

// ── Cloud → Local pull ────────────────────────────────────────────────────────

/**
 * Downloads all cloud data into local SQLite.
 * Used when a paid/superadmin user logs in on a new device with no local data.
 *
 * Duplicate-safe: records that already exist locally (matched by name/fingerprint)
 * are skipped — safe to re-run without creating duplicates.
 *
 * @param {(done: number, total: number, step: string) => void} onProgress
 * @returns {{ synced: number, skipped: number, alreadySynced: number, total: number }}
 */
export async function syncCloudToLocal(onProgress) {
  let done          = 0;
  let skipped       = 0;
  let alreadySynced = 0;
  let total         = 0;

  const tick    = (step) => { done++;                       onProgress?.(done, total, step); };
  const skip    = (step) => { skipped++;       done++;      onProgress?.(done, total, step); };
  const already = (step) => { alreadySynced++; done++;      onProgress?.(done, total, step); };

  // ── Fetch all cloud books ────────────────────────────────────────────────────
  let cloudBooks = [];
  try { cloudBooks = await apiGetBooks(); } catch { return { synced: 0, skipped: 0, alreadySynced: 0, total: 0 }; }

  if (cloudBooks.length === 0) return { synced: 0, skipped: 0, alreadySynced: 0, total: 0 };

  // Compute rough total for progress (books + entries per book estimated after first fetch)
  total = cloudBooks.length;
  onProgress?.(0, total, 'Fetching cloud data…');

  // Fetch all sub-data in parallel across books
  const bookData = await Promise.all(
    cloudBooks.map(async (book) => {
      const [cats, custs, supps, pms, entries] = await Promise.all([
        apiGetCategories(book.id).catch(() => []),
        apiGetCustomers(book.id).catch(() => []),
        apiGetSuppliers(book.id).catch(() => []),
        apiGetPaymentModes(book.id).catch(() => []),
        apiGetEntries(book.id).catch(() => []),
      ]);
      return { book, cats, custs, supps, pms, entries };
    })
  );

  // Recompute total with actual entry counts
  total = bookData.reduce((sum, d) =>
    sum + 1 + d.cats.length + d.custs.length + d.supps.length + d.pms.length + d.entries.length, 0);
  onProgress?.(done, total, 'Starting…');

  // ── Fetch existing local state for dedup ─────────────────────────────────────
  const localData = await L.localGetAllDataForMigration().catch(() => ({
    books: [], categories: [], customers: [], suppliers: [], payment_modes: [], entries: [],
  }));

  const localBookByName    = {};
  for (const b of localData.books) localBookByName[key(b.name)] = b;

  const localEntryFPByBook = {};  // localBookId → Set<fingerprint>
  for (const e of localData.entries) {
    if (!localEntryFPByBook[e.book_id]) localEntryFPByBook[e.book_id] = new Set();
    localEntryFPByBook[e.book_id].add(entryFingerprint(e));
  }

  // ── Process each cloud book ──────────────────────────────────────────────────
  for (const { book: cloudBook, cats, custs, supps, pms, entries } of bookData) {

    // ── Book ──────────────────────────────────────────────────────────────────
    let localBook = localBookByName[key(cloudBook.name)];
    if (localBook) {
      // Already exists locally — just ensure cloud_id is linked
      await L.localSetBookCloudId(localBook.id, cloudBook.id).catch(() => {});
      already(`Book already local: ${cloudBook.name}`);
    } else {
      try {
        localBook = await L.localCreateBook(cloudBook.name, cloudBook.currency ?? 'PKR');
        await L.localSetBookCloudId(localBook.id, cloudBook.id).catch(() => {});
        tick(`Downloaded book: ${cloudBook.name}`);
      } catch {
        skip(`Skipped book: ${cloudBook.name}`);
        // Skip all sub-data for this book too
        const sub = cats.length + custs.length + supps.length + pms.length + entries.length;
        skipped  += sub;
        done     += sub;
        onProgress?.(done, total, 'Skipping book sub-data…');
        continue;
      }
    }

    const localBookId = localBook.id;

    // ── Categories ────────────────────────────────────────────────────────────
    const localCatByName = {};
    for (const c of (localData.categories ?? []).filter(c => c.book_id === localBookId)) {
      localCatByName[key(c.name)] = c;
    }

    for (const cat of cats) {
      if (localCatByName[key(cat.name)]) {
        already(`Category already local: ${cat.name}`);
      } else {
        try {
          await L.localCreateCategory(localBookId, cat.name);
          tick(`Downloaded category: ${cat.name}`);
        } catch {
          skip(`Skipped category: ${cat.name}`);
        }
      }
    }

    // ── Customers ─────────────────────────────────────────────────────────────
    const localCustByName = {};
    for (const c of (localData.customers ?? []).filter(c => c.book_id === localBookId)) {
      localCustByName[key(c.name)] = c;
    }

    for (const cust of custs) {
      if (localCustByName[key(cust.name)]) {
        already(`Customer already local: ${cust.name}`);
      } else {
        try {
          await L.localCreateCustomer(localBookId, {
            name: cust.name, phone: cust.phone ?? null,
            email: cust.email ?? null, address: cust.address ?? null,
          });
          tick(`Downloaded customer: ${cust.name}`);
        } catch {
          skip(`Skipped customer: ${cust.name}`);
        }
      }
    }

    // ── Suppliers ─────────────────────────────────────────────────────────────
    const localSuppByName = {};
    for (const s of (localData.suppliers ?? []).filter(s => s.book_id === localBookId)) {
      localSuppByName[key(s.name)] = s;
    }

    for (const supp of supps) {
      if (localSuppByName[key(supp.name)]) {
        already(`Supplier already local: ${supp.name}`);
      } else {
        try {
          await L.localCreateSupplier(localBookId, {
            name: supp.name, phone: supp.phone ?? null,
            email: supp.email ?? null, address: supp.address ?? null,
          });
          tick(`Downloaded supplier: ${supp.name}`);
        } catch {
          skip(`Skipped supplier: ${supp.name}`);
        }
      }
    }

    // ── Payment modes ─────────────────────────────────────────────────────────
    const localPmByName = {};
    for (const p of (localData.payment_modes ?? []).filter(p => p.book_id === localBookId)) {
      localPmByName[key(p.name)] = p;
    }

    for (const pm of pms) {
      if (localPmByName[key(pm.name)]) {
        already(`Payment mode already local: ${pm.name}`);
      } else {
        try {
          await L.localCreatePaymentMode(localBookId, pm.name);
          tick(`Downloaded payment mode: ${pm.name}`);
        } catch {
          skip(`Skipped payment mode: ${pm.name}`);
        }
      }
    }

    // ── Entries ───────────────────────────────────────────────────────────────
    const localFPs = localEntryFPByBook[localBookId] ?? new Set();

    for (const entry of entries) {
      const fp = entryFingerprint(entry);
      if (localFPs.has(fp)) {
        already('Entry already local');
        continue;
      }

      try {
        await L.localCreateEntry(localBookId, {
          type:            entry.type,
          amount:          entry.amount,
          remark:          entry.remark       ?? null,
          category:        entry.category     ?? null,
          category_id:     null,   // local IDs differ from cloud IDs
          payment_mode:    entry.payment_mode ?? 'cash',
          payment_mode_id: null,
          contact_name:    entry.contact_name ?? null,
          customer_id:     null,
          supplier_id:     null,
          entry_date:      entry.entry_date,
          entry_time:      entry.entry_time   ?? '00:00',
          attachment_url:  entry.attachment_url  ?? null,
          attachment_path: entry.attachment_path ?? null,
          attachment_provider: entry.attachment_url ? 'supabase' : null,
        });
        localFPs.add(fp);
        tick('Downloaded entry…');
      } catch {
        skip('Skipped entry');
      }
    }
  }

  return { synced: done - skipped - alreadySynced, skipped, alreadySynced, total };
}
