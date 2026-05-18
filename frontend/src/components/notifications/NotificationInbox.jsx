/**
 * NotificationInbox — shared inbox component used by both
 * NotificationsScreen (regular user) and AdminNotificationsInboxScreen (superadmin).
 *
 * Props:
 *   showBack    bool     – render a back button on the left of the header
 *   onBack      fn       – called when back button is pressed
 *   emptySubtitle string – subtitle text shown in the empty state
 *   fabLabel    string   – if provided, a FAB is rendered at the bottom
 *   onFab       fn       – called when the FAB is pressed
 */
import { useMemo, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, StatusBar, ActivityIndicator,
} from 'react-native';
import SafeAreaView from '../ui/AppSafeAreaView';
import { useTheme } from '../../hooks/useTheme';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllRead,
  useBulkDeleteNotifications,
  useBulkMarkRead,
} from '../../hooks/useNotifications';
import { Font } from '../../constants/fonts';
import SearchBar from '../ui/SearchBar';
import NotificationDetailModal from '../ui/NotificationDetailModal';

// ── Icons ─────────────────────────────────────────────────────────────────────

const BackIcon = ({ color }) => (
  <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 9, height: 9, borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderColor: color, transform: [{ rotate: '45deg' }] }} />
  </View>
);

const BellIcon = ({ color, size = 22 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.62, height: size * 0.55, borderTopLeftRadius: size * 0.31, borderTopRightRadius: size * 0.31, borderWidth: 2, borderColor: color, borderBottomWidth: 0, marginTop: 2 }} />
    <View style={{ width: size * 0.78, height: size * 0.14, borderWidth: 2, borderColor: color, marginTop: -1 }} />
    <View style={{ width: size * 0.28, height: size * 0.14, borderBottomLeftRadius: size * 0.14, borderBottomRightRadius: size * 0.14, borderWidth: 2, borderColor: color, borderTopWidth: 0 }} />
  </View>
);

const TrashIcon = ({ color, size = 15 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.7, height: size * 0.6, borderWidth: 1.5, borderColor: color, borderTopWidth: 0, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 }} />
    <View style={{ width: size * 0.85, height: 1.5, backgroundColor: color, marginTop: -size * 0.6 - 1.5 }} />
    <View style={{ width: size * 0.4, height: 1.5, backgroundColor: color, marginBottom: size * 0.6 }} />
  </View>
);

const CheckIcon = ({ color, size = 14 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.55, height: size * 0.3, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: color, transform: [{ rotate: '-45deg' }], marginTop: -2 }} />
  </View>
);

const TickIcon = ({ color, size = 10 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.6, height: size * 0.32, borderLeftWidth: 1.8, borderBottomWidth: 1.8, borderColor: color, transform: [{ rotate: '-45deg' }], marginTop: -1 }} />
  </View>
);

