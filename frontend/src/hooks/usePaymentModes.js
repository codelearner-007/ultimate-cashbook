import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  apiGetPaymentModes, apiCreatePaymentMode,
  apiUpdatePaymentMode, apiDeletePaymentMode,
  apiReorderPaymentModes, apiGetPaymentModeEntries,
} from '../lib/dataSource';
import Toast from '../lib/toast';

export const paymentModeKeys = {
  all:     (bookId)          => ['payment-modes', bookId],
  entries: (bookId, modeId) => ['payment-mode-entries', bookId, modeId],
};

export function usePaymentModes(bookId) {
  return useQuery({
    queryKey: paymentModeKeys.all(bookId),
    queryFn:  () => apiGetPaymentModes(bookId),
    staleTime: 1000 * 60 * 2,
    enabled:  !!bookId,
  });
}

export function useCreatePaymentMode(bookId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => apiCreatePaymentMode(bookId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: paymentModeKeys.all(bookId) }),
  });
}

export function useUpdatePaymentMode(bookId, modeId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => apiUpdatePaymentMode(bookId, modeId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: paymentModeKeys.all(bookId) }),
  });
}

export function usePaymentModeEntries(bookId, modeId) {
  return useQuery({
    queryKey: paymentModeKeys.entries(bookId, modeId),
    queryFn:  () => apiGetPaymentModeEntries(bookId, modeId),
    staleTime: 1000 * 60 * 2,
    enabled:  !!bookId && !!modeId,
  });
}

export function useDeletePaymentMode(bookId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (modeId) => apiDeletePaymentMode(bookId, modeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: paymentModeKeys.all(bookId) });
      qc.invalidateQueries({ queryKey: ['entries', bookId] });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to delete payment mode', text2: 'Please try again.' }),
  });
}

export function useReorderPaymentModes(bookId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds) => apiReorderPaymentModes(bookId, orderedIds),
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: paymentModeKeys.all(bookId) });
      const prev = qc.getQueryData(paymentModeKeys.all(bookId));
      qc.setQueryData(paymentModeKeys.all(bookId), (old = []) => {
        const byId = Object.fromEntries(old.map(m => [m.id, m]));
        return orderedIds.map((id, i) => ({ ...byId[id], display_order: i })).filter(Boolean);
      });
      return { prev };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(paymentModeKeys.all(bookId), ctx.prev);
      Toast.show({ type: 'error', text1: 'Failed to save order', text2: 'Please try again.' });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: paymentModeKeys.all(bookId) }),
  });
}
