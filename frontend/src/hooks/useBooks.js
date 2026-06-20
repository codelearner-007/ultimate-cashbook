import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGetBooks, apiCreateBook, apiUpdateBook, apiDeleteBook } from '../lib/dataSource';

const BOOKS_KEY = ['books'];

export function useBooks() {
  return useQuery({
    queryKey:       BOOKS_KEY,
    queryFn:        apiGetBooks,
    staleTime:      30_000,
    refetchOnFocus: true,
  });
}

export function useCreateBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, currency }) => apiCreateBook(name, currency),
    onMutate: async ({ name, currency = 'PKR' }) => {
      await qc.cancelQueries({ queryKey: BOOKS_KEY });
      const snapshot = qc.getQueryData(BOOKS_KEY);
      qc.setQueryData(BOOKS_KEY, (prev = []) => [
        {
          id: '__optimistic__',
          name,
          currency,
          net_balance: 0,
          created_at: new Date().toISOString(),
          last_entry_at: null,
        },
        ...prev,
      ]);
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) {
        qc.setQueryData(BOOKS_KEY, ctx.snapshot);
      }
    },
    onSuccess: (newBook) => {
      // Replace the optimistic placeholder with the real local book row.
      // No invalidate/refetch needed — local SQLite already has the book and
      // the cache is correct. A background refetch would only cause a flash.
      qc.setQueryData(BOOKS_KEY, (prev = []) =>
        prev.map(b => b.id === '__optimistic__' ? newBook : b)
      );
    },
  });
}

export function useRenameBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookId, name }) => apiUpdateBook(bookId, { name }),
    onMutate: async ({ bookId, name }) => {
      await qc.cancelQueries({ queryKey: BOOKS_KEY });
      const snapshot = qc.getQueryData(BOOKS_KEY);
      qc.setQueryData(BOOKS_KEY, (prev = []) =>
        prev.map(b => b.id === bookId ? { ...b, name } : b)
      );
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot !== undefined) qc.setQueryData(BOOKS_KEY, ctx.snapshot);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BOOKS_KEY });
    },
  });
}

export function useDeleteBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bookId) => apiDeleteBook(bookId),
    onMutate: async (bookId) => {
      await qc.cancelQueries({ queryKey: BOOKS_KEY });
      const snapshot = qc.getQueryData(BOOKS_KEY);
      qc.setQueryData(BOOKS_KEY, (prev = []) => prev.filter(b => b.id !== bookId));
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot !== undefined) qc.setQueryData(BOOKS_KEY, ctx.snapshot);
    },
    onSuccess: () => {
      // Cache is already correct from onMutate; no refetch needed.
    },
  });
}
