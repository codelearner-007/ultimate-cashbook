import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  apiGetCustomers, apiCreateCustomer, apiGetCustomer,
  apiUpdateCustomer, apiDeleteCustomer, apiGetCustomerEntries,
  apiGetSuppliers, apiCreateSupplier, apiGetSupplier,
  apiUpdateSupplier, apiDeleteSupplier, apiGetSupplierEntries,
  apiReorderCustomers, apiReorderSuppliers,
} from '../lib/dataSource';
import Toast from '../lib/toast';

// ── Query key factories ────────────────────────────────────────────────────────
export const contactKeys = {
  customers:      (bookId)              => ['customers', bookId],
  customer:       (bookId, contactId)   => ['customer',  bookId, contactId],
  customerEntries:(bookId, contactId)   => ['customer-entries', bookId, contactId],
  suppliers:      (bookId)              => ['suppliers', bookId],
  supplier:       (bookId, contactId)   => ['supplier',  bookId, contactId],
  supplierEntries:(bookId, contactId)   => ['supplier-entries', bookId, contactId],
};

// ── Customer queries ───────────────────────────────────────────────────────────

export function useCustomers(bookId) {
  return useQuery({
    queryKey:        contactKeys.customers(bookId),
    queryFn:         () => apiGetCustomers(bookId),
    staleTime:       0,
    refetchOnFocus:  true,
    refetchInterval: 8000,
    enabled:         !!bookId,
  });
}

export function useCustomer(bookId, contactId) {
  return useQuery({
    queryKey:        contactKeys.customer(bookId, contactId),
    queryFn:         () => apiGetCustomer(bookId, contactId),
    staleTime:       0,
    refetchOnFocus:  true,
    refetchInterval: 8000,
    enabled:         !!bookId && !!contactId,
  });
}

export function useCustomerEntries(bookId, contactId) {
  return useQuery({
    queryKey:        contactKeys.customerEntries(bookId, contactId),
    queryFn:         () => apiGetCustomerEntries(bookId, contactId),
    staleTime:       0,
    refetchOnFocus:  true,
    refetchInterval: 8000,
    enabled:         !!bookId && !!contactId,
  });
}

// ── Customer mutations ─────────────────────────────────────────────────────────

export function useCreateCustomer(bookId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => apiCreateCustomer(bookId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactKeys.customers(bookId) }),
  });
}

export function useUpdateCustomer(bookId, contactId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => apiUpdateCustomer(bookId, contactId, payload),
    onSuccess: (updated) => {
      qc.setQueryData(contactKeys.customer(bookId, contactId), updated);
      qc.invalidateQueries({ queryKey: contactKeys.customers(bookId) });
    },
  });
}

export function useDeleteCustomer(bookId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contactId) => apiDeleteCustomer(bookId, contactId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: contactKeys.customers(bookId) });
      qc.invalidateQueries({ queryKey: ['entries', bookId] });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to delete customer', text2: 'Please try again.' }),
  });
}

export function useReorderCustomers(bookId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds) => apiReorderCustomers(bookId, orderedIds),
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: contactKeys.customers(bookId) });
      const prev = qc.getQueryData(contactKeys.customers(bookId));
      qc.setQueryData(contactKeys.customers(bookId), (old = []) => {
        const byId = Object.fromEntries(old.map(c => [c.id, c]));
        return orderedIds.map((id, i) => ({ ...byId[id], display_order: i })).filter(Boolean);
      });
      return { prev };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(contactKeys.customers(bookId), ctx.prev);
      Toast.show({ type: 'error', text1: 'Failed to save order', text2: 'Please try again.' });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: contactKeys.customers(bookId) }),
  });
}

// ── Supplier queries ───────────────────────────────────────────────────────────

export function useSuppliers(bookId) {
  return useQuery({
    queryKey:        contactKeys.suppliers(bookId),
    queryFn:         () => apiGetSuppliers(bookId),
    staleTime:       0,
    refetchOnFocus:  true,
    refetchInterval: 8000,
    enabled:         !!bookId,
  });
}

