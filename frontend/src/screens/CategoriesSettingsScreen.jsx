import { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useBookBasePath } from '../hooks/useBookBasePath';
import { Feather } from '@expo/vector-icons';
import EntityListScreen, { ReorderArrows } from '../components/books/EntityListScreen';
import {
  useCategories, useCreateCategory, useReorderCategories,
} from '../hooks/useCategories';
import { useBooks } from '../hooks/useBooks';
import { useSharedBooks } from '../hooks/useSharing';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiUpdateBookFieldSettings } from '../lib/dataSource';

export default function CategoriesSettingsScreen() {
  const router   = useRouter();
  const basePath = useBookBasePath();
  const { id: bookId, name: bookName } = useLocalSearchParams();
  const cs = useMemo(() => makeCardStyles(), []);

  const qc = useQueryClient();
  const { data: books = [] }       = useBooks();
  const { data: sharedBooks = [] } = useSharedBooks();
  const currentBook  = books.find(b => b.id === bookId);
  const isOwner      = !!currentBook;
  const sharedBook   = !isOwner ? sharedBooks.find(b => b.id === bookId) : null;
  const rights       = isOwner ? 'view_create_edit_delete' : (sharedBook?.rights ?? 'view');
  const canEdit      = rights !== 'view';

  const bookData     = currentBook ?? sharedBook;
  const showCategory = bookData?.show_category ?? false;

  const toggleCategory = useMutation({
    mutationFn: (newVal) => apiUpdateBookFieldSettings(bookId, {
      showCustomer:   bookData?.show_customer   ?? false,
      showSupplier:   bookData?.show_supplier   ?? false,
      showCategory:   newVal,
      showAttachment: bookData?.show_attachment ?? false,
    }),
    onMutate: async (newVal) => {
      const cacheKey = isOwner ? ['books'] : ['shared-books'];
      await qc.cancelQueries({ queryKey: cacheKey });
      const snapshot = qc.getQueryData(cacheKey);
      qc.setQueryData(cacheKey, (prev = []) =>
        prev.map(b => b.id === bookId ? { ...b, show_category: newVal } : b),
      );
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      const cacheKey = isOwner ? ['books'] : ['shared-books'];
      if (ctx?.snapshot !== undefined) qc.setQueryData(cacheKey, ctx.snapshot);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: isOwner ? ['books'] : ['shared-books'] }),
  });

  const { data: categories = [], isLoading } = useCategories(bookId);
  const { mutate: createCategory, isPending: creating } = useCreateCategory(bookId);
  const reorderCategories = useReorderCategories(bookId);

  const openProfile = useCallback((cat) => {
    router.push({
      pathname: `${basePath}/[id]/category-profile`,
      params: { id: bookId, categoryId: cat.id, categoryName: cat.name },
    });
  }, [router, basePath, bookId]);

  const filterItem = useCallback((c, q) => c.name.toLowerCase().includes(q), []);

  const handleCreate = useCallback(({ values }, { onSuccess }) => {
    createCategory({ name: values.name.trim() }, {
      onSuccess,
      onError: (err) => {
        const detail = err?.response?.data?.detail ?? '';
        if (detail.includes('already exists')) {
          Alert.alert('Duplicate', 'A category with that name already exists in this book.');
        } else {
          Alert.alert('Error', 'Failed to create category.');
        }
      },
    });
  }, [createCategory]);

  const renderCard = useCallback((item, idx, { s, C, Font, moveItem, isFiltering, listLength }) => {
    const balance = item.net_balance ?? 0;
    const isFirst = idx === 0;
    const isLast  = idx === listLength - 1;

    return (
      <View key={item.id} style={s.cardWrap}>
        <View style={[cs.card, { backgroundColor: C.card, borderColor: C.border }]}>
          {canEdit && !isFiltering && (
            <ReorderArrows idx={idx} isFirst={isFirst} isLast={isLast} moveItem={moveItem} s={s} C={C} />
          )}

          <View style={[s.avatar, { backgroundColor: C.primaryLight }]}>
            <Feather name="tag" size={20} color={C.primary} />
          </View>

          <TouchableOpacity
            style={s.cardBody}
            onPress={() => openProfile(item)}
            activeOpacity={0.8}
          >
            <Text style={[cs.cardName, { color: C.text, fontFamily: Font.semiBold }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[s.cardSub, { color: C.textMuted, fontFamily: Font.regular }]}>
              {item.total_in > 0 || item.total_out > 0
                ? `In: ${item.total_in.toLocaleString()}  ·  Out: ${item.total_out.toLocaleString()}`
                : 'No entries yet'}
            </Text>
          </TouchableOpacity>

          <View style={[s.balancePill, { backgroundColor: balance >= 0 ? C.cashInLight : C.dangerLight }]}>
            <Text style={[s.balanceText, { color: balance >= 0 ? C.cashIn : C.danger, fontFamily: Font.bold }]}>
              {Math.abs(balance).toLocaleString()}
            </Text>
            <Feather name="chevron-right" size={11} color={balance >= 0 ? C.cashIn : C.danger} />
          </View>
        </View>
      </View>
    );
  }, [canEdit, openProfile, cs]);

  return (
    <EntityListScreen
      title="Categories"
      bookName={bookName}
      items={categories}
      isLoading={isLoading}
      canEdit={canEdit}
      searchPlaceholder="Search categories…"
      filterItem={filterItem}
      reorder={(ids) => reorderCategories.mutate(ids)}
      onCreate={handleCreate}
      creating={creating}
      addTitle="Add Category"
      addFields={[
        { key: 'name', placeholder: 'Category name *', returnKeyType: 'done', submitOnEnter: true, required: true, requiredMsg: 'Please enter a category name.' },
      ]}
      emptyIcon="tag"
      emptyTitle="No categories yet"
      emptySubtitle={'Tap the + button below\nto add your first category'}
      modalHeaderMb={16}
      modalInputMb={16}
      toggle={{
        label: 'Show Category Field',
        sublabel: 'Category field in Cash In / Cash Out',
        value: showCategory,
        enabled: isOwner,
        onChange: (v) => toggleCategory.mutate(v),
      }}
      renderCard={renderCard}
    />
  );
}

const makeCardStyles = () => StyleSheet.create({
  card:     { flexDirection: 'row', alignItems: 'center', borderRadius: 50, paddingVertical: 6, paddingLeft: 0, paddingRight: 10, borderWidth: 1.5, overflow: 'hidden' },
  cardName: { fontSize: 14, lineHeight: 20, marginBottom: 2 },
});
