// Web stub — expo-sqlite is native-only.
// Metro resolves this file on web instead of localDb.js (which imports expo-sqlite).
// Free-tier local storage is mobile-only; these are never called on web.
export const localGetBooks                = async () => [];
export const localCreateBook              = async () => null;
export const localUpdateBook              = async () => null;
export const localDeleteBook              = async () => {};
export const localUpdateBookFieldSettings = async () => {};
export const localGetEntries              = async () => [];
export const localGetSummary              = async () => ({ total_in: 0, total_out: 0, net_balance: 0 });
export const localCreateEntry             = async () => null;
export const localUpdateEntry             = async () => null;
export const localDeleteEntry             = async () => {};
export const localDeleteAllEntries        = async () => {};
export const localGetCategories           = async () => [];
export const localCreateCategory          = async () => null;
export const localUpdateCategory          = async () => null;
export const localDeleteCategory          = async () => {};
export const localGetCategoryEntries      = async () => [];
export const localGetCustomers            = async () => [];
export const localCreateCustomer          = async () => null;
export const localGetCustomer             = async () => null;
export const localUpdateCustomer          = async () => null;
export const localDeleteCustomer          = async () => {};
export const localGetCustomerEntries      = async () => [];
export const localGetSuppliers            = async () => [];
export const localCreateSupplier          = async () => null;
export const localGetSupplier             = async () => null;
export const localUpdateSupplier          = async () => null;
export const localDeleteSupplier          = async () => {};
export const localGetSupplierEntries      = async () => [];
export const localGetAllDataForMigration  = async () => ({ books: [], entries: [], categories: [], customers: [], suppliers: [] });
export const localClearAll                = async () => {};
