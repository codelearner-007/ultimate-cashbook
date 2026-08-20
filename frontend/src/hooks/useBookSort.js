import { useState, useMemo, useCallback, useEffect } from 'react';

export function useBookSort(books) {
  const [sortMode,    setSortMode]    = useState('updated'); // 'updated'|'high'|'low'|'custom'
  const [customBooks, setCustomBooks] = useState(null);       // null = not yet set
  const [showSort,    setShowSort]    = useState(false);

  // If the live book set no longer matches the custom-ordered snapshot (books were
  // added/removed — e.g. a local or cloud restore replaced the data set, not just a
  // reorder), drop the stale snapshot so sortedBooks falls back to the live list
  // instead of showing books that may no longer exist.
  useEffect(() => {
    if (!customBooks) return;
    const liveIds = new Set(books.map((b) => b.id));
    const sameSet = liveIds.size === customBooks.length && customBooks.every((b) => liveIds.has(b.id));
    if (!sameSet) setCustomBooks(null);
  }, [books, customBooks]);

  const sortedBooks = useMemo(() => {
    if (sortMode === 'custom')  return customBooks ?? books;
    if (sortMode === 'high')    return [...books].sort((a, b) => (b.net_balance ?? 0) - (a.net_balance ?? 0));
    if (sortMode === 'low')     return [...books].sort((a, b) => (a.net_balance ?? 0) - (b.net_balance ?? 0));
    return books; // 'updated' — server order is already newest-first
  }, [books, sortMode, customBooks]);

  const handleSortSelect = useCallback((key) => {
    if (key === 'custom' && sortMode !== 'custom') {
      // Seed the custom list with the current sorted order
      setCustomBooks([...sortedBooks]);
    }
    if (key !== 'custom') {
      setCustomBooks(null);
    }
    setSortMode(key);
  }, [sortMode, sortedBooks]);

  const sortLabel = {
    updated: 'Last Updated',
    high:    'Highest Balance',
    low:     'Lowest Balance',
    custom:  'Custom Order',
  }[sortMode];

  return {
    sortMode,
    sortedBooks,
    showSort,
    setShowSort,
    handleSortSelect,
    setCustomBooks,
    sortLabel,
  };
}