export function useSupplier(bookId, contactId) {
  return useQuery({
    queryKey:        contactKeys.supplier(bookId, contactId),
    queryFn:         () => apiGetSupplier(bookId, contactId),
    staleTime:       0,
    refetchOnFocus:  true,
    refetchInterval: 8000,
    enabled:         !!bookId && !!contactId,
  });
}

export function useSupplierEntries(bookId, contactId) {
  return useQuery({
    queryKey: contactKeys.supplierEntries(bookId, contactId),
    queryFn:  () => apiGetSupplierEntries(bookId, contactId),
    staleTime: 0,
    enabled:  !!bookId && !!contactId,
  });
}

// ── Supplier mutations ─────────────────────────────────────────────────────────

export function useCreateSupplier(bookId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => apiCreateSupplier(bookId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactKeys.suppliers(bookId) }),
  });
}

export function useUpdateSupplier(bookId, contactId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => apiUpdateSupplier(bookId, contactId, payload),
    onSuccess: (updated) => {
      qc.setQueryData(contactKeys.supplier(bookId, contactId), updated);
      qc.invalidateQueries({ queryKey: contactKeys.suppliers(bookId) });
    },
  });
}

export function useDeleteSupplier(bookId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contactId) => apiDeleteSupplier(bookId, contactId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: contactKeys.suppliers(bookId) });
      qc.invalidateQueries({ queryKey: ['entries', bookId] });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to delete supplier', text2: 'Please try again.' }),
  });
}

export function useReorderSuppliers(bookId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds) => apiReorderSuppliers(bookId, orderedIds),
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: contactKeys.suppliers(bookId) });
      const prev = qc.getQueryData(contactKeys.suppliers(bookId));
      qc.setQueryData(contactKeys.suppliers(bookId), (old = []) => {
        const byId = Object.fromEntries(old.map(c => [c.id, c]));
        return orderedIds.map((id, i) => ({ ...byId[id], display_order: i })).filter(Boolean);
      });
      return { prev };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(contactKeys.suppliers(bookId), ctx.prev);
      Toast.show({ type: 'error', text1: 'Failed to save order', text2: 'Please try again.' });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: contactKeys.suppliers(bookId) }),
  });
}

// ── Convenience: unified hook that routes to the right set based on type ───────
// Used by ContactsListScreen which receives type='customer'|'supplier'
export function useContacts(bookId, type) {
  const c = useCustomers(bookId);
  const s = useSuppliers(bookId);
  if (type === 'customer') return c;
  if (type === 'supplier') return s;
  return c; // fallback
}

export function useCreateContact(bookId, type) {
  const cc = useCreateCustomer(bookId);
  const cs = useCreateSupplier(bookId);
  return type === 'supplier' ? cs : cc;
}

export function useDeleteContact(bookId, type) {
  const dc = useDeleteCustomer(bookId);
  const ds = useDeleteSupplier(bookId);
  return type === 'supplier' ? ds : dc;
}

export function useContact(bookId, contactId, type) {
  const c = useCustomer(bookId, contactId);
  const s = useSupplier(bookId, contactId);
  return type === 'supplier' ? s : c;
}

export function useUpdateContact(bookId, contactId, type) {
  const uc = useUpdateCustomer(bookId, contactId);
  const us = useUpdateSupplier(bookId, contactId);
  return type === 'supplier' ? us : uc;
}

export function useContactEntries(bookId, contactId, type) {
  const ce = useCustomerEntries(bookId, contactId);
  const se = useSupplierEntries(bookId, contactId);
  return type === 'supplier' ? se : ce;
}

export function useReorderContacts(bookId, type) {
  const rc = useReorderCustomers(bookId);
  const rs = useReorderSuppliers(bookId);
  return type === 'supplier' ? rs : rc;
}
