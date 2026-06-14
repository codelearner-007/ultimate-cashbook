import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  apiGetNotifications,
  apiMarkNotificationRead,
  apiMarkAllNotificationsRead,
  apiDeleteNotification,
  apiBulkDeleteNotifications,
  apiBulkMarkNotificationsRead,
  apiSendNotification,
  apiGetSentNotifications,
} from '../lib/api';

// ── User hooks ────────────────────────────────────────────────────────────────

export function useNotifications({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiGetNotifications(),
    staleTime: 1000 * 60,
    enabled,
  });
}

/** Unread-only query — used by the popup. Polls every 15 s. */
export function useUnreadNotifications({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => apiGetNotifications({ unread: true }),
    staleTime: 0,
    refetchInterval: 15 * 1000,
    enabled,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiMarkNotificationRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: apiMarkAllNotificationsRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiDeleteNotification(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['notifications'] });
      const prev = qc.getQueryData(['notifications']);
      const prevUnread = qc.getQueryData(['notifications', 'unread']);
      qc.setQueryData(['notifications'], (old = []) => old.filter(n => n.id !== id));
      qc.setQueryData(['notifications', 'unread'], (old = []) => old.filter(n => n.id !== id));
      return { prev, prevUnread };
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(['notifications'], ctx.prev);
      if (ctx?.prevUnread !== undefined) qc.setQueryData(['notifications', 'unread'], ctx.prevUnread);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useBulkDeleteNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids) => apiBulkDeleteNotifications(ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: ['notifications'] });
      const idSet = new Set(ids);
      const prev = qc.getQueryData(['notifications']);
      const prevUnread = qc.getQueryData(['notifications', 'unread']);
      qc.setQueryData(['notifications'], (old = []) => old.filter(n => !idSet.has(n.id)));
      qc.setQueryData(['notifications', 'unread'], (old = []) => old.filter(n => !idSet.has(n.id)));
      return { prev, prevUnread };
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(['notifications'], ctx.prev);
      if (ctx?.prevUnread !== undefined) qc.setQueryData(['notifications', 'unread'], ctx.prevUnread);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useBulkMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids) => apiBulkMarkNotificationsRead(ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: ['notifications'] });
      const idSet = new Set(ids);
      const prev = qc.getQueryData(['notifications']);
      const prevUnread = qc.getQueryData(['notifications', 'unread']);
      qc.setQueryData(['notifications'], (old = []) =>
        (old || []).map(n => idSet.has(n.id) ? { ...n, is_read: true } : n),
      );
      qc.setQueryData(['notifications', 'unread'], (old = []) =>
        (old || []).filter(n => !idSet.has(n.id)),
      );
      return { prev, prevUnread };
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(['notifications'], ctx.prev);
      if (ctx?.prevUnread !== undefined) qc.setQueryData(['notifications', 'unread'], ctx.prevUnread);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// ── Admin hooks ───────────────────────────────────────────────────────────────

export function useSendNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => apiSendNotification(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sent-notifications'] });
    },
  });
}

export function useSentNotifications() {
  return useQuery({
    queryKey: ['sent-notifications'],
    queryFn: apiGetSentNotifications,
    staleTime: 1000 * 60 * 2,
  });
}
