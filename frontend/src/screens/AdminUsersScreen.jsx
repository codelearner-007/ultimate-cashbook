import React, { useMemo, useCallback, memo, useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  StatusBar, Modal, Pressable, Image, Animated, ScrollView,
} from 'react-native';
import SearchBar from '../components/ui/SearchBar';
import { Font } from '../constants/fonts';
import { Image as ExpoImage } from 'expo-image';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useAuthStore } from '../store/authStore';
import { useProfile, useUpdateProfile } from '../hooks/useProfile';
import Toast from '../lib/toast';
import { apiGetAllUsers, apiGetBooks } from '../lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PLAN_META, planColor, planLabel } from '../constants/plans';

// ── Super Admin header badge ──────────────────────────────────────────────────

const SA_SPARKS = [
  { top: -4, left:  2 },
  { top: -4, right: 4 },
  { bottom: -4, left: 10 },
  { bottom: -4, right: 2 },
];
const SA_SPARK_COLORS = ['#FCD34D', '#F59E0B', '#FDE68A', '#D97706'];

function SuperAdminBadge() {
  const glow   = useRef(new Animated.Value(1)).current;
  const sparks = useRef(SA_SPARKS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 0.45, duration: 800, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 1.0,  duration: 800, useNativeDriver: true }),
        Animated.delay(200),
      ])
    ).start();

    sparks.forEach((anim, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 280),
          Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }),
          Animated.delay(700),
        ])
      ).start();
    });

    return () => [glow, ...sparks].forEach(a => a.stopAnimation());
  }, []);

  return (
    <View style={{ position: 'relative', alignSelf: 'flex-start' }}>
      <Animated.View style={[sab.badge, { opacity: glow }]}>
        <View style={sab.dot} />
        <Text style={sab.text}>Super Admin</Text>
      </Animated.View>
      {SA_SPARKS.map((pos, i) => (
        <Animated.View
          key={i}
          style={[sab.spark, pos, {
            backgroundColor: SA_SPARK_COLORS[i],
            opacity: sparks[i],
            transform: [{ rotate: '45deg' }, { scale: sparks[i] }],
          }]}
        />
      ))}
    </View>
  );
}

const sab = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(251,191,36,0.22)',
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.55)',
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
  },
  dot:   { width: 5, height: 5, borderRadius: 3, backgroundColor: '#FCD34D' },
  text:  { fontSize: 10, fontFamily: Font.semiBold, color: '#FCD34D', letterSpacing: 0.4 },
  spark: { position: 'absolute', width: 4, height: 4, borderRadius: 1 },
});

// ── Filter constants ──────────────────────────────────────────────────────────

const DATE_FILTERS = [
  { key: 'all',   label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: 'last7', label: 'Last 7 Days' },
  { key: 'month', label: 'This Month' },
  { key: 'year',  label: 'This Year' },
];

const PLAN_OPTIONS = [
  { key: 'all',              label: 'All Plans' },
  { key: 'free',             label: 'Free' },
  { key: 'pro_monthly',      label: 'Pro · Monthly' },
  { key: 'pro_yearly',       label: 'Pro · Yearly' },
  { key: 'business_monthly', label: 'Business · Monthly' },
  { key: 'business_yearly',  label: 'Business · Yearly' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const getInitials = (str = '') =>
  str.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();


const fmtStorage = (mb) => {
  if (!mb || mb === 0) return '0 KB';
  if (mb < 1) return `${Math.round(mb * 1024)} KB`;
  return `${mb.toFixed(1)} MB`;
};

// ── Custom icons (SVG-in-RN) ──────────────────────────────────────────────────

const SunIcon = ({ color, size = 18 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.4, height: size * 0.4, borderRadius: size * 0.2, backgroundColor: color }} />
    {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (
      <View key={i} style={{
        position: 'absolute', width: 2, height: size * 0.22,
        backgroundColor: color, borderRadius: 1,
        top: size * 0.04, left: size / 2 - 1,
        transformOrigin: `1px ${size * 0.46}px`,
        transform: [{ rotate: `${deg}deg` }, { translateY: -size * 0.28 }],
      }} />
    ))}
  </View>
);

