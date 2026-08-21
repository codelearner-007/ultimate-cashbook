// Build-time feature flags for this release.
//
// This build ships as a free-tier-only release: every subscription/upgrade/
// payment surface and the entire book-sharing (collaborator) feature are
// hidden from the UI via these two flags. Nothing was deleted — flip either
// flag back to `true` to restore the corresponding UI with no other code
// changes required.
export const SUBSCRIPTIONS_ENABLED = false;
export const SHARED_BOOKS_ENABLED = false;
