/**
 * API Layer — Ultimate CashBook
 * All functions call the real FastAPI backend.
 * The Axios interceptor attaches the Supabase JWT automatically.
 */

import axios from 'axios';
import { supabase } from './supabase';

export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 30000,
});

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) {
    config.headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  return config;
});

// 401 → session is invalid (expired token, or the account was deactivated
// server-side); sign out so AuthGuard redirects to login.
// 403 (forbidden action) and 402 (upgrade required) are NOT auth failures —
// they are surfaced to the calling screen to handle (e.g. show an upgrade sheet).
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await supabase.auth.signOut();
    }
    return Promise.reject(error);
  },
);


// ── Books ──────────────────────────────────────────────────────────────────────

/** GET /api/v1/books */
export const apiGetBooks = async () => {
  return (await api.get('/api/v1/books')).data;
};

/** POST /api/v1/books — pass `id` to use a client-supplied shared UUID */
export const apiCreateBook = async (name, currency = 'PKR', id = undefined) => {
  const body = { name, currency };
  if (id) body.id = id;
  return (await api.post('/api/v1/books', body)).data;
};

/** PUT /api/v1/books/:bookId */
export const apiUpdateBook = async (bookId, payload) => {
  return (await api.put(`/api/v1/books/${bookId}`, payload)).data;
};

/** DELETE /api/v1/books/:bookId */
export const apiDeleteBook = async (bookId) => {
  await api.delete(`/api/v1/books/${bookId}`);
};

/** PATCH /api/v1/books/:bookId/field-settings */
export const apiUpdateBookFieldSettings = async (bookId, fieldSettings) => {
  return (await api.patch(`/api/v1/books/${bookId}/field-settings`, fieldSettings)).data;
};

/** GET /api/v1/books/shared */
export const apiGetSharedBooks = async () => {
  return (await api.get('/api/v1/books/shared')).data;
};

/**
 * GET /api/v1/books/sync/changes?since=<iso8601|empty>
 * Delta pull for multi-device convergence. Returns every row (incl. soft-deleted
 * + entry tombstones) changed since `since`, plus server_time for the next cursor.
 * Shape: { server_time, books, entries, deleted_entry_ids, categories,
 *          customers, suppliers, payment_modes }
 */
export const apiGetSyncChanges = async (since) => {
  const params = since ? { since } : {};
  return (await api.get('/api/v1/books/sync/changes', { params })).data;
};

/** GET /api/v1/books/:bookId/shares */
export const apiGetBookShares = async (bookId) => {
  return (await api.get(`/api/v1/books/${bookId}/shares`)).data;
};

/** POST /api/v1/books/:bookId/shares */
export const apiAddCollaborator = async (bookId, payload) => {
  return (await api.post(`/api/v1/books/${bookId}/shares`, payload)).data;
};

/** PATCH /api/v1/books/:bookId/shares/:shareId */
export const apiUpdateShare = async (bookId, shareId, payload) => {
  return (await api.patch(`/api/v1/books/${bookId}/shares/${shareId}`, payload)).data;
};

/** DELETE /api/v1/books/:bookId/shares/:shareId */
export const apiRemoveCollaborator = async (bookId, shareId) => {
  await api.delete(`/api/v1/books/${bookId}/shares/${shareId}`);
};

/** DELETE /api/v1/books/:bookId/leave  (recipient removes themselves) */
export const apiLeaveSharedBook = async (bookId) => {
  await api.delete(`/api/v1/books/${bookId}/leave`);
};

/** PATCH /api/v1/books/:bookId/shares/:shareId/respond  { action: "accept"|"reject" } */
export const apiRespondToInvitation = async (bookId, shareId, action) => {
  return (await api.patch(`/api/v1/books/${bookId}/shares/${shareId}/respond`, { action })).data;
};

/** GET /api/v1/invitations/received  — all invitations sent to me */
export const apiGetReceivedInvitations = async () => {
  return (await api.get('/api/v1/invitations/received')).data;
};

/** GET /api/v1/invitations/given  — all invitations I sent */
export const apiGetGivenInvitations = async () => {
  return (await api.get('/api/v1/invitations/given')).data;
};

