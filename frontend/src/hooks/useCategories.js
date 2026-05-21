import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  apiGetCategories, apiCreateCategory,
  apiUpdateCategory, apiDeleteCategory, apiGetCategoryEntries,
  apiReorderCategories,
} from '../lib/dataSource';
import Toast from '../lib/toast';

export const categoryKeys = {
  all:     (bookId)              => ['categories', bookId],
  entries: (bookId, categoryId) => ['category-entries', bookId, categoryId],
};

export function useCategories(bookId) {
  return useQuery({
    queryKey:        categoryKeys.all(bookId),
    queryFn:         () => apiGetCategories(bookId),
    staleTime:       0,
    refetchOnFocus:  true,
    refetchInterval: 8000,
    enabled:         !!bookId,
  });
}

export function useCategoryEntries(bookId, categoryId) {
  return useQuery({
    queryKey:        categoryKeys.entries(bookId, categoryId),
    queryFn:         () => apiGetCategoryEntries(bookId, categoryId),
    staleTime:       0,
    refetchOnFocus:  true,
    refetchInterval: 8000,
    enabled:         !!bookId && !!categoryId,
  });
}

export function useCreateCategory(bookId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => apiCreateCategory(bookId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: categoryKeys.all(bookId) }),
  });
}

export function useUpdateCategory(bookId, categoryId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => apiUpdateCategory(bookId, categoryId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: categoryKeys.all(bookId) }),
  });
}

export function useDeleteCategory(bookId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (categoryId) => apiDeleteCategory(bookId, categoryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: categoryKeys.all(bookId) });
      qc.invalidateQueries({ queryKey: ['entries', bookId] });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to delete category', text2: 'Please try again.' }),
  });
}

export function useReorderCategories(bookId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds) => apiReorderCategories(bookId, orderedIds),
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: categoryKeys.all(bookId) });
      const prev = qc.getQueryData(categoryKeys.all(bookId));
      qc.setQueryData(categoryKeys.all(bookId), (old = []) => {
        const byId = Object.fromEntries(old.map(c => [c.id, c]));
        return orderedIds.map((id, i) => ({ ...byId[id], display_order: i })).filter(Boolean);
      });
      return { prev };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(categoryKeys.all(bookId), ctx.prev);
      Toast.show({ type: 'error', text1: 'Failed to save order', text2: 'Please try again.' });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: categoryKeys.all(bookId) }),
  });
}
