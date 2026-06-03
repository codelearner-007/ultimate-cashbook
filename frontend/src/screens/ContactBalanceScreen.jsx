import React, { useMemo, useState, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  FlatList, ActivityIndicator,
} from 'react-native';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import SearchBar from '../components/ui/SearchBar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useContactEntries, useContact } from '../hooks/useContacts';
import { useRealtimeEntries } from '../hooks/useRealtimeSync';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt12h = (time) => {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
};

function groupByDate(entries) {
  const map = new Map();
  for (const e of entries) {
    const key = e.entry_date;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(e);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, items }));
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ── Payment badge colors ──────────────────────────────────────────────────────

const PAYMENT_META = {
  cash:   { bg: null,       text: null },
  online: { bg: '#E8F5E9', text: '#1B5E20' },
  cheque: { bg: '#FFF8E1', text: '#F57F17' },
  other:  { bg: '#F3E5F5', text: '#7B1FA2' },
};

const PAYMENT_META_DARK = {
  cash:   { bg: null,       text: null },
  online: { bg: '#052E16', text: '#4ADE80' },
  cheque: { bg: '#2D1F00', text: '#FCD34D' },
  other:  { bg: '#2D0A45', text: '#C084FC' },
};

// ── EntryCard ─────────────────────────────────────────────────────────────────

const EntryCard = memo(({ item, C, Font, s, isDark }) => {
  const meta = isDark
    ? PAYMENT_META_DARK[item.payment_mode] ?? PAYMENT_META_DARK.cash
    : PAYMENT_META[item.payment_mode] ?? PAYMENT_META.cash;
  const badgeBg   = meta.bg   ?? (isDark ? C.primaryLight : C.primaryLight);
  const badgeText = meta.text ?? C.primary;

  const typeColor = item.type === 'in' ? C.cashIn : C.danger;
  return (
    <View style={[s.entryCard, { backgroundColor: C.card, borderColor: C.border }]}>
      <View style={[s.entryTypeBar, { backgroundColor: typeColor }]} />
      <View style={[s.entryBadge, { backgroundColor: badgeBg }]}>
        <Text style={[s.entryBadgeText, { color: badgeText }]} numberOfLines={1}>
          {item.payment_mode
            ? item.payment_mode.charAt(0).toUpperCase() + item.payment_mode.slice(1)
            : 'Cash'}
        </Text>
      </View>
      <View style={s.entryMid}>
        <Text style={[s.entryRemark, { color: C.text }]} numberOfLines={1}>
          {item.remark || 'No remark'}
        </Text>
        {item.category ? (
          <Text style={[s.entryCategory, { color: C.textMuted }]} numberOfLines={1}>{item.category}</Text>
        ) : null}
        <Text style={[s.entryMeta, { color: C.textMuted }]}>Entry by You  ·  {fmt12h(item.entry_time)}</Text>
      </View>
      <Text style={[s.entryAmount, { color: typeColor }]} numberOfLines={1} allowFontScaling={false}>
        {item.amount?.toLocaleString()}
      </Text>
    </View>
  );
});

// ── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value, color, C, Font }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 3 }}>
      <Text style={{ fontSize: 10, fontFamily: Font.medium, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</Text>
      <Text style={{ fontSize: 15, fontFamily: Font.bold, color }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  customer: { label: 'Customer' },
  supplier: { label: 'Supplier' },
};

export default function ContactBalanceScreen() {
  const router = useRouter();
  const { id: bookId, contactId, contactName, contactType } = useLocalSearchParams();
  const { C, Font, isDark } = useTheme();
  const s = useMemo(() => makeStyles(C, Font), [C, Font]);

  const cfg = TYPE_CONFIG[contactType] || TYPE_CONFIG.customer;

  const [collapsed, setCollapsed] = useState({});
  const [search, setSearch] = useState('');

  const toggleDate = useCallback((date) => {
    setCollapsed(prev => ({ ...prev, [date]: !prev[date] }));
  }, []);

  useRealtimeEntries(bookId);
  const { data: entries = [], isLoading } = useContactEntries(bookId, contactId, contactType);
  const { data: contact } = useContact(bookId, contactId, contactType);

  const totalIn  = contact?.total_in  ?? entries.reduce((sum, e) => sum + (e.type === 'in'  ? e.amount : 0), 0);
  const totalOut = contact?.total_out ?? entries.reduce((sum, e) => sum + (e.type === 'out' ? e.amount : 0), 0);
  const balance  = totalIn - totalOut;

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(e =>
      (e.remark || '').toLowerCase().includes(q) ||
      (e.category || '').toLowerCase().includes(q) ||
      (e.payment_mode || '').toLowerCase().includes(q) ||
      String(e.amount).includes(q)
    );
  }, [entries, search]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  const renderItem = useCallback(({ item: group }) => {
    const isCollapsed = !!collapsed[group.date];
    return (
      <View>
        <TouchableOpacity
          style={[s.dateLabelRow, { backgroundColor: C.background }]}
          onPress={() => toggleDate(group.date)}
          activeOpacity={0.7}
        >
          <View style={[s.dateDot, { backgroundColor: C.primary }]} />
          <Text style={[s.dateLabel, { color: C.textMuted }]}>{formatDate(group.date)}</Text>
          <View style={{ transform: [{ rotate: isCollapsed ? '0deg' : '180deg' }] }}>
            <Feather name="chevron-down" size={13} color={C.textMuted} />
          </View>
        </TouchableOpacity>
        {!isCollapsed && group.items.map((entry) => (
          <EntryCard
            key={entry.id}
            item={entry}
            C={C}
            Font={Font}
            s={s}
            isDark={isDark}
          />
        ))}
      </View>
    );
  }, [s, C, Font, isDark, collapsed, toggleDate]);

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: C.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? C.background : C.primary} />

      {/* Header */}
      <View style={[s.header, { backgroundColor: C.primary }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="chevron-left" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={[s.headerTitle, { fontFamily: Font.bold }]} numberOfLines={1}>{contactName}</Text>
          <Text style={[s.headerSub, { fontFamily: Font.regular }]}>Balance Details · {cfg.label}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Summary */}
      <View style={[s.summaryWrap, { backgroundColor: C.card, borderBottomColor: C.border }]}>
        <View style={[s.summaryCard, { borderColor: C.border }]}>
          <SummaryCard label="Cash In"  value={totalIn.toLocaleString()}  color={C.cashIn} C={C} Font={Font} />
          <View style={[s.summaryDivider, { backgroundColor: C.border }]} />
          <SummaryCard
            label="Net Balance"
            value={Math.abs(balance).toLocaleString()}
            color={balance >= 0 ? C.cashIn : C.danger}
            C={C} Font={Font}
          />
          <View style={[s.summaryDivider, { backgroundColor: C.border }]} />
          <SummaryCard label="Cash Out" value={totalOut.toLocaleString()} color={C.danger} C={C} Font={Font} />
        </View>
      </View>

      {/* Search bar */}
      {!isLoading && entries.length > 0 && (
        <View style={[s.searchWrap, { borderBottomColor: C.border }]}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search entries…"
            onClear={() => setSearch('')}
          />
          <Text style={[s.entryCountText, { marginLeft: 16 }]}>
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
          </Text>
        </View>
      )}

      {/* Entry list */}
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={C.primary} />
      ) : entries.length === 0 ? (
        <View style={s.empty}>
          <View style={s.emptyIconBox}>
            <Feather name="inbox" size={36} color={C.primary} />
          </View>
          <Text style={[s.emptyTitle, { color: C.text, fontFamily: Font.bold }]}>No entries yet</Text>
          <Text style={[s.emptySub, { color: C.textMuted, fontFamily: Font.regular }]}>
            Entries linked to this {cfg.label.toLowerCase()} will appear here.
          </Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={s.empty}>
          <Feather name="search" size={36} color={C.border} />
          <Text style={[s.emptyTitle, { color: C.text, fontFamily: Font.semiBold }]}>No results</Text>
          <Text style={[s.emptySub, { color: C.textMuted, fontFamily: Font.regular }]}>Try a different search.</Text>
        </View>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={item => item.date}
          renderItem={renderItem}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            <View style={s.onlyYou}>
              <Feather name="lock" size={13} color={C.textSubtle} />
              <Text style={s.onlyYouText}>Only you can see these entries</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (C, Font) => StyleSheet.create({
  safe: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  backBtn:      { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle:  { fontSize: 17, color: '#fff', lineHeight: 24 },
  headerSub:    { fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 18 },

  summaryWrap:    { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  summaryCard:    { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 8 },
  summaryDivider: { width: 1, height: 32, marginHorizontal: 4 },

  // Search
  searchWrap:     { paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1, gap: 4 },
  entryCountText: { fontSize: 12, fontFamily: Font.medium, color: C.textMuted, lineHeight: 18 },

  // List
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  dateLabelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 10, marginBottom: 6,
    paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8,
  },
  dateDot:  { width: 6, height: 6, borderRadius: 3 },
  dateLabel: {
    flex: 1, fontSize: 11, fontFamily: Font.semiBold,
    textTransform: 'uppercase', letterSpacing: 0.8, lineHeight: 16,
  },

  // Entry Card
  entryCard: {
    borderRadius: 12, marginBottom: 7,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, overflow: 'hidden',
  },
  entryTypeBar: { width: 3, alignSelf: 'stretch' },
  entryBadge: {
    borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4,
    marginLeft: 10, marginRight: 10, minWidth: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  entryBadgeText: { fontSize: 10, fontFamily: Font.bold, lineHeight: 15 },
  entryMid:       { flex: 1, marginRight: 8, paddingVertical: 10 },
  entryRemark:    { fontSize: 13, fontFamily: Font.semiBold, lineHeight: 19, marginBottom: 1 },
  entryCategory:  { fontSize: 10, fontFamily: Font.regular, lineHeight: 15, marginBottom: 1 },
  entryMeta:      { fontSize: 10, fontFamily: Font.regular, lineHeight: 15 },
  entryAmount:    { fontSize: 13, fontFamily: Font.bold, lineHeight: 19, minWidth: 72, textAlign: 'right', paddingRight: 12 },

  // Footer
  onlyYou: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 6, gap: 6, paddingBottom: 8,
  },
  onlyYouText: {
    fontSize: 11, fontFamily: Font.regular, color: C.textSubtle, lineHeight: 16,
  },

  // Empty
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 60 },
  emptyIconBox: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: C.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 16, lineHeight: 24 },
  emptySub:   { fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 240 },
});
