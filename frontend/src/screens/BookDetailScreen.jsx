import React, { useState, useMemo, useCallback, memo, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  StatusBar, Alert, ActivityIndicator,
  Modal, Pressable, ScrollView, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import SearchBar from '../components/ui/SearchBar';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useBookBasePath } from '../hooks/useBookBasePath';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { apiGetEntries, apiGetSummary, apiDeleteEntry, apiDeleteAllEntries } from '../lib/dataSource';
import { useBooks } from '../hooks/useBooks';
import { useSharedBooks } from '../hooks/useSharing';
import { useAuthStore } from '../store/authStore';
import { canAccess } from '../lib/canAccess';
import { useRealtimeEntries } from '../hooks/useRealtimeSync';
import { useCustomers, useSuppliers } from '../hooks/useContacts';
import SuccessDialog from '../components/ui/SuccessDialog';
import DeleteAllEntriesSheet from '../components/ui/DeleteAllEntriesSheet';

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

function matchesDatePeriod(entryDate, period) {
  const d = new Date(entryDate + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (period === 'today') return d.toDateString() === today.toDateString();
  if (period === 'yesterday') { const y = new Date(today); y.setDate(today.getDate() - 1); return d.toDateString() === y.toDateString(); }
  if (period === 'week') { const w = new Date(today); w.setDate(today.getDate() - 6); return d >= w; }
  if (period === 'month') return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear() && d <= today;
  return true;
}

const DATE_LABELS = { today: 'Today', yesterday: 'Yesterday', week: 'This Week', month: 'This Month' };
const PAYMENT_LABEL = { cash: 'Cash', online: 'Online', cheque: 'Cheque', other: 'Other' };
const PAYMENT_ICON = { cash: 'dollar-sign', online: 'wifi', cheque: 'file-text', check: 'file-text', other: 'more-horizontal' };

function formatDateHeader(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isToday = d.toDateString() === today.toDateString();
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const dayName = isToday ? 'Today' : isYesterday ? 'Yesterday' : d.toLocaleDateString('en-US', { weekday: 'long' });
  const dateText = d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  return { dayName, dateText };
}

// ── Icons (Feather via @expo/vector-icons) ────────────────────────────────────

const ChevronLeftIcon = ({ color, size = 20 }) => <Feather name="chevron-left" size={size} color={color} />;
const FileTextIcon = ({ color, size = 18 }) => <Feather name="file-text" size={size} color={color} />;
const DotsIcon = ({ color, size = 18 }) => <Feather name="more-vertical" size={size} color={color} />;
const LockIcon = ({ color, size = 14 }) => <Feather name="lock" size={size} color={color} />;
const InboxIcon = ({ color, size = 40 }) => <Feather name="inbox" size={size} color={color} />;
const PlusIcon = ({ color, size = 14 }) => <Feather name="plus" size={size} color={color} />;
const MinusIcon = ({ color, size = 14 }) => <Feather name="minus" size={size} color={color} />;
const ChevronDownIcon = ({ color, size = 14 }) => <Feather name="chevron-down" size={size} color={color} />;
const UserPlusIcon = ({ color, size = 20 }) => <Feather name="user-plus" size={size} color={color} />;

// ── Payment mode badge colors (index by mode) ─────────────────────────────────

const PAYMENT_META = {
  cash: { bg: null, text: null },   // uses primary tint — resolved in component
  online: { bg: '#E8F5E9', text: '#1B5E20' },
  cheque: { bg: '#FFF8E1', text: '#F57F17' },
  other: { bg: '#F3E5F5', text: '#7B1FA2' },
};

const PAYMENT_META_DARK = {
  cash: { bg: null, text: null },
  online: { bg: '#052E16', text: '#4ADE80' },
  cheque: { bg: '#2D1F00', text: '#FCD34D' },
  other: { bg: '#2D0A45', text: '#C084FC' },
};

// ── EntryCard ─────────────────────────────────────────────────────────────────

const EntryCard = memo(({ item, onPress, onLongPress, C, Font, s, isDark, grouped, isLast }) => {
  const modeKey = item.payment_mode?.toLowerCase();
  const meta = isDark ? (PAYMENT_META_DARK[modeKey] ?? {}) : (PAYMENT_META[modeKey] ?? {});
  const badgeBg = meta.bg ?? (isDark ? C.primaryLight : C.primaryLight);
  const badgeText = meta.text ?? C.primary;

  return (
    <TouchableOpacity
      style={grouped ? [s.entryCardGrouped, !isLast && s.entryCardDivider] : s.entryCard}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.75}
    >
      <View style={[s.entryBadge, { backgroundColor: badgeBg }]}>
        <Text style={[s.entryBadgeText, { color: badgeText }]} numberOfLines={1}>
          {item.payment_mode.charAt(0).toUpperCase() + item.payment_mode.slice(1)}
        </Text>
      </View>
      <View style={s.entryMid}>
        <Text style={s.entryRemark} numberOfLines={1}>
          {item.remark || 'No remark'}
        </Text>
        {item.category ? (
          <Text style={s.entryCategory} numberOfLines={1}>{item.category}</Text>
        ) : null}
        <View style={s.entryMetaRow}>
          <Text style={s.entryMeta}>Entry by You  ·  {fmt12h(item.entry_time)}</Text>
          {item.attachment_url ? (
            <View style={[s.attachDot, { backgroundColor: C.primaryLight }]}>
              <Feather name="paperclip" size={9} color={C.primary} />
            </View>
          ) : null}
        </View>
      </View>
      <Text
        style={[s.entryAmount, { color: item.type === 'in' ? C.cashIn : C.danger }]}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {item.amount.toLocaleString()}
      </Text>
    </TouchableOpacity>
  );
});

// ── BalanceCard ───────────────────────────────────────────────────────────────

