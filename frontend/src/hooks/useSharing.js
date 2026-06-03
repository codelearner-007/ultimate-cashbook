import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  apiGetSharedBooks,
  apiGetBookShares,
  apiAddCollaborator,
  apiUpdateShare,
  apiRemoveCollaborator,
  apiLeaveSharedBook,
  apiRespondToInvitation,
  apiGetReceivedInvitations,
  apiGetGivenInvitations,
} from '../lib/api';
import { resolveCloudBookId } from '../lib/dataSource';

// Remove a collaborator or cancel a pending invitation from the "Given" tab.
// Accepts { bookId, shareId } so it works across multiple books on one screen.
export const useRemoveShareByOwner = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookId, shareId }) => {
      const cloudId = await resolveCloudBookId(bookId);
      return apiRemoveCollaborator(cloudId, shareId);
    },
    onSuccess:  (_, { bookId }) => {
      qc.invalidateQueries({ queryKey: ['book-shares', bookId] });
      qc.invalidateQueries({ queryKey: ['invitations', 'given'] });
    },
  });
};

export const useSharedBooks = () =>
  useQuery({
    queryKey:          ['shared-books'],
    queryFn:           apiGetSharedBooks,
    staleTime:         0,
    refetchOnFocus:    true,
  });

export const useBookShares = (bookId) =>
  useQuery({
    queryKey:        ['book-shares', bookId],
    queryFn:         async () => {
      const cloudId = await resolveCloudBookId(bookId);
      return apiGetBookShares(cloudId);
    },
    staleTime:       0,
    refetchOnFocus:  true,
    refetchInterval: 5000,  // fallback poll — realtime handles it instantly when available
    enabled:         !!bookId,
  });

// All invitations received by the current user (all statuses)
export const useReceivedInvitations = () =>
  useQuery({
    queryKey:        ['invitations', 'received'],
    queryFn:         apiGetReceivedInvitations,
    staleTime:       0,
    refetchOnFocus:  true,
    refetchInterval: 8000,  // fallback poll — realtime handles it instantly when available
  });

// All invitations sent by the current user (all books, all statuses)
export const useGivenInvitations = () =>
  useQuery({
    queryKey:        ['invitations', 'given'],
    queryFn:         apiGetGivenInvitations,
    staleTime:       0,
    refetchOnFocus:  true,
    refetchInterval: 8000,  // fallback poll — realtime handles it instantly when available
  });

export const useRespondToInvitation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookId, shareId, action }) =>
      apiRespondToInvitation(bookId, shareId, action),
    onSuccess: (_, { bookId }) => {
      qc.invalidateQueries({ queryKey: ['invitations', 'received'] });
      qc.invalidateQueries({ queryKey: ['invitations', 'given'] });
      qc.invalidateQueries({ queryKey: ['book-shares', bookId] });
      qc.invalidateQueries({ queryKey: ['shared-books'] });
    },
  });
};

export const useAddCollaborator = (bookId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const cloudId = await resolveCloudBookId(bookId);
      return apiAddCollaborator(cloudId, payload);
    },
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['book-shares', bookId] });
      qc.invalidateQueries({ queryKey: ['invitations', 'given'] });
    },
  });
};

export const useUpdateShare = (bookId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ shareId, payload }) => {
      const cloudId = await resolveCloudBookId(bookId);
      return apiUpdateShare(cloudId, shareId, payload);
    },
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['book-shares', bookId] });
      qc.invalidateQueries({ queryKey: ['invitations', 'given'] });
    },
  });
};

export const useRemoveCollaborator = (bookId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (shareId) => {
      const cloudId = await resolveCloudBookId(bookId);
      return apiRemoveCollaborator(cloudId, shareId);
    },
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['book-shares', bookId] });
      qc.invalidateQueries({ queryKey: ['invitations', 'given'] });
    },
  });
};

export const useLeaveSharedBook = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bookId) => apiLeaveSharedBook(bookId),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['shared-books'] });
      qc.invalidateQueries({ queryKey: ['invitations', 'received'] });
    },
  });
};