const MoonIcon = ({ color, size = 18 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.75, height: size * 0.75, borderRadius: size * 0.375, backgroundColor: color }} />
    <View style={{ position: 'absolute', right: 0, top: 0, width: size * 0.6, height: size * 0.6, borderRadius: size * 0.3, backgroundColor: 'transparent', borderWidth: size * 0.3, borderColor: 'transparent' }} />
  </View>
);

const XIcon = ({ color, size = 16 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ position: 'absolute', width: size, height: 2, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '45deg' }] }} />
    <View style={{ position: 'absolute', width: size, height: 2, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '-45deg' }] }} />
  </View>
);


const CheckIcon = ({ color, size = 20 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{
      width: size * 0.58, height: size * 0.32,
      borderLeftWidth: 2.5, borderBottomWidth: 2.5,
      borderColor: color,
      transform: [{ rotate: '-45deg' }, { translateY: -size * 0.04 }],
    }} />
  </View>
);

const ChevronDownIcon = ({ color, size = 14 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{
      width: size * 0.55, height: size * 0.55,
      borderRightWidth: 2, borderBottomWidth: 2,
      borderColor: color,
      transform: [{ rotate: '45deg' }, { translateY: -size * 0.12 }],
    }} />
  </View>
);

// Share icon (two overlapping circles + lines)
const ShareIcon = ({ color, size = 14 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ position: 'absolute', right: 0, top: 0, width: size * 0.42, height: size * 0.42, borderRadius: size * 0.21, borderWidth: 1.5, borderColor: color }} />
    <View style={{ position: 'absolute', left: 0, top: size * 0.28, width: size * 0.42, height: size * 0.42, borderRadius: size * 0.21, borderWidth: 1.5, borderColor: color }} />
    <View style={{ position: 'absolute', right: 0, bottom: 0, width: size * 0.42, height: size * 0.42, borderRadius: size * 0.21, borderWidth: 1.5, borderColor: color }} />
    <View style={{ position: 'absolute', width: size * 0.55, height: 1.5, backgroundColor: color, top: size * 0.2, left: size * 0.1, transform: [{ rotate: '30deg' }] }} />
    <View style={{ position: 'absolute', width: size * 0.55, height: 1.5, backgroundColor: color, bottom: size * 0.2, left: size * 0.1, transform: [{ rotate: '-30deg' }] }} />
  </View>
);

// ── User Row ──────────────────────────────────────────────────────────────────

