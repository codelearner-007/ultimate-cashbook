import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import EntityBalanceScreen from '../components/books/EntityBalanceScreen';
import { useCategoryEntries } from '../hooks/useCategories';

export default function CategoryDetailScreen() {
  const { id: bookId, categoryId, categoryName } = useLocalSearchParams();

  const { data: entries = [], isLoading } = useCategoryEntries(bookId, categoryId);

  const totalIn  = entries.reduce((s, e) => s + (e.type === 'in'  ? e.amount : 0), 0);
  const totalOut = entries.reduce((s, e) => s + (e.type === 'out' ? e.amount : 0), 0);

  return (
    <EntityBalanceScreen
      bookId={bookId}
      title={categoryName}
      headerSub="Category Balance"
      entries={entries}
      isLoading={isLoading}
      totalIn={totalIn}
      totalOut={totalOut}
      showCategory={false}
      useRealtime
      loader="skeleton"
      emptyIcon="tag"
      emptyTitle="No entries yet"
      emptySub="Entries assigned to this category will appear here."
      cardMetrics={{ badgeMinWidth: 48, badgeMarginRight: 8, midMarginRight: 4, amountMinWidth: 64 }}
    />
  );
}
