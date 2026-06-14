import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import EntityBalanceScreen from '../components/books/EntityBalanceScreen';
import { usePaymentModeEntries, usePaymentModes } from '../hooks/usePaymentModes';

export default function PaymentModeBalanceScreen() {
  const { id: bookId, modeId, modeName } = useLocalSearchParams();

  const { data: entries = [], isLoading } = usePaymentModeEntries(bookId, modeId);
  const { data: modes = [] } = usePaymentModes(bookId);
  const mode = modes.find(m => m.id === modeId);

  const totalIn  = mode?.total_in  ?? entries.reduce((sum, e) => sum + (e.type === 'in'  ? e.amount : 0), 0);
  const totalOut = mode?.total_out ?? entries.reduce((sum, e) => sum + (e.type === 'out' ? e.amount : 0), 0);

  return (
    <EntityBalanceScreen
      bookId={bookId}
      title={modeName}
      headerSub="Balance Details · Payment Mode"
      entries={entries}
      isLoading={isLoading}
      totalIn={totalIn}
      totalOut={totalOut}
      metaPrefix="Entry by You"
      showCategory
      useRealtime={false}
      loader="spinner"
      emptyIcon="inbox"
      emptyTitle="No entries yet"
      emptySub="Entries using this payment mode will appear here."
      cardMetrics={{ badgeMinWidth: 52, badgeMarginRight: 10, midMarginRight: 8, amountMinWidth: 72 }}
    />
  );
}
