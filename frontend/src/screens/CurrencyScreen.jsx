import { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  StatusBar, ActivityIndicator,
} from 'react-native';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import { useRouter } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useProfile, useUpdateProfile } from '../hooks/useProfile';
import { CURRENCIES } from '../constants/currencies';
import { Font } from '../constants/fonts';
import SearchBar from '../components/ui/SearchBar';

// ── Icons ─────────────────────────────────────────────────────────────────────

const BackIcon = ({ color }) => (
  <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 9, height: 9, borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderColor: color, transform: [{ rotate: '45deg' }] }} />
  </View>
);

const CheckIcon = ({ color, size = 18 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{
      width: size * 0.55, height: size * 0.3,
      borderLeftWidth: 2, borderBottomWidth: 2,
      borderColor: color,
      transform: [{ rotate: '-45deg' }, { translateY: -size * 0.06 }],
    }} />
  </View>
);

// ── Static row layout (color-independent) ────────────────────────────────────

const rowStyles = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, minHeight: 65 },
  symbolBadge: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  symbol:     { fontSize: 15 },
  rowBody:    { flex: 1 },
  rowCode:    { fontSize: 14, lineHeight: 20 },
  rowName:    { fontSize: 12, lineHeight: 17, marginTop: 1 },
  divider:    { height: 1, marginHorizontal: 16 },
});

// ── Popular currencies ────────────────────────────────────────────────────────

const POPULAR = [
  { code: 'USD', symbol: '$',   label: 'Dollar' },
  { code: 'EUR', symbol: '€',   label: 'Euro'   },
  { code: 'GBP', symbol: '£',   label: 'Pound'  },
  { code: 'PKR', symbol: '₨',   label: 'Rupee'  },
  { code: 'AED', symbol: 'د.إ', label: 'Dirham' },
  { code: 'INR', symbol: '₹',   label: 'Rupee'  },
];

function PopularChips({ selectedCode, onPress, C }) {
  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 6 }}>
      {POPULAR.map((item) => {
        const active = item.code === selectedCode;
        return (
          <TouchableOpacity
            key={item.code}
            onPress={() => onPress(item.code)}
            activeOpacity={0.75}
            style={{
              flex: 1, alignItems: 'center', justifyContent: 'center',
              height: 36, borderWidth: 1, borderRadius: 20,
              backgroundColor: active ? C.primary : C.card,
              borderColor:     active ? C.primary : C.border,
            }}
          >
            <Text style={{ fontSize: 13, fontFamily: Font.bold,   color: active ? '#fff' : C.text }}>
              {item.symbol}
            </Text>
            <Text style={{ fontSize: 10, fontFamily: Font.medium, color: active ? '#ffffffbb' : C.textMuted }}>
              {item.code}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Currency Row ──────────────────────────────────────────────────────────────

const CurrencyRow = ({ item, isSelected, onPress, C, isLast }) => (
  <>
    <TouchableOpacity
      style={rowStyles.row}
      onPress={() => onPress(item.code)}
      activeOpacity={0.7}
    >
      <View style={[rowStyles.symbolBadge, { backgroundColor: isSelected ? C.primaryLight : C.backgroundSecondary }]}>
        <Text style={[rowStyles.symbol, { color: isSelected ? C.primary : C.textMuted, fontFamily: Font.bold }]}>
          {item.symbol}
        </Text>
      </View>
      <View style={rowStyles.rowBody}>
        <Text style={[rowStyles.rowCode, { color: C.text, fontFamily: Font.semiBold }]}>{item.code}</Text>
        <Text style={[rowStyles.rowName, { color: C.textMuted, fontFamily: Font.regular }]} numberOfLines={1}>{item.name}</Text>
      </View>
      {isSelected && <CheckIcon color={C.primary} size={18} />}
    </TouchableOpacity>
    {!isLast && <View style={[rowStyles.divider, { backgroundColor: C.border }]} />}
  </>
);

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function CurrencyScreen() {
  const router        = useRouter();
  const { C, isDark }         = useTheme();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const updateProfile = useUpdateProfile();

  const [search, setSearch]     = useState('');
  const [saving, setSaving]     = useState(false);

  const selectedCode = profile?.currency ?? 'PKR';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CURRENCIES;
    return CURRENCIES.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q),
    );
  }, [search]);

  const handleSelect = useCallback((code) => {
    if (code === selectedCode || saving) return;
    setSaving(true);
    updateProfile.mutate(
      { currency: code },
      {
        onSuccess: () => {
          setSaving(false);
          router.back();
        },
        onError: () => setSaving(false),
      },
    );
  }, [selectedCode, saving, updateProfile, router]);

  const s = useMemo(() => makeStyles(C), [C]);

  const renderItem = useCallback(({ item, index }) => (
    <CurrencyRow
      item={item}
      isSelected={item.code === selectedCode}
      onPress={handleSelect}
      C={C}
      isLast={index === filtered.length - 1}
    />
  ), [selectedCode, handleSelect, C, filtered.length]);

  const keyExtractor = useCallback((item) => item.code, []);

  return (
    <SafeAreaView applyTop style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? C.background : C.primary} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <BackIcon color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Select Currency</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search bar */}
      <View style={s.searchWrapper}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, code or symbol…"
        />
      </View>

      {/* Popular chips */}
      <PopularChips selectedCode={selectedCode} onPress={handleSelect} C={C} />

      {/* Count hint */}
      <Text style={[s.countHint, { color: C.textSubtle, fontFamily: Font.regular }]}>
        {filtered.length} {filtered.length === 1 ? 'currency' : 'currencies'}
      </Text>

      {profileLoading ? (
        <View style={s.centered}>
          <ActivityIndicator color={C.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          style={s.list}
          contentContainerStyle={s.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          initialNumToRender={20}
          maxToRenderPerBatch={30}
          windowSize={10}
          getItemLayout={(_, index) => ({ length: 65, offset: 65 * index, index })}
        />
      )}

      {/* Saving overlay */}
      {saving && (
        <View style={s.savingOverlay}>
          <ActivityIndicator color={C.primary} />
          <Text style={[s.savingText, { color: C.text, fontFamily: Font.medium }]}>Saving…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeStyles = (C) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },

  header: {
    backgroundColor: C.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: Font.bold, color: '#fff' },

  searchWrapper: { marginTop: 16, marginBottom: 0 },

  countHint: { fontSize: 11, marginHorizontal: 20, marginBottom: 8 },

  list:        { flex: 1 },
  listContent: {
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  savingText: { fontSize: 14 },
});
