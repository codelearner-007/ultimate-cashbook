import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  apiGetPaymentModes, apiCreatePaymentMode,
  apiUpdatePaymentMode, apiDeletePaymentMode,
  apiGetPaymentModeEntries,
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