const SendIcon = ({ color, size = 20 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 0, height: 0, borderLeftWidth: size * 0.85, borderTopWidth: size * 0.42, borderBottomWidth: size * 0.42, borderLeftColor: color, borderTopColor: 'transparent', borderBottomColor: 'transparent' }} />
  </View>
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelative(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso);
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date}  •  ${time}`;
}

// ── Notification Row ──────────────────────────────────────────────────────────

function NotificationRow({ item, isSelected, isSelecting, onPress, onLongPress, C }) {
  const longPressRef = useRef(false);
  const unread = !item.is_read;
  return (
    <TouchableOpacity
      style={[
        rowS.row,
        { backgroundColor: isSelected ? C.primaryLight : C.card, borderColor: isSelected ? C.primary : C.border },
        unread && !isSelected && { borderLeftWidth: 3, borderLeftColor: C.primary },
      ]}
      onPress={() => {
        if (longPressRef.current) { longPressRef.current = false; return; }
        onPress(item);
      }}
      onLongPress={() => {
        longPressRef.current = true;
        onLongPress(item.id);
      }}
      delayLongPress={500}
      activeOpacity={0.7}
    >
      {isSelecting ? (
        <View style={[
          rowS.checkbox,
          { borderColor: isSelected ? C.primary : C.textSubtle, backgroundColor: isSelected ? C.primary : 'transparent' },
        ]}>
          {isSelected && <TickIcon color="#fff" size={10} />}
        </View>
      ) : (
        <View style={[rowS.iconBox, { backgroundColor: unread ? C.primaryLight : C.background }]}>
          <BellIcon color={unread ? C.primary : C.textMuted} size={16} />
        </View>
      )}

      <View style={rowS.body}>
        <View style={rowS.titleRow}>
          <Text style={[rowS.title, { color: C.text, fontFamily: unread ? Font.bold : Font.semiBold }]} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={rowS.timeRow}>
            {unread && !isSelected && (
              <View style={[rowS.unreadDot, { backgroundColor: C.primary }]} />
            )}
            <Text style={[rowS.time, { color: C.textSubtle, fontFamily: Font.regular }]}>
              {formatRelative(item.created_at)}
            </Text>
          </View>
        </View>
        <Text style={[rowS.bodyText, { color: unread ? C.textMuted : C.textSubtle, fontFamily: Font.regular }]} numberOfLines={1}>
          {item.body}
        </Text>
        <Text style={[rowS.dateTime, { color: C.textSubtle, fontFamily: Font.regular }]}>
          {formatDateTime(item.created_at)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const rowS = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 12, marginBottom: 8, borderRadius: 12, borderWidth: 1.5 },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  iconBox: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  title: { fontSize: 13, flex: 1, marginRight: 8 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  time: { fontSize: 10 },
  bodyText: { fontSize: 12, lineHeight: 17 },
  dateTime: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  unreadDot: { width: 6, height: 6, borderRadius: 3 },
});

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ subtitle, C }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 }}>
      <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <BellIcon color={C.primary} size={36} />
      </View>
      <Text style={{ fontSize: 18, fontFamily: Font.bold, color: C.text, marginBottom: 8, textAlign: 'center' }}>
        No Notifications
      </Text>
      <Text style={{ fontSize: 14, fontFamily: Font.regular, color: C.textMuted, textAlign: 'center', lineHeight: 21 }}>
        {subtitle}
      </Text>
    </View>
  );
}

// ── NotificationInbox ─────────────────────────────────────────────────────────

export default function NotificationInbox({
  showBack = false,
  onBack,
  emptySubtitle = 'No notifications yet.',
  fabLabel,
  onFab,
  applyTopInset = true,
}) {
  const { C } = useTheme();

  const [search, setSearch] = useState('');
  const [selectedNotif, setSelectedNotif] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const { data: notifications = [], isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllRead();
  const bulkDelete = useBulkDeleteNotifications();
  const bulkRead = useBulkMarkRead();

  const isSelecting = selectedIds.size > 0;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return notifications;
    return notifications.filter(
      n => n.title?.toLowerCase().includes(q) || n.body?.toLowerCase().includes(q),
    );
  }, [notifications, search]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.is_read).length, [notifications]);
  const allSelected = selectedIds.size === filtered.length && filtered.length > 0;

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  function handleRowPress(item) {
    if (isSelecting) { toggleSelect(item.id); return; }
    if (!item.is_read) markRead.mutate(item.id);
    setSelectedNotif(item);
  }

  function handleSelectAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(n => n.id)));
  }

  function handleBulkDelete() {
    bulkDelete.mutate([...selectedIds]);
    setSelectedIds(new Set());
  }

  function handleBulkMarkRead() {
    bulkRead.mutate([...selectedIds]);
    setSelectedIds(new Set());
  }

  const hasFab = !!(fabLabel && onFab);
  const listPadB = isSelecting ? 100 : hasFab ? 100 : 32;
  const s = useMemo(() => makeStyles(C), [C]);

  return (
    <SafeAreaView applyTop={applyTopInset} style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* Header */}
      <View style={s.header}>
        {isSelecting ? (
          <>
            <TouchableOpacity
              onPress={() => setSelectedIds(new Set())}
              style={s.headerSideBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[s.headerAction, { fontFamily: Font.medium }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle}>{selectedIds.size} selected</Text>
            <TouchableOpacity
              onPress={handleSelectAll}
              style={s.headerSideBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[s.headerAction, { fontFamily: Font.medium }]}>
                {allSelected ? 'None' : 'All'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {showBack ? (
              <TouchableOpacity
                onPress={onBack}
                style={s.backBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <BackIcon color="#fff" />
              </TouchableOpacity>
            ) : (
              <View style={s.backBtn} />
            )}
            <Text style={s.headerTitle}>Notifications</Text>
            {unreadCount > 0 ? (
              <TouchableOpacity
                style={s.markAllBtn}
                onPress={() => markAllRead.mutate()}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <CheckIcon color="#fff" size={13} />
                <Text style={s.markAllText}>All read</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 72 }} />
            )}
          </>
        )}
      </View>

      {/* Search */}
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search notifications…"
        onClear={() => setSearch('')}
        style={s.searchBar}
      />

      {/* Unread banner */}
      {!isSelecting && unreadCount > 0 && !search && (
        <View style={[s.unreadBanner, { backgroundColor: C.primaryLight }]}>
          <Text style={[s.unreadBannerText, { color: C.primary, fontFamily: Font.semiBold }]}>
            {unreadCount} unread notification{unreadCount > 1 ? 's' : ''}
          </Text>
        </View>
      )}

      {/* Long-press hint */}
      {!isSelecting && notifications.length > 0 && !search && (
        <Text style={[s.selectHint, { color: C.textSubtle, fontFamily: Font.regular }]}>
          Long-press a notification to select
        </Text>
      )}

      {/* List */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[s.list, { paddingBottom: listPadB }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            search ? (
              <View style={{ alignItems: 'center', paddingTop: 60 }}>
                <Text style={{ fontSize: 15, fontFamily: Font.semiBold, color: C.textMuted }}>
                  No results for "{search}"
                </Text>
              </View>
            ) : (
              <EmptyState subtitle={emptySubtitle} C={C} />
            )
          }
          renderItem={({ item }) => (
            <NotificationRow
              item={item}
              isSelected={selectedIds.has(item.id)}
              isSelecting={isSelecting}
              onPress={handleRowPress}
              onLongPress={toggleSelect}
              C={C}
            />
          )}
        />
      )}

      {/* Bulk action bar */}
      {isSelecting && (
        <View style={[s.actionBar, { backgroundColor: C.card, borderTopColor: C.border }]}>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: C.primaryLight }]}
            onPress={handleBulkMarkRead}
            disabled={bulkRead.isPending}
            activeOpacity={0.75}
          >
            <CheckIcon color={C.primary} size={15} />
            <Text style={[s.actionBtnText, { color: C.primary, fontFamily: Font.semiBold }]}>
              Mark Read
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: C.dangerLight }]}
            onPress={handleBulkDelete}
            disabled={bulkDelete.isPending}
            activeOpacity={0.75}
          >
            <TrashIcon color={C.danger} size={15} />
            <Text style={[s.actionBtnText, { color: C.danger, fontFamily: Font.semiBold }]}>
              Delete
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Optional FAB */}
      {hasFab && !isSelecting && (
        <TouchableOpacity
          style={[s.fab, { backgroundColor: C.primary }]}
          onPress={onFab}
          activeOpacity={0.85}
        >
          <SendIcon color="#fff" size={18} />
          <Text style={[s.fabLabel, { fontFamily: Font.bold }]}>{fabLabel}</Text>
        </TouchableOpacity>
      )}

      {/* Detail modal */}
      <NotificationDetailModal
        visible={!!selectedNotif}
        notification={selectedNotif}
        C={C}
        onClose={() => setSelectedNotif(null)}
      />
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
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: Font.bold, color: '#fff' },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 4 },
  markAllText: { fontSize: 12, fontFamily: Font.medium, color: '#fff' },
  headerSideBtn: { minWidth: 60, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  headerAction: { fontSize: 14, color: '#fff' },

  searchBar: { marginTop: 12, marginBottom: 0 },
  unreadBanner: { marginHorizontal: 16, marginTop: 10, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center' },
  unreadBannerText: { fontSize: 13 },
  selectHint: { fontSize: 11, textAlign: 'center', marginTop: 6, marginBottom: 2 },

  list: { paddingHorizontal: 16, paddingTop: 14 },

  actionBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14, paddingBottom: 24,
    borderTopWidth: 1,
  },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  actionBtnText: { fontSize: 14 },

  fab: {
    position: 'absolute', bottom: 24, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 24, paddingVertical: 14, borderRadius: 30,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 12, elevation: 8,
  },
  fabLabel: { fontSize: 15, color: '#fff' },
});