/** GET /api/v1/profile/search?q=... */
export const apiSearchUsers = async (q) => {
  return (await api.get('/api/v1/profile/search', { params: { q } })).data;
};


// ── Profile ────────────────────────────────────────────────────────────────────

/** GET /api/v1/profile */
export const apiGetProfile = async () => {
  return (await api.get('/api/v1/profile')).data;
};

/** PUT /api/v1/profile */
export const apiUpdateProfile = async (payload) => {
  return (await api.put('/api/v1/profile', payload)).data;
};

/** PATCH /api/v1/profile/subscription */
export const apiUpdateSubscription = async ({ tier, billing_cycle = 'monthly' }) => {
  return (await api.patch('/api/v1/profile/subscription', {
    subscription_tier: tier,
    billing_cycle,
  })).data;
};

/** DELETE /api/v1/profile — permanently delete the account and all its data */
export const apiDeleteAccount = async () => {
  await api.delete('/api/v1/profile');
};

/** POST /api/v1/upload/avatar — multipart upload, returns { avatar_url } */
export const apiUploadAvatar = async (uri, mimeType = 'image/jpeg') => {
  const filename = uri.split('/').pop() || 'avatar.jpg';
  const formData = new FormData();
  formData.append('file', { uri, type: mimeType, name: filename });
  return (await api.post('/api/v1/upload/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })).data;
};

/** POST /api/v1/upload/attachment — multipart, returns { attachment_url, path, provider } */
export const apiUploadAttachment = async (uri, mimeType, filename, entryId = null) => {
  const formData = new FormData();
  if (entryId) formData.append('entry_id', entryId);
  formData.append('file', { uri, type: mimeType, name: filename });
  return (await api.post('/api/v1/upload/attachment', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })).data;
};

/** DELETE /api/v1/upload/attachment?path=... */
export const apiDeleteAttachment = async (path) => {
  await api.delete(`/api/v1/upload/attachment?path=${encodeURIComponent(path)}`);
};


// ── Entries ────────────────────────────────────────────────────────────────────

/** GET /api/v1/books/:bookId/entries */
export const apiGetEntries = async (bookId, params = {}) => {
  return (await api.get(`/api/v1/books/${bookId}/entries`, { params })).data;
};

/** GET /api/v1/books/:bookId/summary */
export const apiGetSummary = async (bookId) => {
  return (await api.get(`/api/v1/books/${bookId}/summary`)).data;
};

/** POST /api/v1/books/:bookId/entries */
export const apiCreateEntry = async (bookId, payload) => {
  return (await api.post(`/api/v1/books/${bookId}/entries`, payload)).data;
};

/** PUT /api/v1/books/:bookId/entries/:entryId */
export const apiUpdateEntry = async (bookId, entryId, payload) => {
  return (await api.put(`/api/v1/books/${bookId}/entries/${entryId}`, payload)).data;
};

/** DELETE /api/v1/books/:bookId/entries/:entryId */
export const apiDeleteEntry = async (bookId, entryId) => {
  await api.delete(`/api/v1/books/${bookId}/entries/${entryId}`);
};

/** DELETE /api/v1/books/:bookId/entries — deletes ALL entries in a book */
export const apiDeleteAllEntries = async (bookId) => {
  await api.delete(`/api/v1/books/${bookId}/entries`);
};


// ── Customers ─────────────────────────────────────────────────────────────────

/** GET /api/v1/books/:bookId/customers */
export const apiGetCustomers = async (bookId) =>
  (await api.get(`/api/v1/books/${bookId}/customers`)).data;

/** POST /api/v1/books/:bookId/customers */
export const apiCreateCustomer = async (bookId, payload) =>
  (await api.post(`/api/v1/books/${bookId}/customers`, payload)).data;

/** GET /api/v1/books/:bookId/customers/:id */
export const apiGetCustomer = async (bookId, contactId) =>
  (await api.get(`/api/v1/books/${bookId}/customers/${contactId}`)).data;

/** PUT /api/v1/books/:bookId/customers/:id */
export const apiUpdateCustomer = async (bookId, contactId, payload) =>
  (await api.put(`/api/v1/books/${bookId}/customers/${contactId}`, payload)).data;

/** DELETE /api/v1/books/:bookId/customers/:id */
export const apiDeleteCustomer = async (bookId, contactId) =>
  (await api.delete(`/api/v1/books/${bookId}/customers/${contactId}`)).data;

/** GET /api/v1/books/:bookId/customers/:id/entries */
export const apiGetCustomerEntries = async (bookId, contactId) =>
  (await api.get(`/api/v1/books/${bookId}/customers/${contactId}/entries`)).data;

/** PATCH /api/v1/books/:bookId/customers/reorder */
export const apiReorderCustomers = async (bookId, orderedIds) =>
  (await api.patch(`/api/v1/books/${bookId}/customers/reorder`, { ordered_ids: orderedIds })).data;


// ── Suppliers ─────────────────────────────────────────────────────────────────

/** GET /api/v1/books/:bookId/suppliers */
export const apiGetSuppliers = async (bookId) =>
  (await api.get(`/api/v1/books/${bookId}/suppliers`)).data;

/** POST /api/v1/books/:bookId/suppliers */
export const apiCreateSupplier = async (bookId, payload) =>
  (await api.post(`/api/v1/books/${bookId}/suppliers`, payload)).data;

/** GET /api/v1/books/:bookId/suppliers/:id */
export const apiGetSupplier = async (bookId, contactId) =>
  (await api.get(`/api/v1/books/${bookId}/suppliers/${contactId}`)).data;

/** PUT /api/v1/books/:bookId/suppliers/:id */
export const apiUpdateSupplier = async (bookId, contactId, payload) =>
  (await api.put(`/api/v1/books/${bookId}/suppliers/${contactId}`, payload)).data;

/** DELETE /api/v1/books/:bookId/suppliers/:id */
export const apiDeleteSupplier = async (bookId, contactId) =>
  (await api.delete(`/api/v1/books/${bookId}/suppliers/${contactId}`)).data;

/** GET /api/v1/books/:bookId/suppliers/:id/entries */
export const apiGetSupplierEntries = async (bookId, contactId) =>
  (await api.get(`/api/v1/books/${bookId}/suppliers/${contactId}/entries`)).data;

/** PATCH /api/v1/books/:bookId/suppliers/reorder */
export const apiReorderSuppliers = async (bookId, orderedIds) =>
  (await api.patch(`/api/v1/books/${bookId}/suppliers/reorder`, { ordered_ids: orderedIds })).data;


// ── Categories ────────────────────────────────────────────────────────────────

/** GET /api/v1/books/:bookId/categories */
export const apiGetCategories = async (bookId) =>
  (await api.get(`/api/v1/books/${bookId}/categories`)).data;

/** POST /api/v1/books/:bookId/categories */
export const apiCreateCategory = async (bookId, payload) =>
  (await api.post(`/api/v1/books/${bookId}/categories`, payload)).data;

/** PUT /api/v1/books/:bookId/categories/:categoryId */
export const apiUpdateCategory = async (bookId, categoryId, payload) =>
  (await api.put(`/api/v1/books/${bookId}/categories/${categoryId}`, payload)).data;

/** DELETE /api/v1/books/:bookId/categories/:categoryId */
export const apiDeleteCategory = async (bookId, categoryId) =>
  (await api.delete(`/api/v1/books/${bookId}/categories/${categoryId}`)).data;

/** GET /api/v1/books/:bookId/categories/:categoryId/entries */
export const apiGetCategoryEntries = async (bookId, categoryId) =>
  (await api.get(`/api/v1/books/${bookId}/categories/${categoryId}/entries`)).data;

/** PATCH /api/v1/books/:bookId/categories/reorder */
export const apiReorderCategories = async (bookId, orderedIds) =>
  (await api.patch(`/api/v1/books/${bookId}/categories/reorder`, { ordered_ids: orderedIds })).data;


// ── Payment Modes ─────────────────────────────────────────────────────────────

/** GET /api/v1/books/:bookId/payment-modes */
export const apiGetPaymentModes = async (bookId) =>
  (await api.get(`/api/v1/books/${bookId}/payment-modes`)).data;

/** POST /api/v1/books/:bookId/payment-modes */
export const apiCreatePaymentMode = async (bookId, payload) =>
  (await api.post(`/api/v1/books/${bookId}/payment-modes`, payload)).data;

/** PUT /api/v1/books/:bookId/payment-modes/:modeId */
export const apiUpdatePaymentMode = async (bookId, modeId, payload) =>
  (await api.put(`/api/v1/books/${bookId}/payment-modes/${modeId}`, payload)).data;

/** DELETE /api/v1/books/:bookId/payment-modes/:modeId */
export const apiDeletePaymentMode = async (bookId, modeId) =>
  (await api.delete(`/api/v1/books/${bookId}/payment-modes/${modeId}`)).data;

/** PATCH /api/v1/books/:bookId/payment-modes/reorder */
export const apiReorderPaymentModes = async (bookId, orderedIds) =>
  (await api.patch(`/api/v1/books/${bookId}/payment-modes/reorder`, { ordered_ids: orderedIds })).data;

/** GET /api/v1/books/:bookId/payment-modes/:modeId/entries */
export const apiGetPaymentModeEntries = async (bookId, modeId) =>
  (await api.get(`/api/v1/books/${bookId}/payment-modes/${modeId}/entries`)).data;


// ── Admin (superadmin only) ────────────────────────────────────────────────────

/** GET /api/v1/admin/users */
export const apiGetAllUsers = async () => {
  return (await api.get('/api/v1/admin/users')).data;
};

/** GET /api/v1/admin/users/:userId/books */
export const apiGetUserBooks = async (userId) => {
  return (await api.get(`/api/v1/admin/users/${userId}/books`)).data;
};

/** PATCH /api/v1/admin/users/:userId/status — activate/deactivate a user */
export const apiToggleUserStatus = async (userId, isActive) => {
  return (await api.patch(`/api/v1/admin/users/${userId}/status`, { is_active: isActive })).data;
};


// ── Admin Notifications (superadmin only) ─────────────────────────────────────

/**
 * POST /api/v1/admin/notifications
 * payload: { title, body, target_type: 'all'|'specific', user_ids?: string[] }
 */
export const apiSendNotification = async (payload) => {
  return (await api.post('/api/v1/admin/notifications', payload)).data;
};

/** GET /api/v1/admin/notifications — all notifications sent by this admin */
export const apiGetSentNotifications = async () => {
  return (await api.get('/api/v1/admin/notifications')).data;
};


// ── User Notifications ────────────────────────────────────────────────────────

/** GET /api/v1/notifications[?unread=true] */
export const apiGetNotifications = async ({ unread } = {}) => {
  const params = unread ? { unread: true } : {};
  return (await api.get('/api/v1/notifications', { params })).data;
};

/** PATCH /api/v1/notifications/:id/read */
export const apiMarkNotificationRead = async (id) => {
  return (await api.patch(`/api/v1/notifications/${id}/read`)).data;
};

/** PATCH /api/v1/notifications/read-all */
export const apiMarkAllNotificationsRead = async () => {
  return (await api.patch('/api/v1/notifications/read-all')).data;
};

/** DELETE /api/v1/notifications/:id */
export const apiDeleteNotification = async (id) => {
  return (await api.delete(`/api/v1/notifications/${id}`)).data;
};

/** POST /api/v1/notifications/bulk-delete */
export const apiBulkDeleteNotifications = async (ids) => {
  return (await api.post('/api/v1/notifications/bulk-delete', { ids })).data;
};

/** POST /api/v1/notifications/bulk-read */
export const apiBulkMarkNotificationsRead = async (ids) => {
  return (await api.post('/api/v1/notifications/bulk-read', { ids })).data;
};

/** POST /api/v1/notifications/push-token — register or refresh device push token */
export const apiSavePushToken = async (token, platform) => {
  return (await api.post('/api/v1/notifications/push-token', { token, platform })).data;
};
