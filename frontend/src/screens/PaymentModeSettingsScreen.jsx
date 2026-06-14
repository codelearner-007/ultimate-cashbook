import { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useBookBasePath } from '../hooks/useBookBasePath';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import EntityListScreen, { ReorderArrows } from '../components/books/EntityListScreen';
import {
  usePaymentModes, useCreatePaymentMode, useUpdatePaymentMode,
  useDeletePaymentMode, useReorderPaymentModes,
} from '../hooks/usePaymentModes';
import PaymentModeMenuSheet from '../components/books/PaymentModeMenuSheet';
import DeleteContactSheet from '../components/ui/DeleteContactSheet';
import { useBooks } from '../hooks/useBooks';
import { useSharedBooks } from '../hooks/useSharing';

export default function PaymentModeSettingsScreen() {
  const router   = useRouter();
  const basePath = useBookBasePath();
  const { id: bookId, name: bookName } = useLocalSearchParams();
  const { C, Font } = useTheme();
  const cs = useMemo(() => makeCardStyles(), []);

  const [menuModeId,    setMenuModeId]    = useState(null);
  const [deletingMode,  setDeletingMode]  = useState(null);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);

  const { data: ownBooks = [] }    = useBooks();
  const { data: sharedBooks = [] } = useSharedBooks();
  const currentBook = ownBooks.find(b => b.id === bookId);
  const isOwner  = !!currentBook;
  const sharedBook = !isOwner ? sharedBooks.find(b => b.id === bookId) : null;
  const rights   = isOwner ? 'view_create_edit_delete' : (sharedBook?.rights ?? 'view');
  const canEdit   = rights !== 'view';
  const canDelete = rights === 'view_create_edit_delete';

  const { data: modes = [], isLoading } = usePaymentModes(bookId);
  const createMode  = useCreatePaymentMode(bookId);
  const deleteMode  = useDeletePaymentMode(bookId);
  const updateMode  = useUpdatePaymentMode(bookId, menuModeId);
  const reorderMode = useReorderPaymentModes(bookId);

  const menuMode = useMemo(
    () => menuModeId ? (modes.find(m => m.id === menuModeId) ?? null) : null,
    [menuModeId, modes],
  );

  const filterItem = useCallback((m, q) => m.name.toLowerCase().includes(q), []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openDetail = useCallback((mode) => {
    router.push({
      pathname: `${basePath}/[id]/payment-mode-detail`,
      params: { id: bookId, name: bookName, modeId: mode.id, modeName: mode.name },
    });
  }, [router, basePath, bookId, bookName]);

  const openBalance = useCallback((mode) => {
    router.push({
      pathname: `${basePath}/[id]/payment-mode-balance`,
      params: { id: bookId, name: bookName, modeId: mode.id, modeName: mode.name },
    });
  }, [router, basePath, bookId, bookName]);

  const handleCreate = useCallback(({ values }, { onSuccess }) => {
    createMode.mutate({ name: values.name.trim() }, {
      onSuccess,
      onError: (err) => {
        const detail = err?.response?.data?.detail ?? '';
        if (detail.includes('already exists')) {
          Alert.alert('Duplicate', 'A payment mode with that name already exists.');
        } else {
          Alert.alert('Error', 'Failed to create payment mode.');
        }
      },
    });
  }, [createMode]);

  const handleSaveEdit = (payload) => {
    updateMode.mutate(payload, {
      onSuccess: () => setMenuModeId(null),
      onError: (err) => {
        const detail = err?.response?.data?.detail ?? '';
        Alert.alert('Error', detail.includes('already exists') ? 'That name already exists.' : 'Failed to save changes.');
      },
    });
  };

  const handleDeletePress = () => {
    const mode = menuMode;
    if (modes.length <= 1) {
      Alert.alert('Cannot Delete', 'You must have at least one payment mode.');
      return;
    }
    setMenuModeId(null);
    setDeletingMode(mode);
    setShowDeleteSheet(true);
  };

  const confirmDelete = () => {
    if (!deletingMode) return;
    deleteMode.mutate(deletingMode.id, {
      onSuccess: () => { setShowDeleteSheet(false); setDeletingMode(null); },
      onError: () => Alert.alert('Error', 'Failed to delete payment mode.'),
    });
  };

  // ── Card ──────────────────────────────────────────────────────────────────

  const renderCard = useCallback((item, idx, { s, C, Font, moveItem, isFiltering, listLength }) => {
    const balance    = item.net_balance ?? 0;
    const isBankMode = ['cash', 'check', 'cheque'].includes(item.name?.toLowerCase().trim());
    const isFirst    = idx === 0;
    const isLast     = idx === listLength - 1;

    return (
      <View key={item.id} style={s.cardWrap}>
        <View style={[cs.card, { backgroundColor: C.card, borderColor: C.border }]}>
          {canEdit && !isFiltering && (
            <ReorderArrows idx={idx} isFirst={isFirst} isLast={isLast} moveItem={moveItem} s={s} C={C} />
          )}

          <View style={[s.avatar, { backgroundColor: C.primaryLight }]}>
            {isBankMode
              ? <MaterialCommunityIcons name="bank" size={20} color={C.primary} />
              : <Feather name="credit-card" size={20} color={C.primary} />
            }
          </View>

          <TouchableOpacity
            style={s.cardBody}
            onPress={() => openDetail(item)}
            onLongPress={canEdit ? () => setMenuModeId(item.id) : undefined}
            delayLongPress={350}
            activeOpacity={0.8}
          >
            <Text style={[s.cardName, { color: C.text, fontFamily: Font.semiBold }]} numberOfLines={1}>
              {item.name}
            </Text>
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
  }, [canEdit, openDetail, openBalance, cs]);

  return (
    <EntityListScreen
      title="Payment Modes"
      bookName={bookName}
      items={modes}
      isLoading={isLoading}
      canEdit={canEdit}
      searchPlaceholder="Search payment modes…"
      filterItem={filterItem}
      reorder={(ids) => reorderMode.mutate(ids)}
      onCreate={handleCreate}
      creating={createMode.isPending}
      addTitle="Add Payment Mode"
      addFields={[
        { key: 'name', placeholder: 'Name *', returnKeyType: 'done', submitOnEnter: true, required: true, requiredMsg: 'Please enter a payment mode name.' },
      ]}
      emptyIcon="credit-card"
      emptyTitle="No payment modes yet"
      emptySubtitle={'Tap the + button below\nto add your first payment mode'}
      renderCard={renderCard}
    >
      {() => (
        <>
          {/* Payment Mode Menu Sheet — long-press */}
          <PaymentModeMenuSheet
            visible={!!menuModeId}
            mode={menuMode}
            onClose={() => setMenuModeId(null)}
            onViewEntries={() => {
              setMenuModeId(null);
              if (menuMode) openBalance(menuMode);
            }}
            onSaveEdit={handleSaveEdit}
            onDelete={handleDeletePress}
            saving={updateMode.isPending}
            canEdit={canEdit}
            canDelete={canDelete}
            C={C}
            Font={Font}
          />

          {/* Delete Sheet */}
          <DeleteContactSheet
            visible={showDeleteSheet}
            onDismiss={() => { setShowDeleteSheet(false); setDeletingMode(null); }}
            onConfirm={confirmDelete}
            contactName={deletingMode?.name}
            contactType="mode"
            isLoading={deleteMode.isPending}
            C={C}
            Font={Font}
          />
        </>
      )}
    </EntityListScreen>
  );
}

const makeCardStyles = () => StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 50, paddingVertical: 6, paddingLeft: 0, paddingRight: 14, borderWidth: 1.5, overflow: 'hidden' },
});
