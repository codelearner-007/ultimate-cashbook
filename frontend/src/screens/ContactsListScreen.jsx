import { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useBookBasePath } from '../hooks/useBookBasePath';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import EntityListScreen, { ReorderArrows } from '../components/books/EntityListScreen';
import {
  useContacts, useCreateContact, useUpdateContact, useDeleteContact,
  useReorderContacts,
} from '../hooks/useContacts';
import ContactMenuSheet from '../components/books/ContactMenuSheet';
import DeleteContactSheet from '../components/ui/DeleteContactSheet';
import { useBooks } from '../hooks/useBooks';
import { useSharedBooks } from '../hooks/useSharing';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiUpdateBookFieldSettings } from '../lib/dataSource';

const TYPE_CONFIG = {
  customer: { label: 'Customers', icon: 'user-check', emptyIcon: 'user-plus' },
  supplier: { label: 'Suppliers', icon: 'truck',       emptyIcon: 'truck'     },
};

export default function ContactsListScreen() {
  const router   = useRouter();
  const basePath = useBookBasePath();
  const { id: bookId, name: bookName, type } = useLocalSearchParams();
  const { C, Font } = useTheme();
  const cs = useMemo(() => makeCardStyles(), []);

  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.customer;

  const qc = useQueryClient();
  const { data: books = [] }       = useBooks();
  const { data: sharedBooks = [] } = useSharedBooks();
  const currentBook  = books.find(b => b.id === bookId);
  const isOwner      = !!currentBook;
  const sharedBook   = !isOwner ? sharedBooks.find(b => b.id === bookId) : null;
  const rights       = isOwner ? 'view_create_edit_delete' : (sharedBook?.rights ?? 'view');
  const canEdit      = rights !== 'view';
  const canDelete    = rights === 'view_create_edit_delete';

  const bookData  = currentBook ?? sharedBook;
  const showField = type === 'supplier'
    ? (bookData?.show_supplier ?? false)
    : (bookData?.show_customer ?? false);

  const toggleField = useMutation({
    mutationFn: (newVal) => apiUpdateBookFieldSettings(bookId, {
      showCustomer:   type === 'customer' ? newVal : (bookData?.show_customer ?? false),
      showSupplier:   type === 'supplier' ? newVal : (bookData?.show_supplier ?? false),
      showCategory:   bookData?.show_category   ?? false,
      showAttachment: bookData?.show_attachment ?? false,
    }),
    onMutate: async (newVal) => {
      const cacheKey = isOwner ? ['books'] : ['shared-books'];
      await qc.cancelQueries({ queryKey: cacheKey });
      const snapshot = qc.getQueryData(cacheKey);
      qc.setQueryData(cacheKey, (prev = []) =>
        prev.map(b => b.id === bookId ? {
          ...b,
          show_customer: type === 'customer' ? newVal : b.show_customer,
          show_supplier: type === 'supplier' ? newVal : b.show_supplier,
        } : b),
      );
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      const cacheKey = isOwner ? ['books'] : ['shared-books'];
      if (ctx?.snapshot !== undefined) qc.setQueryData(cacheKey, ctx.snapshot);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: isOwner ? ['books'] : ['shared-books'] }),
  });

  const [menuContactId,   setMenuContactId]   = useState(null);
  const [deletingContact, setDeletingContact] = useState(null);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);

  const { data: contacts = [], isLoading } = useContacts(bookId, type);
  const createContact  = useCreateContact(bookId, type);
  const deleteContact  = useDeleteContact(bookId, type);
  const updateContact  = useUpdateContact(bookId, menuContactId, type);
  const reorderContacts = useReorderContacts(bookId, type);

  const menuContact = useMemo(
    () => menuContactId ? (contacts.find(c => c.id === menuContactId) ?? null) : null,
    [menuContactId, contacts],
  );

  const filterItem = useCallback((c, q) =>
    c.name.toLowerCase().includes(q) ||
    (c.phone || '').includes(q) ||
    (c.email || '').toLowerCase().includes(q),
  []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openDetail = useCallback((contact) => {
    router.push({
      pathname: `${basePath}/[id]/contact-detail`,
      params: { id: bookId, name: bookName, contactId: contact.id, contactType: type, contactName: contact.name },
    });
  }, [router, basePath, bookId, bookName, type]);

  const openBalance = useCallback((contact) => {
    router.push({
      pathname: `${basePath}/[id]/contact-balance`,
      params: { id: bookId, name: bookName, contactId: contact.id, contactName: contact.name, contactType: type },
    });
  }, [router, basePath, bookId, bookName, type]);

  const handleCreate = useCallback(({ values }, { onSuccess }) => {
    createContact.mutate(
      { type, name: values.name.trim(), phone: values.phone.trim() || undefined },
      {
        onSuccess,
        onError: () => Alert.alert('Error', 'Failed to create contact.'),
      },
    );
  }, [createContact, type]);

  const handleSaveEdit = (payload) => {
    updateContact.mutate(payload, {
      onSuccess: () => setMenuContactId(null),
      onError:   () => Alert.alert('Error', 'Failed to save changes.'),
    });
  };

  const handleDeletePress = () => {
    const contact = menuContact;
    setMenuContactId(null);
    setDeletingContact(contact);
    setShowDeleteSheet(true);
  };

  const confirmDelete = () => {
    if (!deletingContact) return;
    deleteContact.mutate(deletingContact.id, {
      onSuccess: () => { setShowDeleteSheet(false); setDeletingContact(null); },
      onError:   () => Alert.alert('Error', 'Failed to delete contact.'),
    });
  };

  // ── Card ──────────────────────────────────────────────────────────────────

  const renderCard = useCallback((item, idx, { s, C, Font, moveItem, isFiltering, listLength }) => {
    const balance = item.balance ?? 0;
    const isFirst = idx === 0;
    const isLast  = idx === listLength - 1;

    return (
      <View key={item.id} style={s.cardWrap}>
        <View style={[cs.card, { backgroundColor: C.card, borderColor: C.border }]}>
          {canEdit && !isFiltering && (
            <ReorderArrows idx={idx} isFirst={isFirst} isLast={isLast} moveItem={moveItem} s={s} C={C} />
          )}

          <View style={[s.avatar, { backgroundColor: C.primaryLight }]}>
            <Feather name={cfg.icon} size={20} color={C.primary} />
          </View>

          <TouchableOpacity
            style={s.cardBody}
            onPress={() => openDetail(item)}
            onLongPress={canEdit ? () => setMenuContactId(item.id) : undefined}
            delayLongPress={350}
            activeOpacity={0.8}
          >
            <Text style={[s.cardName, { color: C.text, fontFamily: Font.semiBold }]} numberOfLines={1}>
              {item.name}
            </Text>
            {item.phone
              ? <Text style={[cs.cardSub, { color: C.textMuted, fontFamily: Font.regular }]}>{item.phone}</Text>
              : null}
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.balancePill, { backgroundColor: balance >= 0 ? C.cashInLight : C.dangerLight }]}
            onPress={() => openBalance(item)}
            activeOpacity={0.8}
          >
            <Text style={[s.balanceText, { color: balance >= 0 ? C.cashIn : C.danger, fontFamily: Font.bold }]}>
              {Math.abs(balance).toLocaleString()}
            </Text>
            <Feather name="chevron-right" size={11} color={balance >= 0 ? C.cashIn : C.danger} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [canEdit, cfg.icon, openDetail, openBalance, cs]);

  const label1 = cfg.label.slice(0, -1); // singular

  return (
    <EntityListScreen
      title={cfg.label}
      bookName={bookName}
      items={contacts}
      isLoading={isLoading}
      canEdit={canEdit}
      searchPlaceholder={`Search ${cfg.label.toLowerCase()}…`}
      filterItem={filterItem}
      reorder={(ids) => reorderContacts.mutate(ids)}
      onCreate={handleCreate}
      creating={createContact.isPending}
      addTitle={`Add ${label1}`}
      addFields={[
        { key: 'name',  placeholder: 'Name *',             returnKeyType: 'next', required: true, requiredMsg: 'Please enter a name.' },
        { key: 'phone', placeholder: 'Phone (optional)',   keyboardType: 'phone-pad', returnKeyType: 'done' },
      ]}
      emptyIcon={cfg.emptyIcon}
      emptyTitle={`No ${cfg.label} yet`}
      emptySubtitle={`Tap the + button below\nto add your first ${label1.toLowerCase()}`}
      toggle={{
        label: `Show ${label1} Field`,
        sublabel: `${label1} field in Cash In / Cash Out`,
        value: showField,
        enabled: isOwner,
        onChange: (v) => toggleField.mutate(v),
      }}
      renderCard={renderCard}
    >
      {() => (
        <>
          {/* Contact Menu Sheet — long-press */}
          <ContactMenuSheet
            visible={!!menuContactId}
            contact={menuContact}
            contactType={type}
            onClose={() => setMenuContactId(null)}
            onViewEntries={() => {
              setMenuContactId(null);
              router.push({
                pathname: `${basePath}/[id]/contact-balance`,
                params: { id: bookId, name: bookName, contactId: menuContact?.id, contactName: menuContact?.name, contactType: type },
              });
            }}
            onSaveEdit={handleSaveEdit}
            onDelete={handleDeletePress}
            saving={updateContact.isPending}
            canEdit={canEdit}
            canDelete={canDelete}
            C={C}
            Font={Font}
          />

          {/* Delete Contact Sheet */}
          <DeleteContactSheet
            visible={showDeleteSheet}
            onDismiss={() => { setShowDeleteSheet(false); setDeletingContact(null); }}
            onConfirm={confirmDelete}
            contactName={deletingContact?.name}
            contactType={type}
            isLoading={deleteContact.isPending}
            C={C}
            Font={Font}
          />
        </>
      )}
    </EntityListScreen>
  );
}

const makeCardStyles = () => StyleSheet.create({
  card:    { flexDirection: 'row', alignItems: 'center', borderRadius: 50, paddingVertical: 6, paddingLeft: 0, paddingRight: 14, borderWidth: 1.5, overflow: 'hidden' },
  cardSub: { fontSize: 12, lineHeight: 18, marginTop: 1 },
});
