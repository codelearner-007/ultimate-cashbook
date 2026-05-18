import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  apiGetCategories, apiCreateCategory,
  apiUpdateCategory, apiDeleteCategory, apiGetCategoryEntries,
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