const BalanceCard = memo(({ summary, onViewReports, C, Font, s }) => {
  const netColor = summary.net_balance >= 0 ? C.cashIn : C.danger;
  return (
    <View style={s.balanceCard}>
      <Text style={s.netLabel}>Net Balance</Text>
      <Text
        style={[s.netAmount, { color: netColor }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {summary.net_balance.toLocaleString()}
      </Text>
      <View style={s.balanceDivider} />
      <View style={s.balanceSubRow}>
        <View style={s.balanceSub}>
          <Text style={s.subLabel}>Total In (+)</Text>
          <Text style={[s.subAmount, { color: C.cashIn }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {summary.total_in.toLocaleString()}
          </Text>
        </View>
        <View style={s.balanceSubDivider} />
        <View style={s.balanceSub}>
          <Text style={s.subLabel}>Total Out (-)</Text>
          <Text style={[s.subAmount, { color: C.danger }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {summary.total_out.toLocaleString()}
          </Text>
        </View>
      </View>
      <TouchableOpacity style={s.viewReportsBtn} onPress={onViewReports} activeOpacity={0.7}>
        <Text style={s.viewReportsText}>VIEW REPORTS  ›</Text>
      </TouchableOpacity>
    </View>
  );
});

// ── Skeleton Loader ───────────────────────────────────────────────────────────

const SkeletonLine = memo(({ width, height = 14, C }) => (
  <View style={{ width, height, borderRadius: 6, backgroundColor: C.border, marginBottom: 4 }} />
));

const LoadingSkeleton = ({ C, s }) => (
  <View style={s.listContent}>
    {[1, 2, 3].map(g => (
      <View key={g}>
        <SkeletonLine width={100} height={11} C={C} />
        {[1, 2].map(i => (
          <View key={i} style={[s.entryCard, { marginBottom: 8 }]}>
            <View style={[s.entryBadge, { backgroundColor: C.border }]} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonLine width="70%" C={C} />
              <SkeletonLine width="40%" height={11} C={C} />
            </View>
            <SkeletonLine width={60} C={C} />
          </View>
        ))}
      </View>
    ))}
  </View>
);

// ── Empty State ───────────────────────────────────────────────────────────────

const ARROW_COUNT = 3;

function EmptyState({ C, Font, s }) {
  const arrowAnims = useRef(
    Array.from({ length: ARROW_COUNT }, () => new Animated.Value(0))
  ).current;
  const nudgeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Cascade fade: each chevron fades in 200 ms after the previous
    const cascade = Animated.loop(
      Animated.sequence([
        Animated.stagger(180,
          arrowAnims.map(a =>
            Animated.sequence([
              Animated.timing(a, { toValue: 1,   duration: 280, useNativeDriver: true }),
              Animated.timing(a, { toValue: 0.1, duration: 280, useNativeDriver: true }),
            ])
          )
        ),
        Animated.delay(300),
      ])
    );

    // Gentle nudge of the whole arrow group downward
    const nudge = Animated.loop(
      Animated.sequence([
        Animated.timing(nudgeAnim, { toValue: 8,  duration: 500, useNativeDriver: true }),
        Animated.timing(nudgeAnim, { toValue: 0,  duration: 500, useNativeDriver: true }),
      ])
    );

    cascade.start();
    nudge.start();
    return () => { cascade.stop(); nudge.stop(); };
  }, []);

  return (
    <View style={s.empty}>
      <View style={s.emptyIconBox}>
        <InboxIcon color={C.primary} size={36} />
      </View>
      <Text style={s.emptyTitle}>No entries yet</Text>
      <Text style={s.emptySub}>Tap Cash In or Cash Out below{'\n'}to record your first entry</Text>

      {/* Animated downward arrow */}
      <Animated.View style={[es.arrowWrap, { transform: [{ translateY: nudgeAnim }] }]}>
        <Text style={[es.hint, { color: C.textSubtle, fontFamily: Font.regular }]}>start here</Text>
        {arrowAnims.map((anim, i) => (
          <Animated.View key={i} style={{ opacity: anim }}>
            <Feather name="chevron-down" size={24} color={C.primary} />
          </Animated.View>
        ))}
      </Animated.View>
    </View>
  );
}

const es = StyleSheet.create({
  arrowWrap: { alignItems: 'center', marginTop: 28, gap: -6 },
  hint:      { fontSize: 11, letterSpacing: 0.4, marginBottom: 6, textTransform: 'uppercase' },
});


// ── Main Screen ───────────────────────────────────────────────────────────────

export default function BookDetailScreen() {
  const router = useRouter();
  const basePath = useBookBasePath();
  const { id, name: nameParam } = useLocalSearchParams();
  const { data: books } = useBooks();
  const { data: sharedBooks = [] } = useSharedBooks();
  const currentBook = books?.find(b => b.id === id);
  const name = currentBook?.name ?? nameParam;
  const isOwner = !!currentBook;
  const authUser = useAuthStore(s => s.user);
  const canShare = canAccess(authUser, 'book_sharing');
  const sharedBook = !isOwner ? sharedBooks.find(b => b.id === id) : null;
  const rights = isOwner ? 'view_create_edit_delete' : (sharedBook?.rights ?? 'view');
  const canCreate = rights === 'view_create_edit' || rights === 'view_create_edit_delete';
  const canDelete = rights === 'view_create_edit_delete';
  const { C, Font, isDark } = useTheme();
  const s = useMemo(() => makeStyles(C, Font), [C, Font]);
  const qc = useQueryClient();
  useRealtimeEntries(id);

  const [search, setSearch] = useState('');
  const [filterDate, setFilterDate] = useState(null);
  const [filterType, setFilterType] = useState(null);
  const [filterContact, setFilterContact] = useState(null);
  const [filterCategory, setFilterCategory] = useState(null);
  const [filterPayment, setFilterPayment] = useState(null);
  const [activePicker, setActivePicker] = useState(null);
  const [contactTab, setContactTab] = useState('customers');
  const [contactSearch, setContactSearch] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [menuVisible, setMenuVisible] = useState(false);
  const [showDeleteAllSheet, setShowDeleteAllSheet] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const deleteSheetCloseRef = useRef(null);

  const clearFilter = useCallback((key) => {
    if (key === 'date') setFilterDate(null);
    if (key === 'type') setFilterType(null);
    if (key === 'contact') setFilterContact(null);
    if (key === 'category') setFilterCategory(null);
    if (key === 'payment') setFilterPayment(null);
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilterDate(null); setFilterType(null); setFilterContact(null);
    setFilterCategory(null); setFilterPayment(null);
  }, []);

  const applyFilter = useCallback((key, val) => {
    clearFilter(key);
    if (key === 'date') setFilterDate(val);
    if (key === 'type') setFilterType(val);
    if (key === 'contact') setFilterContact(val);
    if (key === 'category') setFilterCategory(val);
    if (key === 'payment') setFilterPayment(val);
    setActivePicker(null);
  }, [clearFilter]);

  const activeFilterCount = [filterDate, filterType, filterContact, filterCategory, filterPayment]
    .filter(Boolean).length;

  const toggleDate = useCallback((date) => {
    setCollapsed(prev => ({ ...prev, [date]: !prev[date] }));
  }, []);

  const {
    data: entries = [],
    isLoading: entriesLoading,
    isError: entriesError,
    refetch,
  } = useQuery({
    queryKey:        ['entries', id],
    queryFn:         () => apiGetEntries(id),
    staleTime:       0,
    refetchInterval: 5000,  // fallback poll — realtime handles it instantly when available
    refetchOnFocus:  true,
    enabled:         !!id,
    retry:           1,
  });

  const {
    data: summary = { net_balance: 0, total_in: 0, total_out: 0 },
    isLoading: summaryLoading,
    isError: summaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey:        ['summary', id],
    queryFn:         () => apiGetSummary(id),
    staleTime:       0,
    refetchInterval: 5000,  // fallback poll — realtime handles it instantly when available
    refetchOnFocus:  true,
    enabled:         !!id,
    retry:           1,
  });

  const deleteEntry = useMutation({
    mutationFn: (entryId) => apiDeleteEntry(id, entryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries', id] });
      qc.invalidateQueries({ queryKey: ['summary', id] });
      qc.invalidateQueries({ queryKey: ['books'] });
      qc.invalidateQueries({ queryKey: ['categories', id] });
      qc.invalidateQueries({ queryKey: ['category-entries', id] });
      qc.invalidateQueries({ queryKey: ['report-entries', id] });
    },
  });

  const deleteAllEntries = useMutation({
    mutationFn: () => apiDeleteAllEntries(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries', id] });
      qc.invalidateQueries({ queryKey: ['summary', id] });
      qc.invalidateQueries({ queryKey: ['books'] });
      qc.invalidateQueries({ queryKey: ['categories', id] });
      qc.invalidateQueries({ queryKey: ['category-entries', id] });
      qc.invalidateQueries({ queryKey: ['report-entries', id] });
      // Drive the close animation; show success only after it finishes
      deleteSheetCloseRef.current?.(() => {
        setShowDeleteAllSheet(false);
        setShowDeleteSuccess(true);
      });
    },
    onError: () => {
      Alert.alert('Error', 'Could not delete entries. Please try again.');
    },
  });

  const isLoading = entriesLoading || summaryLoading;
  const isError = entriesError || summaryError;

  const filtered = useMemo(() => entries.filter((e) => {
    if (filterType && e.type !== filterType) return false;
    if (filterPayment && e.payment_mode !== filterPayment) return false;
    if (filterCategory && e.category !== filterCategory) return false;
    if (filterContact && e.contact_name !== filterContact) return false;
    if (filterDate && !matchesDatePeriod(e.entry_date, filterDate)) return false;
    if (search) {
      const q = search.toLowerCase();
      const hit = e.remark?.toLowerCase().includes(q) ||
        e.amount.toString().includes(q) ||
        e.contact_name?.toLowerCase().includes(q) ||
        e.category?.toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  }), [entries, filterType, filterPayment, filterCategory, filterContact, filterDate, search]);

  const { data: customers = [] } = useCustomers(id);
  const { data: suppliers = [] } = useSuppliers(id);

  useEffect(() => {
    if (activePicker === 'contact') {
      setContactTab(customers.length > 0 ? 'customers' : 'suppliers');
      setContactSearch('');
    }
  }, [activePicker, customers, suppliers]);

  const bookContacts = useMemo(() =>
    [...new Set(entries.map(e => e.contact_name).filter(Boolean))],
    [entries]);

  const bookCategories = useMemo(() =>
    [...new Set(entries.map(e => e.category).filter(Boolean))],
    [entries]);

  const bookPayments = useMemo(() =>
    [...new Set(entries.map(e => e.payment_mode).filter(Boolean))],
    [entries]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  const isFiltered = activeFilterCount > 0 || !!search;

  const displaySummary = useMemo(() => {
    if (!isFiltered) return summary;
    const total_in = filtered.filter(e => e.type === 'in').reduce((s, e) => s + e.amount, 0);
    const total_out = filtered.filter(e => e.type === 'out').reduce((s, e) => s + e.amount, 0);
    return { total_in, total_out, net_balance: total_in - total_out };
  }, [isFiltered, filtered, summary]);

  const handleDelete = useCallback((entryId) => {
    Alert.alert('Delete Entry', 'Delete this entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => deleteEntry.mutate(entryId),
      },
    ]);
  }, [deleteEntry]);

  const goToReports = useCallback(() => {
    const params = { id, name };

    if (filterDate) params.initialDate = filterDate;
    if (filterType) params.initialType = filterType;
    if (filterContact) params.initialContact = filterContact;
    if (filterCategory) params.initialCategory = filterCategory;
    if (filterPayment) params.initialPayment = filterPayment;

    router.push({ pathname: `${basePath}/[id]/reports`, params });
  }, [router, basePath, id, name, filterDate, filterType, filterContact, filterCategory, filterPayment]);

  const goToBookSettings = useCallback(() => {
    setMenuVisible(false);
    router.push({ pathname: `${basePath}/[id]/book-settings`, params: { id, name } });
  }, [router, basePath, id, name]);

  const renderItem = useCallback(({ item: group }) => {
    const isCollapsed = !!collapsed[group.date];
    const dayIn = group.items.reduce((acc, e) => e.type === 'in' ? acc + e.amount : acc, 0);
    const dayOut = group.items.reduce((acc, e) => e.type === 'out' ? acc + e.amount : acc, 0);
    const dayNet = dayIn - dayOut;
    const dayNetColor = dayNet > 0 ? C.cashIn : dayNet < 0 ? C.danger : C.textMuted;
    const { dayName, dateText } = formatDateHeader(group.date);

    return (
      <View style={s.dateGroup}>
        <TouchableOpacity
          style={s.dateLabelRow}
          onPress={() => toggleDate(group.date)}
          activeOpacity={0.7}
        >
          <View style={s.dateLabelLeft}>
            <Text style={s.dateDayLabel}>{dayName}</Text>
            <Text style={s.dateDateText}>
              {dateText}{'  ·  '}{group.items.length} {group.items.length === 1 ? 'entry' : 'entries'}
            </Text>
          </View>
          {isCollapsed && (
            <View style={s.dateLabelRight}>
              <Text style={[s.dateDayNet, { color: dayNetColor }]}>
                {Math.abs(dayNet).toLocaleString()}
              </Text>
            </View>
          )}
          <View style={{ transform: [{ rotate: isCollapsed ? '-90deg' : '0deg' }], marginLeft: 10 }}>
            <ChevronDownIcon color={C.textMuted} size={14} />
          </View>
        </TouchableOpacity>

        {!isCollapsed && (
          <View style={s.entriesContainer}>
            {group.items.map((entry, index) => (
              <EntryCard
                key={entry.id}
                item={entry}
                C={C}
                Font={Font}
                s={s}
                isDark={isDark}
                grouped
                isLast={index === group.items.length - 1}
                onPress={() => router.push({
                  pathname: `${basePath}/[id]/entry-detail`,
                  params: { id, eid: entry.id },
                })}
                onLongPress={canDelete ? () => handleDelete(entry.id) : undefined}
              />
            ))}
          </View>
        )}
      </View>
    );
  }, [s, C, Font, isDark, id, router, handleDelete, collapsed, toggleDate, canDelete]);

  const ListEmpty = useCallback(() => <EmptyState C={C} Font={Font} s={s} />, [C, Font, s]);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={C.primary}
      />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.replace(basePath)}
          style={s.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ChevronLeftIcon color="#fff" size={22} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle} numberOfLines={1}>{name || 'Business Book'}</Text>
          <Text style={s.headerSub}>Add Member, Book Activity etc</Text>
        </View>
        <View style={s.headerRight}>
          {isOwner && (
            <TouchableOpacity
              style={s.headerIconBtn}
              onPress={() => {
                if (!canShare) { router.push('/(app)/settings/subscription'); return; }
                router.push({ pathname: `${basePath}/[id]/manage-shares`, params: { id, name } });
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {!canShare && (
                <View style={{ position: 'absolute', top: -3, right: -3, zIndex: 10 }}>
                  <Text style={{ fontSize: 9, lineHeight: 12 }}>👑</Text>
                </View>
              )}
              <UserPlusIcon color={canShare ? 'rgba(255,255,255,0.8)' : '#F59E0B'} size={20} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={s.headerIconBtn}
            onPress={() => setMenuVisible(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <DotsIcon color="rgba(255,255,255,0.8)" size={18} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={s.searchWrapper}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search by remark or amount…"
        />
      </View>

      {/* ── Filter Chips ── */}
      <View style={s.filterBar}>
        {/* ALL chip — always visible, never scrolls */}
        <TouchableOpacity
          style={[s.fChip, activeFilterCount === 0 && s.fChipActive]}
          onPress={clearAllFilters}
          activeOpacity={0.8}
        >
          <Feather name="layers" size={13} color={activeFilterCount === 0 ? '#fff' : C.textMuted} />
          <Text style={[s.fChipLabel, { color: activeFilterCount === 0 ? '#fff' : C.textMuted }]}>All</Text>
        </TouchableOpacity>

        <View style={s.filterDivider} />

        <View style={s.filterScrollWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.filterScroll}
          >
            {[
              { key: 'date', label: 'Date', icon: 'calendar', display: filterDate ? DATE_LABELS[filterDate] : null },
              { key: 'type', label: 'Entry Type', icon: 'repeat', display: filterType === 'in' ? 'Cash In' : filterType === 'out' ? 'Cash Out' : null },
              { key: 'contact', label: 'Cust. & Supp.', icon: 'users', display: filterContact },
              { key: 'category', label: 'Category', icon: 'tag', display: filterCategory },
              { key: 'payment', label: 'Payment', icon: 'credit-card', display: filterPayment ? (PAYMENT_LABEL[filterPayment] || filterPayment) : null },
            ].map(({ key, label, icon, display }) => {
              const active = !!display;
              return (
                <TouchableOpacity
                  key={key}
                  style={[s.fChip, active && s.fChipActive]}
                  onPress={() => setActivePicker(key)}
                  activeOpacity={0.8}
                >
                  <Feather name={icon} size={13} color={active ? '#fff' : C.textMuted} />
                  <Text style={[s.fChipLabel, { color: active ? '#fff' : C.textMuted }]} numberOfLines={1}>
                    {display || label}
                  </Text>
                  {active ? (
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation?.(); clearFilter(key); }}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    >
                      <Feather name="x" size={13} color="rgba(255,255,255,0.85)" />
                    </TouchableOpacity>
                  ) : (
                    <Feather name="chevron-down" size={11} color={C.textSubtle} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <LinearGradient
            colors={[`${C.background}00`, C.background]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.filterFade}
            pointerEvents="none"
          />
        </View>
      </View>


      {/* ── Filter Picker Modal ── */}
      <Modal
        visible={!!activePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setActivePicker(null)}
      >
        <Pressable style={s.pickerOverlay} onPress={() => setActivePicker(null)}>
          <Pressable style={[s.pickerSheet, { backgroundColor: C.card }]} onPress={() => { }}>
            <View style={[s.pickerHandle, { backgroundColor: C.border }]} />
            <View style={s.pickerHeader}>
              <Text style={[s.pickerTitle, { color: C.text, fontFamily: Font.bold }]}>
                {activePicker === 'date' ? 'Filter by Date'
                  : activePicker === 'type' ? 'Entry Type'
                    : activePicker === 'contact' ? 'Customers & Suppliers'
                      : activePicker === 'category' ? 'Filter by Category'
                        : activePicker === 'payment' ? 'Payment Method'
                          : ''}
              </Text>
              <TouchableOpacity onPress={() => setActivePicker(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={20} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            {/* DATE picker */}
            {activePicker === 'date' && (
              <View style={s.pickerGrid}>
                {[
                  { key: 'today', label: 'Today', icon: 'sun' },
                  { key: 'yesterday', label: 'Yesterday', icon: 'moon' },
                  { key: 'week', label: 'This Week', icon: 'calendar' },
                  { key: 'month', label: 'This Month', icon: 'clock' },
                ].map(({ key, label, icon }) => (
                  <TouchableOpacity
                    key={key}
                    style={[s.pickerGridItem, { borderColor: filterDate === key ? C.primary : C.border, backgroundColor: filterDate === key ? C.primaryLight : C.card }]}
                    onPress={() => applyFilter('date', key)}
                    activeOpacity={0.75}
                  >
                    <Feather name={icon} size={20} color={filterDate === key ? C.primary : C.textMuted} />
                    <Text style={[s.pickerGridLabel, { color: filterDate === key ? C.primary : C.text, fontFamily: filterDate === key ? Font.bold : Font.medium }]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* TYPE picker */}
            {activePicker === 'type' && (
              <View style={s.typePickerRow}>
                <TouchableOpacity
                  style={[s.typePickerBtn, { borderColor: filterType === 'in' ? C.cashIn : C.border, backgroundColor: filterType === 'in' ? C.cashInLight : C.card }]}
                  onPress={() => applyFilter('type', 'in')}
                  activeOpacity={0.8}
                >
                  <Feather name="arrow-up-circle" size={28} color={filterType === 'in' ? C.cashIn : C.textMuted} />
                  <Text style={[s.typePickerLabel, { color: filterType === 'in' ? C.cashIn : C.text, fontFamily: Font.bold }]}>Cash In</Text>
                  <Text style={[s.typePickerSub, { color: C.textMuted }]}>Income entries</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.typePickerBtn, { borderColor: filterType === 'out' ? C.danger : C.border, backgroundColor: filterType === 'out' ? C.dangerLight : C.card }]}
                  onPress={() => applyFilter('type', 'out')}
                  activeOpacity={0.8}
                >
                  <Feather name="arrow-down-circle" size={28} color={filterType === 'out' ? C.danger : C.textMuted} />
                  <Text style={[s.typePickerLabel, { color: filterType === 'out' ? C.danger : C.text, fontFamily: Font.bold }]}>Cash Out</Text>
                  <Text style={[s.typePickerSub, { color: C.textMuted }]}>Expense entries</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* CUSTOMERS & SUPPLIERS picker */}
            {activePicker === 'contact' && (() => {
              const isCustomerTab = contactTab === 'customers';
              const accentColor = isCustomerTab ? C.cashIn : C.danger;
              const accentLight = isCustomerTab ? C.cashInLight : C.dangerLight;
              const currentList = isCustomerTab ? customers : suppliers;
              const filteredList = contactSearch
                ? currentList.filter(c =>
                    c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
                    (c.phone && c.phone.includes(contactSearch))
                  )
                : currentList;

              return (
                <>
                  {/* Search bar */}
                  <SearchBar
                    value={contactSearch}
                    onChangeText={setContactSearch}
                    placeholder={`Search ${isCustomerTab ? 'customers' : 'suppliers'}…`}
                    onClear={() => setContactSearch('')}
                    style={s.cSearchBar}
                  />

                  {/* Tabs */}
                  <View style={[s.cTabRow, { borderBottomColor: C.border }]}>
                    {[
                      { key: 'customers', label: 'Customers', count: customers.length, accent: C.cashIn, accentBg: C.cashInLight },
                      { key: 'suppliers', label: 'Suppliers', count: suppliers.length, accent: C.danger, accentBg: C.dangerLight },
                    ].map(tab => {
                      const active = contactTab === tab.key;
                      return (
                        <TouchableOpacity
                          key={tab.key}
                          style={[s.cTab, active && { borderBottomColor: tab.accent }]}
                          onPress={() => { setContactTab(tab.key); setContactSearch(''); }}
                          activeOpacity={0.8}
                        >
                          <Text style={[s.cTabLabel, { color: active ? tab.accent : C.textMuted, fontFamily: active ? Font.bold : Font.medium }]}>
                            {tab.label}
                          </Text>
                          <View style={[s.cTabBadge, { backgroundColor: active ? tab.accentBg : C.border }]}>
                            <Text style={[s.cTabBadgeText, { color: active ? tab.accent : C.textMuted, fontFamily: Font.bold }]}>{tab.count}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* List */}
                  {filteredList.length === 0 ? (
                    <View style={s.pickerEmpty}>
                      <Feather name={contactSearch ? 'search' : 'users'} size={36} color={C.textSubtle} />
                      <Text style={[s.pickerEmptyTitle, { color: C.text, fontFamily: Font.semiBold }]}>
                        {contactSearch ? 'No results' : `No ${isCustomerTab ? 'customers' : 'suppliers'} yet`}
                      </Text>
                      <Text style={[s.pickerEmptySub, { color: C.textMuted }]}>
                        {contactSearch ? `No match for "${contactSearch}"` : `Add ${isCustomerTab ? 'customers' : 'suppliers'} to this book first.`}
                      </Text>
                    </View>
                  ) : (
                    <ScrollView style={s.pickerList} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 0 }}>
                      {filteredList.map((item, idx) => (
                        <TouchableOpacity
                          key={item.id}
                          style={[s.pickerRow, { borderBottomColor: C.border }, idx === filteredList.length - 1 && { borderBottomWidth: 0 }, filterContact === item.name && { backgroundColor: C.primaryLight }]}
                          onPress={() => applyFilter('contact', item.name)}
                          activeOpacity={0.75}
                        >
                          <View style={[s.contactAvatar, { backgroundColor: accentLight }]}>
                            <Text style={[s.contactAvatarText, { color: accentColor, fontFamily: Font.bold }]}>
                              {item.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={s.cItemMid}>
                            <Text style={[s.pickerRowLabel, { color: C.text, fontFamily: filterContact === item.name ? Font.semiBold : Font.regular }]}>
                              {item.name}
                            </Text>
                            {item.phone ? (
                              <Text style={[s.cItemPhone, { color: C.textMuted, fontFamily: Font.regular }]}>{item.phone}</Text>
                            ) : null}
                          </View>
                          {filterContact === item.name && <Feather name="check" size={16} color={C.primary} />}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </>
              );
            })()}

            {/* CATEGORY picker */}
            {activePicker === 'category' && (
              bookCategories.length === 0 ? (
                <View style={s.pickerEmpty}>
                  <Feather name="tag" size={36} color={C.textSubtle} />
                  <Text style={[s.pickerEmptyTitle, { color: C.text, fontFamily: Font.semiBold }]}>No categories used</Text>
                  <Text style={[s.pickerEmptySub, { color: C.textMuted }]}>Add categories to entries to filter by them.</Text>
                </View>
              ) : (
                <ScrollView style={s.pickerList} showsVerticalScrollIndicator={false}>
                  {bookCategories.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[s.pickerRow, { borderBottomColor: C.border }, filterCategory === cat && { backgroundColor: C.primaryLight }]}
                      onPress={() => applyFilter('category', cat)}
                      activeOpacity={0.75}
                    >
                      <View style={[s.catDot, { backgroundColor: C.primaryMid }]}>
                        <Feather name="tag" size={13} color={C.primary} />
                      </View>
                      <Text style={[s.pickerRowLabel, { color: C.text, fontFamily: filterCategory === cat ? Font.semiBold : Font.regular }]}>{cat}</Text>
                      {filterCategory === cat && <Feather name="check" size={16} color={C.primary} />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )
            )}

            {/* PAYMENT picker */}
            {activePicker === 'payment' && (() => {
              const payOpts = bookPayments.map(value => ({
                value,
                label: PAYMENT_LABEL[value] || (value.charAt(0).toUpperCase() + value.slice(1)),
                icon: PAYMENT_ICON[value?.toLowerCase()] || 'credit-card',
              }));
              if (payOpts.length === 0) return (
                <View style={s.pickerEmpty}>
                  <Feather name="credit-card" size={36} color={C.textSubtle} />
                  <Text style={[s.pickerEmptyTitle, { color: C.text, fontFamily: Font.semiBold }]}>No payment modes used</Text>
                  <Text style={[s.pickerEmptySub, { color: C.textMuted }]}>Payment modes will appear once entries are added.</Text>
                </View>
              );
              return (
                <View style={s.pickerGrid}>
                  {payOpts.map(({ value, label, icon }) => (
                    <TouchableOpacity
                      key={value}
                      style={[s.pickerGridItem, { borderColor: filterPayment === value ? C.primary : C.border, backgroundColor: filterPayment === value ? C.primaryLight : C.card }]}
                      onPress={() => applyFilter('payment', value)}
                      activeOpacity={0.75}
                    >
                      <Feather name={icon} size={20} color={filterPayment === value ? C.primary : C.textMuted} />
                      <Text style={[s.pickerGridLabel, { color: filterPayment === value ? C.primary : C.text, fontFamily: filterPayment === value ? Font.bold : Font.medium }]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })()}

          </Pressable>
        </Pressable>
      </Modal>

      {isLoading ? (
        <>
          {/* Skeleton balance card */}
          <View style={[s.balanceCard, { gap: 10 }]}>
            <SkeletonLine width="50%" height={16} C={C} />
            <SkeletonLine width="100%" height={1} C={C} />
            <SkeletonLine width="70%" C={C} />
          </View>
          <LoadingSkeleton C={C} s={s} />
        </>
      ) : isError ? (
        <View style={s.errorBox}>
          <Text style={s.errorTitle}>Failed to load entries</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { refetch(); refetchSummary(); }}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Balance Card */}
          <BalanceCard
            summary={displaySummary}
            onViewReports={goToReports}
            C={C}
            Font={Font}
            s={s}
          />

          {/* Entry Count */}
          <View style={s.entryCountRow}>
            <Feather name="list" size={12} color={C.textMuted} />
            <Text style={s.entryCountText}>
              {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
              {activeFilterCount > 0 || search ? '  ·  filtered' : '  ·  total'}
            </Text>
            {(activeFilterCount > 0 || search) && (
              <TouchableOpacity
                style={s.clearFilterBtn}
                onPress={() => { clearAllFilters(); setSearch(''); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Feather name="x-circle" size={12} color={C.primary} />
                <Text style={s.clearFilterText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Entry List */}
          <FlatList
            data={grouped}
            keyExtractor={(item) => item.date}
            renderItem={renderItem}
            contentContainerStyle={[s.listContent, !canCreate && { paddingBottom: 20 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={ListEmpty}
            ListFooterComponent={
              <View style={s.onlyYou}>
                <LockIcon color={C.textSubtle} size={13} />
                <Text style={s.onlyYouText}>Only you can see these entries</Text>
              </View>
            }
          />
        </>
      )}

      {/* Dots Dropdown Menu */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={s.menuOverlay} onPress={() => setMenuVisible(false)}>
          <View style={[s.menuCard, { backgroundColor: C.card, borderColor: C.border }]}>
            {[
              { label: 'Book Settings', icon: 'settings', onPress: goToBookSettings },
              ...(canDelete ? [{
                label: 'Delete All Entries', icon: 'trash-2', danger: true,
                onPress: () => { setMenuVisible(false); setTimeout(() => setShowDeleteAllSheet(true), 200); },
              }] : []),
            ].map((item, idx, arr) => (
              <View key={item.label}>
                <TouchableOpacity
                  style={s.menuItem}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                >
                  <Feather name={item.icon} size={16} color={item.danger ? C.danger : C.textMuted} />
                  <Text style={[s.menuItemText, { color: item.danger ? C.danger : C.text, fontFamily: Font.medium }]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
                {idx < arr.length - 1 && <View style={[s.menuDivider, { backgroundColor: C.border }]} />}
              </View>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Delete All Entries Sheet */}
      <DeleteAllEntriesSheet
        visible={showDeleteAllSheet}
        onDismiss={() => setShowDeleteAllSheet(false)}
        onConfirm={() => deleteAllEntries.mutate()}
        bookName={name}
        entryCount={entries.length}
        isLoading={deleteAllEntries.isPending}
        C={C}
        Font={Font}
        closeRef={deleteSheetCloseRef}
      />

      {/* Delete All Success */}
      <SuccessDialog
        visible={showDeleteSuccess}
        onDismiss={() => setShowDeleteSuccess(false)}
        title="All Entries Deleted"
        subtitle={`"${name}" has been cleared successfully`}
      />

      {/* Action Buttons — hidden for view-only collaborators */}
      {canCreate && (
        <View style={s.actionRow}>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: C.cashIn }]}
            onPress={() => router.push({
              pathname: `${basePath}/[id]/add-entry`,
              params: { id, type: 'in' },
            })}
            activeOpacity={0.85}
          >
            <PlusIcon color="#fff" size={13} />
            <Text style={s.actionBtnText}>CASH IN</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: C.danger }]}
            onPress={() => router.push({
              pathname: `${basePath}/[id]/add-entry`,
              params: { id, type: 'out' },
            })}
            activeOpacity={0.85}
          >
            <MinusIcon color="#fff" size={13} />
            <Text style={s.actionBtnText}>CASH OUT</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeStyles = (C, Font) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.primary,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    marginRight: 2,
  },
  headerCenter: { flex: 1, marginRight: 8 },
  headerTitle: {
    fontSize: 16, fontFamily: Font.bold, color: '#fff',
    lineHeight: 22,
  },
  headerSub: {
    fontSize: 11, fontFamily: Font.regular, color: 'rgba(255,255,255,0.7)',
    lineHeight: 16, marginTop: 1,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerIconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  // Search
  searchWrapper: { marginTop: 6 },

  // ── Filter chips bar ──
  filterBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingLeft: 16, paddingRight: 0,
    paddingVertical: 2, height: 36,
  },
  filterDivider: {
    width: 1, height: 16, backgroundColor: C.border, marginHorizontal: 8,
  },
  filterScrollWrap: { flex: 1, overflow: 'hidden' },
  filterScroll: {
    paddingRight: 16, gap: 6,
    alignItems: 'center',
  },
  filterFade: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: 32,
  },
  fChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 100, borderWidth: 1.5,
    backgroundColor: C.card, borderColor: C.border,
  },
  fChipActive: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 100, borderWidth: 1.5,
    backgroundColor: C.primary, borderColor: C.primary,
  },
  fChipLabel: { fontSize: 11, fontFamily: Font.semiBold, lineHeight: 15 },

  // ── Picker modal ──
  pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  pickerSheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 12, paddingBottom: 24, paddingHorizontal: 20,
    maxHeight: '70%',
  },
  pickerHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  pickerTitle: { fontSize: 17, lineHeight: 24 },

  // Grid picker (date, payment)
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  pickerGridItem: {
    width: '47%', borderRadius: 16, borderWidth: 1.5,
    paddingVertical: 18, alignItems: 'center', gap: 8,
  },
  pickerGridLabel: { fontSize: 13, lineHeight: 18 },

  // Type picker
  typePickerRow: { flexDirection: 'row', gap: 12 },
  typePickerBtn: {
    flex: 1, borderRadius: 16, borderWidth: 1.5,
    paddingVertical: 20, alignItems: 'center', gap: 6,
  },
  typePickerLabel: { fontSize: 15, lineHeight: 22 },
  typePickerSub: { fontSize: 11, fontFamily: Font.regular, lineHeight: 16 },

  // List picker (contact, category)
  pickerList: { maxHeight: 300 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: 1,
  },
  pickerRowLabel: { flex: 1, fontSize: 15, lineHeight: 22 },
  contactAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  contactAvatarText: { fontSize: 15 },
  catDot: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  // Customers & Suppliers picker — search bar override
  cSearchBar: { marginHorizontal: 0, marginBottom: 14 },

  // Customers & Suppliers picker — tabs
  cTabRow: {
    flexDirection: 'row', borderBottomWidth: 1,
    marginBottom: 4,
  },
  cTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  cTabLabel: { fontSize: 13, lineHeight: 19 },
  cTabBadge: {
    minWidth: 20, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5,
  },
  cTabBadgeText: { fontSize: 10, lineHeight: 14 },

  // List row extras
  cItemMid: { flex: 1 },
  cItemPhone: { fontSize: 11, lineHeight: 16, marginTop: 1 },

  // Empty state (no contacts)
  pickerEmpty: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  pickerEmptyTitle: { fontSize: 15, lineHeight: 22 },
  pickerEmptySub: { fontSize: 13, fontFamily: Font.regular, lineHeight: 20, textAlign: 'center', paddingHorizontal: 20 },

  // Balance Card
  balanceCard: {
    backgroundColor: C.card, marginHorizontal: 16, marginTop: 4,
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8,
    borderWidth: 1, borderColor: C.border,
    alignItems: 'center',
  },
  netLabel: {
    fontSize: 11, fontFamily: Font.medium, color: C.textMuted,
    lineHeight: 15, marginBottom: 1, letterSpacing: 0.2,
  },
  netAmount: {
    fontSize: 24, fontFamily: Font.extraBold,
    lineHeight: 30, marginBottom: 6, width: '100%', textAlign: 'center',
  },
  balanceDivider: { height: 1, backgroundColor: C.border, marginBottom: 5, width: '100%' },
  balanceSubRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginBottom: 4, width: '100%',
  },
  balanceSub: { flex: 1, alignItems: 'center' },
  subLabel: {
    fontSize: 10, fontFamily: Font.regular, color: C.textMuted,
    lineHeight: 15, marginBottom: 2,
  },
  subAmount: { fontSize: 13, fontFamily: Font.bold, lineHeight: 19, width: '90%', textAlign: 'center' },
  balanceSubDivider: {
    width: 1, height: 28, backgroundColor: C.border, marginHorizontal: 12,
  },
  viewReportsBtn: { alignItems: 'center', paddingVertical: 2, justifyContent: 'center' },
  viewReportsText: {
    color: C.primary, fontFamily: Font.bold, fontSize: 12,
    letterSpacing: 0.3, lineHeight: 18,
  },

  // Entry count row
  entryCountRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2,
  },
  entryCountText: {
    fontSize: 12, fontFamily: Font.medium, color: C.textMuted, lineHeight: 18,
    flex: 1,
  },
  clearFilterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  clearFilterText: {
    fontSize: 12, fontFamily: Font.semiBold, color: C.primary, lineHeight: 18,
  },

  // List
  listContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 90 },

  // Date group
  dateGroup: { marginBottom: 4 },
  dateLabelRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 2, paddingHorizontal: 4, marginBottom: 4,
  },
  dateLabelLeft: { flex: 1 },
  dateDayLabel: {
    fontSize: 14, fontFamily: Font.bold, color: C.text, lineHeight: 21,
  },
  dateDateText: {
    fontSize: 11, fontFamily: Font.regular, color: C.textMuted, lineHeight: 17, marginTop: 1,
  },
  dateLabelRight: { alignItems: 'flex-end' },
  dateDayNet: { fontSize: 14, fontFamily: Font.bold, lineHeight: 21 },

  // Grouped entries container
  entriesContainer: {
    borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden',
  },

  // Entry Card — standalone (used by skeleton)
  entryCard: {
    backgroundColor: C.card, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 9,
    marginBottom: 6, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: C.border,
  },

  // Entry Card — inside grouped container
  entryCardGrouped: {
    backgroundColor: C.card,
    paddingHorizontal: 14, paddingVertical: 9,
    flexDirection: 'row', alignItems: 'center',
  },
  entryCardDivider: {
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  entryBadge: {
    borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4,
    marginRight: 10, minWidth: 50, alignItems: 'center',
    justifyContent: 'center',
  },
  entryBadgeText: { fontSize: 10, fontFamily: Font.bold, lineHeight: 15 },
  entryMid: { flex: 1, marginRight: 6 },
  entryRemark: {
    fontSize: 13, fontFamily: Font.semiBold, color: C.text,
    lineHeight: 19, marginBottom: 1,
  },
  entryCategory: {
    fontSize: 10, fontFamily: Font.regular, color: C.textMuted,
    lineHeight: 15, marginBottom: 1,
  },
  entryMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  entryMeta: { fontSize: 10, fontFamily: Font.regular, color: C.textMuted, lineHeight: 15 },
  attachDot: { borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 },
  entryAmount: { fontSize: 13, fontFamily: Font.medium, lineHeight: 19, minWidth: 66, textAlign: 'right' },

  // Only You
  onlyYou: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 6, gap: 6, paddingBottom: 8,
  },
  onlyYouText: {
    fontSize: 11, fontFamily: Font.regular, color: C.textSubtle, lineHeight: 16,
  },

  // Empty
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyIconBox: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: C.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 16, fontFamily: Font.bold, color: C.text,
    lineHeight: 24, marginBottom: 8,
  },
  emptySub: {
    fontSize: 13, fontFamily: Font.regular, color: C.textMuted,
    lineHeight: 20, textAlign: 'center',
  },

  // Error
  errorBox: { alignItems: 'center', paddingTop: 60, gap: 16 },
  errorTitle: { fontSize: 15, fontFamily: Font.medium, color: C.textMuted },
  retryBtn: {
    backgroundColor: C.primary, borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 12, minHeight: 44, justifyContent: 'center',
  },
  retryText: { color: '#fff', fontFamily: Font.semiBold, fontSize: 14 },

  // Dropdown menu
  menuOverlay: {
    flex: 1,
  },
  menuCard: {
    position: 'absolute', top: 56, right: 8,
    borderRadius: 14, borderWidth: 1,
    minWidth: 180,
    shadowColor: '#000', shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  menuItemText: { fontSize: 14, lineHeight: 20 },
  menuDivider: { height: 1, marginHorizontal: 0 },

  // Action Buttons
  actionRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10,
    gap: 10, backgroundColor: C.card,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  actionBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 7,
  },
  actionBtnText: {
    color: '#fff', fontFamily: Font.extraBold,
    fontSize: 12, letterSpacing: 0.7, lineHeight: 17,
  },
});