const UserRow = memo(({ item, onPress, C, s }) => {
  const initials = getInitials(item.full_name);
  const pColor   = item.isAdmin ? '#F59E0B' : planColor(item.subscription_tier, C.primary);
  const pColorBg = `${pColor}20`;
  const tier     = item.isAdmin ? null : (item.subscription_tier ?? 'free');
  const cycle    = item.subscription_billing_cycle ?? 'monthly';
  return (
    <TouchableOpacity
      style={[s.userCard, item.isAdmin && { borderColor: 'rgba(251,191,36,0.45)', backgroundColor: 'rgba(251,191,36,0.07)' }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[s.userAvatar, { backgroundColor: pColorBg, borderWidth: 2, borderColor: `${pColor}55`, overflow: 'hidden' }]}>
        {item.avatar_url
          ? <ExpoImage source={{ uri: item.avatar_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          : <Text style={[s.userAvatarText, { color: pColor }]}>{initials}</Text>
        }
      </View>
      <View style={s.userInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <Text style={[s.userName, { flex: 1 }]} numberOfLines={1}>{item.full_name}</Text>
          {item.isAdmin ? (
            <View style={[s.userStatusPill, { backgroundColor: 'rgba(251,191,36,0.18)', borderColor: 'rgba(251,191,36,0.5)' }]}>
              <View style={[s.userStatusDot, { backgroundColor: '#FCD34D' }]} />
              <Text style={[s.userStatusText, { color: '#D97706' }]}>Super Admin</Text>
            </View>
          ) : (
            <View style={[s.userStatusPill, { backgroundColor: `${pColor}18`, borderColor: `${pColor}55` }]}>
              <View style={[s.userStatusDot, { backgroundColor: pColor }]} />
              <Text style={[s.userStatusText, { color: pColor }]}>
                {planLabel(tier, cycle)}
              </Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={s.userEmail} numberOfLines={1}>{item.email}</Text>
          {!item.isAdmin && item.shared_books_count > 0 && (
            <View style={[s.accessBadge, { backgroundColor: C.primaryLight, borderColor: `${C.primary}44` }]}>
              <ShareIcon color={C.primary} size={10} />
              <Text style={[s.accessBadgeText, { color: C.primary }]}>{item.shared_books_count}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ── Stat Card ─────────────────────────────────────────────────────────────────

const StatCard = memo(({ label, value, sub, s }) => (
  <View style={s.statCard}>
    <Text style={s.statValue}>{value}</Text>
    <Text style={s.statLabel}>{label}</Text>
    {sub ? <Text style={s.statSub}>{sub}</Text> : null}
  </View>
));

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminUsersScreen() {
  const router    = useRouter();
  const { C, Font, isDark, toggleTheme } = useTheme();
  const s         = useMemo(() => makeStyles(C, Font), [C, Font]);
  const user = useAuthStore((st) => st.user);
  const qc   = useQueryClient();
  const { data: adminProfile } = useProfile();
  const updateProfile = useUpdateProfile();

  const handleThemeToggle = useCallback(() => {
    const next = !isDark;
    toggleTheme();
    updateProfile.mutate(
      { is_dark_mode: next },
      {
        onError: () => {
          toggleTheme();
          Toast.show({ type: 'error', text1: 'Could not save theme preference.' });
        },
      },
    );
  }, [isDark, toggleTheme, updateProfile]);

  const [selectedUserId, setSelectedUserId] = useState(null);
  const [searchQuery,    setSearchQuery]    = useState('');
  const [dateFilter,     setDateFilter]     = useState('all');
  const [planFilter,     setPlanFilter]     = useState('all');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const [isFocused,      setIsFocused]      = useState(false);

  const { data: allUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn:  apiGetAllUsers,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: isFocused ? 10000 : false,
  });

  const { data: books = [] } = useQuery({
    queryKey: ['books'],
    queryFn:  apiGetBooks,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['books'] });
      return () => setIsFocused(false);
    }, [qc])
  );

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let users = !q ? allUsers : allUsers.filter(
      u => u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q),
    );

    if (dateFilter !== 'all') {
      const now = new Date();
      users = users.filter(u => {
        if (!u.created_at) return true;
        const d = new Date(u.created_at);
        if (dateFilter === 'today')
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
        if (dateFilter === 'last7')  return (now - d) / 86400000 <= 7;
        if (dateFilter === 'month')  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        if (dateFilter === 'year')   return d.getFullYear() === now.getFullYear();
        return true;
      });
    }

    if (planFilter !== 'all') {
      users = users.filter(u => {
        const tier  = u.subscription_tier  ?? 'free';
        const cycle = u.subscription_billing_cycle ?? 'monthly';
        const key   = tier === 'free' ? 'free' : `${tier}_${cycle}`;
        return key === planFilter;
      });
    }

    return users;
  }, [allUsers, searchQuery, dateFilter, planFilter]);

  const adminItem = useMemo(() => ({
    id:                 user?.id ?? '__admin__',
    full_name:          adminProfile?.full_name ?? user?.full_name ?? 'Admin',
    email:              adminProfile?.email     ?? user?.email     ?? '',
    avatar_url:         adminProfile?.avatar_url ?? null,
    isAdmin:            true,
    book_count:         books.length,
    storage_mb:         adminProfile?.storage_mb ?? 0,
    entry_count:        0,
    shared_books_count: 0,
    created_at:         null,
  }), [user, adminProfile, books.length]);

  const listData = useMemo(() => [adminItem, ...filteredUsers], [adminItem, filteredUsers]);

  const selectedUser = useMemo(() => {
    if (!selectedUserId) return null;
    if (adminItem.id === selectedUserId) return adminItem;
    return allUsers.find(u => u.id === selectedUserId) ?? null;
  }, [allUsers, selectedUserId, adminItem]);

  const handleViewUser = useCallback((userId) => {
    setSelectedUserId(userId);
  }, []);

  const goToProfile = useCallback(() => {
    router.push('/(app)/admin-profile');
  }, [router]);

  const stats = useMemo(() => {
    const isAll        = dateFilter === 'all' && planFilter === 'all' && !searchQuery.trim();
    const totalUsers   = filteredUsers.length;
    const totalBooks   = filteredUsers.reduce((acc, u) => acc + (u.book_count ?? 0), 0) + (isAll ? books.length : 0);
    const totalStorage = filteredUsers.reduce((acc, u) => acc + (u.storage_mb ?? 0), 0);
    return { totalUsers, totalBooks, totalStorage, isAll };
  }, [filteredUsers, books, dateFilter, planFilter, searchQuery]);

  const adminInitials = useMemo(() => getInitials(user?.full_name ?? 'AD'), [user]);

  const renderUser = useCallback(({ item }) => (
    <UserRow
      item={item}
      onPress={() => handleViewUser(item.id)}
      C={C}
      s={s}
    />
  ), [C, s, handleViewUser]);

  // ── Filter chip state ─────────────────────────────────────────────────────

  const isAllSelected    = dateFilter === 'all' && planFilter === 'all';
  const currentDateLabel = DATE_FILTERS.find(d => d.key === dateFilter)?.label ?? 'All Time';
  const planIsActive     = planFilter !== 'all';
  const planChipLabel    = PLAN_OPTIONS.find(o => o.key === planFilter && o.key !== 'all')?.label ?? 'Plan';

  const PLAN_PICKER = PLAN_OPTIONS.filter(o => o.key !== 'all');

  const ListHeader = (
    <View>
      <SearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search by name or email…"
      />

      {/* ── Filter row ───────────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterRowContent}
        style={s.filterRow}
      >
        {/* ALL chip */}
        <TouchableOpacity
          onPress={() => { setDateFilter('all'); setPlanFilter('all'); }}
          activeOpacity={0.75}
          style={[s.filterChip, {
            borderColor:     isAllSelected ? C.primary : C.border,
            backgroundColor: isAllSelected ? C.primary : C.card,
          }]}
        >
          <Text style={[s.filterChipText, { color: isAllSelected ? '#fff' : C.textMuted }]}>All</Text>
        </TouchableOpacity>

        {/* Plan picker */}
        <TouchableOpacity
          onPress={() => setPlanPickerOpen(true)}
          activeOpacity={0.75}
          style={[s.filterChip, {
            borderColor:     planIsActive ? C.primary : C.border,
            backgroundColor: planIsActive ? C.primary : C.card,
            gap: 5,
          }]}
        >
          <Text style={[s.filterChipText, { color: planIsActive ? '#fff' : C.textMuted }]}>{planChipLabel}</Text>
          <ChevronDownIcon color={planIsActive ? '#fff' : C.textMuted} size={12} />
        </TouchableOpacity>

        {/* Date picker */}
        <TouchableOpacity
          onPress={() => setDatePickerOpen(true)}
          activeOpacity={0.75}
          style={[s.filterChip, {
            borderColor:     dateFilter !== 'all' ? C.primary : C.border,
            backgroundColor: dateFilter !== 'all' ? C.primary : C.card,
            gap: 5,
          }]}
        >
          <Text style={[s.filterChipText, { color: dateFilter !== 'all' ? '#fff' : C.textMuted }]}>{currentDateLabel}</Text>
          <ChevronDownIcon color={dateFilter !== 'all' ? '#fff' : C.textMuted} size={12} />
        </TouchableOpacity>
      </ScrollView>

      <View style={s.listDivider} />
    </View>
  );

  const ListEmpty = !usersLoading && (
    <View style={s.empty}>
      <View style={s.emptyIconBox}>
        <View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 36 * 0.42, height: 36 * 0.42, borderRadius: 36 * 0.21, borderWidth: 2, borderColor: C.primary, marginBottom: 2 }} />
          <View style={{ width: 36 * 0.65, height: 36 * 0.28, borderTopLeftRadius: 36 * 0.14, borderTopRightRadius: 36 * 0.14, borderWidth: 2, borderColor: C.primary, borderBottomWidth: 0 }} />
        </View>
      </View>
      <Text style={s.emptyTitle}>No users found</Text>
      <Text style={s.emptySub}>Try adjusting your filters{'\n'}or search query</Text>
    </View>
  );

  return (
    <SafeAreaView applyTop={false} style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? C.background : C.primary} />

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <View style={s.headerLeft}>
            <TouchableOpacity onPress={goToProfile} activeOpacity={0.8} style={s.avatarCircle}>
              {adminProfile?.avatar_url
                ? <Image source={{ uri: adminProfile.avatar_url }} style={s.avatarImg} />
                : <Text style={s.avatarText}>{adminInitials}</Text>
              }
            </TouchableOpacity>
            <View style={s.brandBlock}>
              <Text style={s.headerTitle}>Dashboard</Text>
              <SuperAdminBadge />
            </View>
          </View>
          <View style={s.headerActions}>
            <TouchableOpacity onPress={handleThemeToggle} style={s.iconBtn} activeOpacity={0.8}>
              {isDark
                ? <SunIcon  color={C.onPrimary} size={18} />
                : <MoonIcon color={C.onPrimary} size={18} />}
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.headerDivider} />

        <View style={s.statsRow}>
          <StatCard label="Total Users"  value={stats.totalUsers}               sub={null} s={s} />
          <View style={s.statDivider} />
          <StatCard label="Total Books"  value={stats.totalBooks}               sub={null} s={s} />
          <View style={s.statDivider} />
          <StatCard label="Storage"      value={fmtStorage(stats.totalStorage)} sub={stats.isAll ? 'all users' : 'filtered'} s={s} />
        </View>
      </View>

      {/* ── Users list ───────────────────────────────────────────────────── */}
      <FlatList
        data={listData}
        keyExtractor={item => item.id}
        renderItem={renderUser}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.listContent}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
      />

      {/* ── User Detail Modal ────────────────────────────────────────────── */}
      {selectedUserId != null && selectedUser && (
        <Modal
          visible
          animationType="slide"
          transparent
          onRequestClose={() => setSelectedUserId(null)}
        >
          <Pressable style={s.modalOverlay} onPress={() => setSelectedUserId(null)}>
            <Pressable style={s.modalBox} onPress={() => {}}>
              <View style={s.modalHandle} />

              {/* Close */}
              <TouchableOpacity
                style={s.modalCloseBtn}
                onPress={() => setSelectedUserId(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <XIcon color={C.textMuted} size={13} />
              </TouchableOpacity>

              {/* Avatar + identity */}
              {(() => {
                const mPColor   = selectedUser.isAdmin ? '#F59E0B' : planColor(selectedUser.subscription_tier, C.primary);
                const mPColorBg = `${mPColor}20`;
                return (
              <View style={s.modalAvatarSection}>
                <View style={[s.modalAvatarRing, { borderColor: `${mPColor}99` }]}>
                  <View style={[s.modalAvatarCircle, { backgroundColor: mPColorBg }]}>
                    {selectedUser.avatar_url
                      ? <ExpoImage
                          source={{ uri: selectedUser.avatar_url }}
                          style={{ width: '100%', height: '100%', borderRadius: 30 }}
                          contentFit="cover"
                        />
                      : <Text style={[s.modalAvatarInitials, { color: mPColor }]}>
                          {getInitials(selectedUser.full_name)}
                        </Text>
                    }
                  </View>
                  <View style={[s.modalAvatarDot, { backgroundColor: mPColor }]} />
                </View>

                <Text style={s.modalUserName}>{selectedUser.full_name}</Text>
                <Text style={s.modalUserEmail}>{selectedUser.email}</Text>
              </View>
                );
              })()}

              {/* Stats row — Books | Entries | Storage | Access */}
              <View style={s.modalStatsRow}>
                <View style={s.modalStatItem}>
                  <Text style={s.modalStatValue}>{selectedUser.book_count ?? 0}</Text>
                  <Text style={s.modalStatLabel}>Books</Text>
                </View>
                <View style={s.modalStatDivider} />
                <View style={s.modalStatItem}>
                  <Text style={s.modalStatValue}>{selectedUser.entry_count ?? 0}</Text>
                  <Text style={s.modalStatLabel}>Entries</Text>
                </View>
                <View style={s.modalStatDivider} />
                <View style={s.modalStatItem}>
                  <Text style={s.modalStatValue}>{fmtStorage(selectedUser.storage_mb)}</Text>
                  <Text style={s.modalStatLabel}>Storage</Text>
                </View>
                {!selectedUser.isAdmin && (
                  <>
                    <View style={s.modalStatDivider} />
                    <View style={s.modalStatItem}>
                      <Text style={[s.modalStatValue, { color: (selectedUser.shared_books_count ?? 0) > 0 ? C.primary : C.text }]}>
                        {selectedUser.shared_books_count ?? 0}
                      </Text>
                      <Text style={s.modalStatLabel}>Access{'\n'}Given</Text>
                    </View>
                  </>
                )}
              </View>

              {/* Access given info (only for regular users who have shares) */}
              {!selectedUser.isAdmin && (selectedUser.shared_books_count ?? 0) > 0 && (
                <View style={[s.infoCard, { backgroundColor: C.primaryLight, borderColor: `${C.primary}44`, marginBottom: 8 }]}>
                  <View style={[s.infoCardIconBox, { backgroundColor: `${C.primary}22` }]}>
                    <ShareIcon color={C.primary} size={14} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.infoCardTitle, { color: C.primary }]}>Access Given</Text>
                    <Text style={s.infoCardSub}>
                      {selectedUser.shared_books_count === 1
                        ? 'Sharing 1 book with other users'
                        : `Sharing ${selectedUser.shared_books_count} books with other users`}
                    </Text>
                  </View>
                </View>
              )}

              {/* Subscription card */}
              {!selectedUser.isAdmin && (() => {
                const tier   = selectedUser.subscription_tier ?? 'free';
                const cycle  = selectedUser.subscription_billing_cycle ?? 'monthly';
                const accent = planColor(tier, C.primary);
                const label  = planLabel(tier, cycle);
                const isFree = tier === 'free';
                return (
                  <View style={[s.infoCard, {
                    backgroundColor: isFree ? C.cardAlt      : `${accent}18`,
                    borderColor:     isFree ? C.border       : `${accent}44`,
                  }]}>
                    <View style={[s.infoCardIconBox, { backgroundColor: `${accent}22` }]}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: accent }} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.infoCardTitle, { color: accent }]}>Subscription</Text>
                      <Text style={s.infoCardSub}>{label}</Text>
                    </View>
                    <View style={[s.statusInfoBadge, {
                      backgroundColor: `${accent}18`,
                      borderColor:     `${accent}55`,
                    }]}>
                      <View style={[s.statusInfoDot, { backgroundColor: accent }]} />
                      <Text style={[s.statusInfoBadgeText, { color: accent }]}>{label}</Text>
                    </View>
                  </View>
                );
              })()}

            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* ── Plan Picker Sheet ────────────────────────────────────────────── */}
      {planPickerOpen && (
        <Modal visible animationType="slide" transparent onRequestClose={() => setPlanPickerOpen(false)}>
          <Pressable style={s.pickerOverlay} onPress={() => setPlanPickerOpen(false)}>
            <Pressable style={s.pickerBox} onPress={() => {}}>
              <View style={s.modalHandle} />
              <Text style={s.pickerTitle}>Subscription Plan</Text>
              {planFilter !== 'all' && (
                <TouchableOpacity
                  style={[s.pickerClearRow, { backgroundColor: C.primaryLight }]}
                  onPress={() => { setPlanFilter('all'); setPlanPickerOpen(false); }}
                  activeOpacity={0.75}
                >
                  <XIcon color={C.primary} size={11} />
                  <Text style={[s.pickerClearText, { color: C.primary }]}>Clear</Text>
                </TouchableOpacity>
              )}
              {PLAN_PICKER.map(opt => {
                const on = planFilter === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[s.pickerRow, on && { backgroundColor: C.primary }]}
                    onPress={() => { setPlanFilter(opt.key); setPlanPickerOpen(false); }}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.pickerRowText, { color: on ? C.onPrimary : C.text }]}>{opt.label}</Text>
                    {on && <CheckIcon color={C.onPrimary} size={16} />}
                  </TouchableOpacity>
                );
              })}
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* ── Date Picker Sheet ────────────────────────────────────────────── */}
      {datePickerOpen && (
        <Modal visible animationType="slide" transparent onRequestClose={() => setDatePickerOpen(false)}>
          <Pressable style={s.pickerOverlay} onPress={() => setDatePickerOpen(false)}>
            <Pressable style={s.pickerBox} onPress={() => {}}>
              <View style={s.modalHandle} />
              <Text style={s.pickerTitle}>Join Date</Text>
              {dateFilter !== 'all' && (
                <TouchableOpacity
                  style={[s.pickerClearRow, { backgroundColor: C.primaryLight }]}
                  onPress={() => { setDateFilter('all'); setDatePickerOpen(false); }}
                  activeOpacity={0.75}
                >
                  <XIcon color={C.primary} size={11} />
                  <Text style={[s.pickerClearText, { color: C.primary }]}>Clear</Text>
                </TouchableOpacity>
              )}
              {DATE_FILTERS.map(opt => {
                const on = dateFilter === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[s.pickerRow, on && { backgroundColor: C.primary }]}
                    onPress={() => { setDateFilter(opt.key); setDatePickerOpen(false); }}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.pickerRowText, { color: on ? C.onPrimary : C.text }]}>{opt.label}</Text>
                    {on && <CheckIcon color={C.onPrimary} size={16} />}
                  </TouchableOpacity>
                );
              })}
            </Pressable>
          </Pressable>
        </Modal>
      )}

    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeStyles = (C, Font) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },

  // Header
  header:        { backgroundColor: C.primary, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  headerTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headerLeft:    { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  avatarCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.onPrimaryIconBg, borderWidth: 2, borderColor: C.onPrimarySubtle, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg:    { width: 44, height: 44, borderRadius: 22 },
  avatarText:   { fontSize: 14, fontFamily: Font.bold, color: C.onPrimary },

  brandBlock:  { justifyContent: 'center', gap: 4 },
  headerTitle: { fontSize: 20, fontFamily: Font.extraBold, color: C.onPrimary, lineHeight: 26 },

  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.onPrimaryIconBg, alignItems: 'center', justifyContent: 'center' },

  headerDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.14)', marginBottom: 16 },

  statsRow:    { flexDirection: 'row', alignItems: 'center' },
  statCard:    { flex: 1, alignItems: 'center' },
  statValue:   { fontSize: 18, fontFamily: Font.bold,    color: C.onPrimary,      lineHeight: 24, marginBottom: 2 },
  statLabel:   { fontSize: 11, fontFamily: Font.medium,  color: C.onPrimaryMuted, lineHeight: 16 },
  statSub:     { fontSize: 10, fontFamily: Font.regular, color: C.onPrimaryMuted, lineHeight: 14, marginTop: 1 },
  statDivider: { width: 1, height: 36, backgroundColor: C.onPrimaryIconBg },

  listContent: { paddingTop: 12, paddingBottom: 32 },

  // User card
  userCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.card, marginHorizontal: 16, marginBottom: 8,
    borderRadius: 50, paddingVertical: 6, paddingRight: 10, paddingLeft: 6,
    borderWidth: 1.5, borderColor: C.border,
  },
  userAvatar:     { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  userAvatarText: { fontSize: 15, fontFamily: Font.extraBold },
  userInfo:       { flex: 1 },
  userName:       { fontSize: 14, fontFamily: Font.semiBold, color: C.text,     lineHeight: 20 },
  userEmail:      { fontSize: 11, fontFamily: Font.regular,  color: C.textMuted, lineHeight: 17 },
  userStatusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  userStatusDot:  { width: 5, height: 5, borderRadius: 3 },
  userStatusText: { fontSize: 10, fontFamily: Font.semiBold, lineHeight: 14 },

  // Access badge shown next to email in user row
  accessBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 20, paddingHorizontal: 6, paddingVertical: 2 },
  accessBadgeText: { fontSize: 10, fontFamily: Font.semiBold, lineHeight: 14 },

  listDivider: { height: 1, backgroundColor: C.border, marginBottom: 4 },

  // Filter row
  filterRow:        { marginTop: 10, marginBottom: 4 },
  filterRowContent: { paddingHorizontal: 16, gap: 8, flexDirection: 'row', alignItems: 'center' },
  filterChip: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 20, borderWidth: 1.5,
    paddingHorizontal: 13, paddingVertical: 6,
  },
  filterChipText: { fontSize: 12, fontFamily: Font.semiBold },

  // Picker sheets
  pickerOverlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' },
  pickerBox: {
    backgroundColor: C.card,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28,
  },
  pickerTitle: {
    fontSize: 14, fontFamily: Font.bold, color: C.text,
    textAlign: 'center', marginBottom: 12,
  },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 16,
    borderRadius: 12, marginBottom: 4,
  },
  pickerRowText: { flex: 1, fontSize: 14, fontFamily: Font.medium },
  pickerClearRow: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end',
    paddingVertical: 4, paddingHorizontal: 10,
    borderRadius: 20, marginBottom: 8, gap: 5,
  },
  pickerClearText: { fontSize: 11, fontFamily: Font.semiBold },

  // Empty state
  empty:        { alignItems: 'center', paddingTop: 70, paddingHorizontal: 40 },
  emptyIconBox: { width: 80, height: 80, borderRadius: 24, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle:   { fontSize: 17, fontFamily: Font.bold,    color: C.text,      lineHeight: 26, marginBottom: 8 },
  emptySub:     { fontSize: 13, fontFamily: Font.regular, color: C.textMuted, lineHeight: 20, textAlign: 'center' },

  // User Detail Modal
  modalOverlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 24,
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 6 },
  modalCloseBtn: { position: 'absolute', top: 14, right: 16, width: 26, height: 26, borderRadius: 13, backgroundColor: C.cardAlt, alignItems: 'center', justifyContent: 'center' },

  // Avatar section
  modalAvatarSection: { alignItems: 'center', paddingTop: 4, paddingBottom: 14 },
  modalAvatarRing: { width: 62, height: 62, borderRadius: 31, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  modalAvatarCircle: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  modalAvatarInitials: { fontSize: 18, fontFamily: Font.extraBold },
  modalAvatarDot: { position: 'absolute', bottom: 2, right: 2, width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: C.card },
  modalUserName:  { fontSize: 16, fontFamily: Font.bold, color: C.text, lineHeight: 22, marginBottom: 2 },
  modalUserEmail: { fontSize: 12, fontFamily: Font.regular, color: C.textMuted, lineHeight: 17, marginBottom: 8 },
  // Stats row (4-column when access count shown)
  modalStatsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.cardAlt, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  modalStatItem: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  modalStatDivider: { width: 1, height: 26, backgroundColor: C.border },
  modalStatValue: { fontSize: 13, fontFamily: Font.bold, color: C.text, lineHeight: 19, marginBottom: 1 },
  modalStatLabel: { fontSize: 10, fontFamily: Font.medium, color: C.textMuted, lineHeight: 13, textAlign: 'center' },

  statusInfoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusInfoDot:   { width: 5, height: 5, borderRadius: 3 },
  statusInfoBadgeText: { fontSize: 10, fontFamily: Font.semiBold, lineHeight: 14 },

  // Shared info card (access given + subscription)
  infoCard:        { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 11, borderWidth: 1, gap: 10 },
  infoCardIconBox: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoCardTitle:   { fontSize: 13, fontFamily: Font.semiBold, lineHeight: 18 },
  infoCardSub:     { fontSize: 11, fontFamily: Font.regular, color: C.textMuted, lineHeight: 16, marginTop: 1 },
});
