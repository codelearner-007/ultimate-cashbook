import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import EntityBalanceScreen from '../components/books/EntityBalanceScreen';
import { useContactEntries, useContact } from '../hooks/useContacts';

const TYPE_CONFIG = {
  customer: { label: 'Customer' },
  supplier: { label: 'Supplier' },
};

export default function ContactBalanceScreen() {
  const { id: bookId, contactId, contactName, contactType } = useLocalSearchParams();

  const cfg = TYPE_CONFIG[contactType] || TYPE_CONFIG.customer;

  const { data: entries = [], isLoading } = useContactEntries(bookId, contactId, contactType);
  const { data: contact } = useContact(bookId, contactId, contactType);

  const totalIn  = contact?.total_in  ?? entries.reduce((sum, e) => sum + (e.type === 'in'  ? e.amount : 0), 0);
  const totalOut = contact?.total_out ?? entries.reduce((sum, e) => sum + (e.type === 'out' ? e.amount : 0), 0);

  return (
    <EntityBalanceScreen
      bookId={bookId}
      title={contactName}
      headerSub={`Balance Details · ${cfg.label}`}
      entries={entries}
      isLoading={isLoading}
      totalIn={totalIn}
      totalOut={totalOut}
      metaPrefix="Entry by You"
      showCategory
      useRealtime
      loader="spinner"
      emptyIcon="inbox"
      emptyTitle="No entries yet"
      emptySub={`Entries linked to this ${cfg.label.toLowerCase()} will appear here.`}
      cardMetrics={{ badgeMinWidth: 52, badgeMarginRight: 10, midMarginRight: 8, amountMinWidth: 72 }}
    />
  );
}
