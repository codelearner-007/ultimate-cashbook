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

import * as FileSystem from 'expo-file-system/legacy';
import * as L from './localDb';
import { localSetBookCloudId, localSetEntryCloudId, localGetDeletedEntries, localClearDeletedEntry } from './localDb';
import {
  apiGetBooks,
  apiCreateBook,
  apiDeleteBook as apiDeleteCloudBook,
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
  apiDeleteEntry as apiDeleteCloudEntry,
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
    let newEntries           = 0;  // new entries + offline-edited entries (need push)
    let alreadySyncedEntries = 0;  // fingerprint exact match — nothing to do
    const matchedFPs = {};         // cloudBookId → Set<fingerprint> (cloud FPs matched locally)
    for (const cid of uniqueCloudIds) matchedFPs[cid] = new Set();

    for (const entry of data.entries) {
      const cloudBookId = bookIdMap[entry.book_id];
      if (!cloudBookId) { newEntries++; continue; }

      const fp  = entryFingerprint(entry);
      const fps = cloudFPSet[cloudBookId] ?? new Set();

      if (fps.has(fp)) {
        // Exact fingerprint match — already in cloud
        alreadySyncedEntries++;
        matchedFPs[cloudBookId].add(fp);
      } else if (entry.cloud_entry_id) {
        // Has a cloud ID but fingerprint changed — edited offline, needs update push
        newEntries++;
      } else {
        // No cloud ID, no fingerprint match — genuinely new
        newEntries++;
      }
    }

    // ── Count cloud entries with no local match ────────────────────────────────
    // These are old versions of edited entries (replaced by the update above) or
    // entries deleted locally while offline. Both need attention.
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
 * @returns {Promise<{ synced: number, skipped: number, alreadySynced: number, total: number }>}
 */
export async function syncLocalToCloud(onProgress) {
  const data       = await L.localGetAllDataForMigration();
  const tombstones = await localGetDeletedEntries();

  const total = data.books.length + data.categories.length + data.customers.length +
                data.suppliers.length + data.payment_modes.length + data.entries.length +
                tombstones.length;

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

  // ── Delete from cloud any books removed locally ──────────────────────────────
  // Only runs if this device has previously synced (has cloud_id links).
  // A cloud book with no local cloud_id match was deleted locally — remove it.
  const allLocalBooks = await L.localGetBooks();
  const localCloudIds = new Set(allLocalBooks.map(b => b.cloud_id).filter(Boolean));

  if (localCloudIds.size > 0) {
    for (const cloudBook of cloudBooks) {
      if (!localCloudIds.has(cloudBook.id)) {
        try {
          await apiDeleteCloudBook(cloudBook.id);
          tick(`Deleted from cloud: ${cloudBook.name}`);
        } catch (err) {
          if (err?.response?.status !== 404) {
            skip(`Could not delete cloud book: ${cloudBook.name}`);
          }
        }
      }
    }
  }

  // ── Prefetch cloud state for all matched books ───────────────────────────────
  // Runs in parallel per book so we don't hammer the API sequentially.
  const cloudCats    = {};   // cloudBookId → [categories]
  const cloudCusts   = {};   // cloudBookId → [customers]
  const cloudSupps   = {};   // cloudBookId → [suppliers]
  const cloudEntryFP = {};   // cloudBookId → Map<fingerprint, cloudEntryId>
  // Also index cloud entries by their own ID for O(1) lookup during update reconciliation.
  const cloudEntryById = {}; // cloudBookId → Map<cloudEntryId, cloudEntry>

  const uniqueCloudIds = [...new Set(Object.values(bookIdMap))];
  await Promise.all(
    uniqueCloudIds.map(async (cloudBookId) => {
      const [cats, custs, supps, entries] = await Promise.all([
        apiGetCategories(cloudBookId).catch(() => []),
        apiGetCustomers(cloudBookId).catch(() => []),
        apiGetSuppliers(cloudBookId).catch(() => []),
        apiGetEntries(cloudBookId).catch(() => []),
      ]);
      cloudCats[cloudBookId]     = cats;
      cloudCusts[cloudBookId]    = custs;
      cloudSupps[cloudBookId]    = supps;
      // Map fingerprint → cloud entry ID so we can detect exact matches
      const fpMap  = new Map();
      const idMap  = new Map();
      for (const e of entries) {
        fpMap.set(entryFingerprint(e), e.id);
        idMap.set(e.id, e);
      }
      cloudEntryFP[cloudBookId]   = fpMap;
      cloudEntryById[cloudBookId] = idMap;
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
  // Three cases for each local entry:
  //   A) Fingerprint matches a cloud entry exactly → already synced, skip.
  //   B) Entry has a cloud_entry_id but fingerprint differs → edited offline, update the cloud row.
  //   C) No fingerprint match and no cloud_entry_id → genuinely new, create in cloud.
  for (const entry of data.entries) {
    const cloudBookId = bookIdMap[entry.book_id];
    if (!cloudBookId) { skip('Skipped entry (book not synced)'); continue; }

    const fp    = entryFingerprint(entry);
    const fpMap = cloudEntryFP[cloudBookId] ?? new Map();

    // Case A — exact fingerprint match: already in cloud, nothing to do
    if (fpMap.has(fp)) {
      // Back-fill cloud_entry_id if it wasn't stored yet (e.g. entry was created
      // before cloud_entry_id tracking was introduced, or the first push happened
      // while offline and the link was never written).
      if (!entry.cloud_entry_id) {
        const cloudId = fpMap.get(fp);
        localSetEntryCloudId(entry.id, cloudId).catch(() => {});
      }
      already('Entry already synced');
      continue;
    }

    // For supabase-provider attachments the URL is already in cloud storage — pass it through.
    // Local-provider attachments are handled below in Case C (upload on new entry creation).
    // For Case B (edit of existing entry), if the attachment is still local we attempt upload too.
    const payload = {
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
      attachment_url:      (entry.attachment_provider === 'supabase') ? (entry.attachment_url  ?? null) : null,
      attachment_path:     (entry.attachment_provider === 'supabase') ? (entry.attachment_path ?? null) : null,
      attachment_provider: (entry.attachment_provider === 'supabase') ? 'supabase' : null,
    };

    // Case B — has a known cloud ID but fingerprint changed: update the existing cloud row
    if (entry.cloud_entry_id && (cloudEntryById[cloudBookId] ?? new Map()).has(entry.cloud_entry_id)) {
      try {
        let updatePayload = payload;

        // If the edited entry still has a local-provider attachment, upload it to Supabase now
        if (entry.attachment_provider === 'local' && entry.attachment_path) {
          try {
            const isPdf    = entry.attachment_path.toLowerCase().endsWith('.pdf');
            const mimeType = isPdf ? 'application/pdf' : 'image/jpeg';
            const filename = isPdf ? 'attachment.pdf'  : 'attachment.jpg';
            const uploaded = await apiUploadAttachment(entry.attachment_path, mimeType, filename, entry.cloud_entry_id);
            const attachPatch = {
              attachment_url:      uploaded.attachment_url,
              attachment_path:     uploaded.path,
              attachment_provider: uploaded.provider ?? 'supabase',
            };
            updatePayload = { ...payload, ...attachPatch };
            // Mirror Supabase URL back to local so it's correct going forward
            L.localUpdateEntry(entry.book_id, entry.id, attachPatch).catch(() => {});
          } catch {
            // Upload failed — sync entry data without attachment; image stays local
          }
        }

        await apiUpdateEntry(cloudBookId, entry.cloud_entry_id, updatePayload);
        // Update the fpMap so subsequent entries in the same book don't see a stale state
        fpMap.set(fp, entry.cloud_entry_id);
        tick('Updating entry…');
      } catch {
        skip('Skipped entry update');
      }
      continue;
    }

    // Case C — genuinely new entry: create in cloud
    try {
      const cloudEntry = await apiCreateEntry(cloudBookId, payload);

      // Store cloud ID for future update/delete targeting
      if (cloudEntry?.id) {
        localSetEntryCloudId(entry.id, cloudEntry.id).catch(() => {});
        fpMap.set(fp, cloudEntry.id);
      }

      // Upload local attachment to cloud storage
      if (entry.attachment_provider === 'local' && entry.attachment_path && cloudEntry?.id) {
        try {
          const isPdf    = entry.attachment_path.toLowerCase().endsWith('.pdf');
          const mimeType = isPdf ? 'application/pdf' : 'image/jpeg';
          const filename = isPdf ? 'attachment.pdf'  : 'attachment.jpg';
          const uploaded = await apiUploadAttachment(entry.attachment_path, mimeType, filename, cloudEntry.id);
          const attachPatch = {
            attachment_url:      uploaded.attachment_url,
            attachment_path:     uploaded.path,
            attachment_provider: uploaded.provider ?? 'supabase',
          };
          await apiUpdateEntry(cloudBookId, cloudEntry.id, attachPatch);
          // Mirror the Supabase URL back into local SQLite so this device also uses the
          // cloud URL going forward (survives future local-data clears and reinstalls).
          L.localUpdateEntry(entry.book_id, entry.id, attachPatch).catch(() => {});
        } catch {
          // Attachment upload failed — entry data is saved; image stays local
        }
      }

      tick('Uploading entry…');
    } catch {
      skip('Skipped entry');
    }
  }

  // ── 7. Delete cloud entries that were removed locally ─────────────────────────
  // localDeleteEntry() records a tombstone (cloud_entry_id + cloud_book_id) in
  // the deleted_entries table whenever an entry with a known cloud ID is deleted.
  // Here we replay those deletions against the cloud and clear each tombstone.
  for (const t of tombstones) {
    try {
      await apiDeleteCloudEntry(t.cloud_book_id, t.cloud_entry_id);
      tick(`Deleting entry from cloud…`);
    } catch (err) {
      // 404 means the cloud row is already gone — still safe to clear the tombstone.
      if (err?.response?.status === 404) {
        tick(`Cloud entry already removed`);
      } else {
        skip(`Could not delete cloud entry`);
        continue; // leave tombstone so it retries on the next sync
      }
    }
    await localClearDeletedEntry(t.id);
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
 * @returns {Promise<{ synced: number, skipped: number, alreadySynced: number, total: number }>}
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

    // ── Resolve local IDs for entries (re-read after categories/contacts/modes are created) ─
    const freshCats  = await L.localGetCategories(localBookId).catch(() => []);
    const freshCusts = await L.localGetCustomers(localBookId).catch(() => []);
    const freshSupps = await L.localGetSuppliers(localBookId).catch(() => []);
    const freshPms   = await L.localGetPaymentModes(localBookId).catch(() => []);

    const catIdByName  = {};
    for (const c of freshCats)  catIdByName[key(c.name)]  = c.id;
    const custIdByName = {};
    for (const c of freshCusts) custIdByName[key(c.name)] = c.id;
    const suppIdByName = {};
    for (const s of freshSupps) suppIdByName[key(s.name)] = s.id;
    const pmIdByName   = {};
    for (const p of freshPms)   pmIdByName[key(p.name)]   = p.id;

    // ── Entries ───────────────────────────────────────────────────────────────
    // localFPs is pre-seeded with fingerprints of entries that existed in local DB
    // before this restore run started — guards against duplicating on re-run.
    const localFPs = new Set(localEntryFPByBook[localBookId] ?? []);

    // Monotonic counter for unique filenames — avoids collisions when two entries
    // are processed within the same millisecond on fast devices.
    let attachSeq = 0;
    const ATTACHMENTS_DIR = `${FileSystem.documentDirectory}attachments/`;

    for (const entry of entries) {
      const fp = entryFingerprint(entry);
      if (localFPs.has(fp)) {
        already('Entry already local');
        continue;
      }

      const resolvedCategoryId  = entry.category     ? (catIdByName[key(entry.category)]          ?? null) : null;
      const resolvedCustomerId  = entry.contact_name ? (custIdByName[key(entry.contact_name)]     ?? null) : null;
      const resolvedSupplierId  = entry.contact_name ? (suppIdByName[key(entry.contact_name)]     ?? null) : null;
      const resolvedPaymentMode = entry.payment_mode ?? 'Cash';
      const resolvedPmId        = pmIdByName[key(resolvedPaymentMode)] ?? null;

      // Download Supabase attachment to local filesystem so it works offline.
      // attachment_url  → local file:/// path   (used for display)
      // attachment_path → Supabase storage path (used for deletion & sync dedup)
      // attachment_provider → 'supabase'        (tells sync: already in cloud, don't re-upload)
      let restoredAttachUrl      = null;
      let restoredAttachPath     = null;
      let restoredAttachProvider = null;

      const cloudUrl = (entry.attachment_provider !== 'local') ? (entry.attachment_url ?? null) : null;
      if (cloudUrl) {
        try {
          await FileSystem.makeDirectoryAsync(ATTACHMENTS_DIR, { intermediates: true });
          const isPdf    = (entry.attachment_path ?? '').toLowerCase().endsWith('.pdf');
          attachSeq++;
          const localDest = `${ATTACHMENTS_DIR}restored_${attachSeq}${isPdf ? '.pdf' : '.jpg'}`;
          // Delete any stale file at this path before downloading (idempotent re-run safety)
          await FileSystem.deleteAsync(localDest, { idempotent: true });
          const result = await FileSystem.downloadAsync(cloudUrl, localDest);
          if (result.status === 200) {
            restoredAttachUrl      = result.uri;
            restoredAttachPath     = entry.attachment_path ?? null;
            restoredAttachProvider = 'supabase';
          } else {
            // Download failed — store Supabase URL as fallback (displays when online)
            restoredAttachUrl      = cloudUrl;
            restoredAttachPath     = entry.attachment_path ?? null;
            restoredAttachProvider = 'supabase';
          }
        } catch {
          // Network or FS error — store Supabase URL as fallback
          restoredAttachUrl      = cloudUrl;
          restoredAttachPath     = entry.attachment_path ?? null;
          restoredAttachProvider = 'supabase';
        }
      }

      try {
        const localEntry = await L.localCreateEntry(localBookId, {
          type:            entry.type,
          amount:          entry.amount,
          remark:          entry.remark       ?? null,
          category:        entry.category     ?? null,
          category_id:     resolvedCategoryId,
          payment_mode:    resolvedPaymentMode,
          payment_mode_id: resolvedPmId,
          contact_name:    entry.contact_name ?? null,
          customer_id:     resolvedCustomerId,
          supplier_id:     resolvedSupplierId,
          entry_date:      entry.entry_date,
          entry_time:      entry.entry_time   ?? '00:00',
          attachment_url:      restoredAttachUrl,
          attachment_path:     restoredAttachPath,
          attachment_provider: restoredAttachProvider,
        });
        // Store cloud UUID → local entry link so future uploads update instead of duplicate
        if (localEntry?.id && entry.id) {
          localSetEntryCloudId(localEntry.id, entry.id).catch(() => {});
        }
        // Add to the in-run fingerprint set so a duplicate cloud entry in the same book
        // doesn't get created twice within this restore session
        localFPs.add(fp);
        tick('Downloaded entry…');
      } catch {
        skip('Skipped entry');
      }
    }
  }

  return { synced: done - skipped - alreadySynced, skipped, alreadySynced, total };
}
