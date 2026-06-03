import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  FlatList, Modal, ScrollView, Animated,
  Keyboard, Platform, ActivityIndicator,
} from 'react-native';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import { useTheme } from '../hooks/useTheme';
import { useSendNotification, useSentNotifications } from '../hooks/useNotifications';
import { useQuery } from '@tanstack/react-query';
import { apiGetAllUsers } from '../lib/api';
import { Font } from '../constants/fonts';
import Toast from '../lib/toast';
import SearchBar from '../components/ui/SearchBar';
import AppInput from '../components/ui/Input';

// ── Icons ─────────────────────────────────────────────────────────────────────

const BellIcon = ({ color, size = 22 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.62, height: size * 0.55, borderTopLeftRadius: size * 0.31, borderTopRightRadius: size * 0.31, borderWidth: 2, borderColor: color, borderBottomWidth: 0, marginTop: 2 }} />
    <View style={{ width: size * 0.78, height: size * 0.14, borderWidth: 2, borderColor: color, marginTop: -1 }} />
    <View style={{ width: size * 0.28, height: size * 0.14, borderBottomLeftRadius: size * 0.14, borderBottomRightRadius: size * 0.14, borderWidth: 2, borderColor: color, borderTopWidth: 0 }} />
  </View>
);

const SendIcon = ({ color, size = 18 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 0, height: 0, borderLeftWidth: size * 0.85, borderTopWidth: size * 0.42, borderBottomWidth: size * 0.42, borderLeftColor: color, borderTopColor: 'transparent', borderBottomColor: 'transparent' }} />
  </View>
);

const CheckIcon = ({ color, size = 14 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.55, height: size * 0.3, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: color, transform: [{ rotate: '-45deg' }], marginTop: -2 }} />
  </View>
);

const ChevronIcon = ({ color, size = 14 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.55, height: size * 0.55, borderRightWidth: 2, borderBottomWidth: 2, borderColor: color, transform: [{ rotate: '45deg' }], marginTop: -size * 0.2 }} />
  </View>
);

// ── Segment definitions ───────────────────────────────────────────────────────

const PLAN_ROWS = [
  { key: 'plan_free',  label: 'Free',             emoji: '🔓', desc: 'On the Free plan'           },
  { key: 'plan_pro_m', label: 'Pro Monthly',       emoji: '👑', desc: 'Pro · Monthly billing'      },
  { key: 'plan_pro_y', label: 'Pro Yearly',        emoji: '👑', desc: 'Pro · Yearly billing'       },
  { key: 'plan_biz_m', label: 'Business Monthly',  emoji: '👑', desc: 'Business · Monthly billing' },
  { key: 'plan_biz_y', label: 'Business Yearly',   emoji: '👑', desc: 'Business · Yearly billing'  },
];

const DAYS_OPTIONS = [
  { label: 'Last 7 days',  value: 7  },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function targetSummary(targetType, daysThreshold, selectedIds) {
  switch (targetType) {
    case 'all':         return { emoji: '👥', label: 'All Users' };
    case 'new_users':   return { emoji: '🌱', label: `New / Fresh · ${daysThreshold}d` };
    case 'plan_free':   return { emoji: '🔓', label: 'Free Plan' };
    case 'plan_pro_m':  return { emoji: '👑', label: 'Pro Monthly' };
    case 'plan_pro_y':  return { emoji: '⭐', label: 'Pro Yearly' };
    case 'plan_biz_m':  return { emoji: '💼', label: 'Business Monthly' };
    case 'plan_biz_y':  return { emoji: '🏆', label: 'Business Yearly' };
    case 'specific':    return { emoji: '🎯', label: `${selectedIds.length} user${selectedIds.length !== 1 ? 's' : ''} picked` };
    default:            return { emoji: '👥', label: 'All Users' };
  }
}

function targetBadge(targetType, daysThreshold) {
  switch (targetType) {
    case 'all':         return { label: 'ALL USERS',                     color: 'cashIn'  };
    case 'new_users':   return { label: `NEW · ${daysThreshold || 30}d`, color: 'primary' };
    case 'plan_free':   return { label: 'FREE PLAN',                     color: 'primary' };
    case 'plan_pro_m':  return { label: 'PRO MONTHLY',                   color: 'cashIn'  };
    case 'plan_pro_y':  return { label: 'PRO YEARLY',                    color: 'cashIn'  };
    case 'plan_biz_m':  return { label: 'BIZ MONTHLY',                   color: 'cashIn'  };
    case 'plan_biz_y':  return { label: 'BIZ YEARLY',                    color: 'cashIn'  };
    case 'specific':    return { label: 'SPECIFIC',                      color: 'primary' };
    default:            return { label: targetType.toUpperCase(),         color: 'primary' };
  }
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date}  •  ${time}`;
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── Specific Target Modal ─────────────────────────────────────────────────────

function SpecificModal({ visible, users, initialFilter, initialDays, initialIds, onApply, onClose, C }) {
  const [filter, setFilter]         = useState(initialFilter);
  const [days, setDays]             = useState(initialDays);
  const [pickedIds, setPickedIds]   = useState(initialIds);
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    if (visible) {
      setFilter(initialFilter);
      setDays(initialDays);
      setPickedIds(initialIds);
      setUserSearch('');
    }
  }, [visible]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase();
    return q
      ? users.filter(u => u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
      : users;
  }, [users, userSearch]);

  const canApply = filter !== null && (filter !== 'pick' || pickedIds.length > 0);

  const handleApply = () => {
    const resolvedType = filter === 'pick' ? 'specific' : filter;
    onApply({ targetType: resolvedType, daysThreshold: days, selectedIds: pickedIds });
  };

  const toggleUser = (id) =>
    setPickedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  if (!visible) return null;

  const isNew  = filter === 'new_users';
  const isPick = filter === 'pick';

  // +1 only for 'new_users' (backend self-appends admin). Plan filters are exact.
  const countFor = (key, d = days) => {
    switch (key) {
      case 'new_users':  { const cutoff = Date.now() - d * 86400000; return users.filter(u => new Date(u.created_at).getTime() >= cutoff).length + 1; }
      case 'plan_free':  return users.filter(u => !u.subscription_tier || u.subscription_tier === 'free').length;
      case 'plan_pro_m': return users.filter(u => u.subscription_tier === 'pro'      && u.subscription_billing_cycle === 'monthly').length;
      case 'plan_pro_y': return users.filter(u => u.subscription_tier === 'pro'      && u.subscription_billing_cycle === 'yearly').length;
      case 'plan_biz_m': return users.filter(u => u.subscription_tier === 'business' && u.subscription_billing_cycle === 'monthly').length;
      case 'plan_biz_y': return users.filter(u => u.subscription_tier === 'business' && u.subscription_billing_cycle === 'yearly').length;
      default: return 0;
    }
  };

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ ...StyleSheet.absoluteFillObject, backgroundColor: C.overlay }} activeOpacity={1} onPress={onClose} />

        <View style={{ backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24 }}>
          {/* Handle */}
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 14 }} />

          {/* Title row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={{ fontSize: 16, fontFamily: Font.bold, color: C.text }}>Send To</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ position: 'absolute', width: 12, height: 1.5, backgroundColor: C.textSubtle, borderRadius: 1, transform: [{ rotate: '45deg' }] }} />
                <View style={{ position: 'absolute', width: 12, height: 1.5, backgroundColor: C.textSubtle, borderRadius: 1, transform: [{ rotate: '-45deg' }] }} />
              </View>
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>

            {/* ── Section: New Users ── */}
            <Text style={{ fontSize: 10, fontFamily: Font.semiBold, color: C.textMuted, letterSpacing: 0.8, marginBottom: 6 }}>
              BY ACTIVITY
            </Text>

            {/* New card — expands days picker inline */}
            <TouchableOpacity
              style={{
                borderRadius: 12, borderWidth: 1.5, marginBottom: 6,
                borderColor: isNew ? C.primary : C.border,
                backgroundColor: isNew ? C.primaryLight : C.background,
                overflow: 'hidden',
              }}
              onPress={() => setFilter(isNew ? null : 'new_users')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12 }}>
                <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: isNew ? C.primaryMid : C.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 15 }}>🌱</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: Font.semiBold, color: isNew ? C.primary : C.text }}>New Users</Text>
                  <Text style={{ fontSize: 11, fontFamily: Font.regular, color: C.textMuted }}>Recently registered</Text>
                </View>
                <Text style={{ fontSize: 12, fontFamily: Font.semiBold, color: isNew ? C.primary : C.textMuted }}>
                  {countFor('new_users', days)}
                </Text>
                <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: isNew ? C.primary : C.border, alignItems: 'center', justifyContent: 'center' }}>
                  {isNew && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.primary }} />}
                </View>
              </View>
              {/* Inline days picker — only when selected */}
              {isNew && (
                <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                  <View style={{ height: 1, backgroundColor: C.primaryMid, marginBottom: 10 }} />
                  <Text style={{ fontSize: 10, fontFamily: Font.semiBold, color: C.primary, letterSpacing: 0.6, marginBottom: 8 }}>
                    REGISTERED WITHIN
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {DAYS_OPTIONS.map(opt => {
                      const active = days === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={{
                            flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center',
                            borderWidth: 1.5,
                            borderColor: active ? C.primary : C.primaryMid,
                            backgroundColor: active ? C.primary : 'transparent',
                          }}
                          onPress={() => setDays(opt.value)}
                          activeOpacity={0.75}
                        >
                          <Text style={{ fontSize: 11, fontFamily: Font.semiBold, color: active ? '#fff' : C.primary }}>
                            {opt.label}
                          </Text>
                          <Text style={{ fontSize: 10, fontFamily: Font.regular, color: active ? 'rgba(255,255,255,0.8)' : C.primary, marginTop: 1 }}>
                            {countFor('new_users', opt.value)} users
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </TouchableOpacity>

            {/* ── Section: By Plan ── */}
            <Text style={{ fontSize: 10, fontFamily: Font.semiBold, color: C.textMuted, letterSpacing: 0.8, marginBottom: 6, marginTop: 10 }}>
              BY PLAN
            </Text>
            <View style={{ gap: 6, marginBottom: 10 }}>
              {PLAN_ROWS.map(row => {
                const active = filter === row.key;
                return (
                  <TouchableOpacity
                    key={row.key}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5,
                      backgroundColor: active ? C.primaryLight : C.background,
                      borderColor: active ? C.primary : C.border,
                    }}
                    onPress={() => setFilter(row.key)}
                    activeOpacity={0.8}
                  >
                    <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: active ? C.primaryMid : C.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 15 }}>{row.emoji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontFamily: Font.semiBold, color: active ? C.primary : C.text }}>{row.label}</Text>
                      <Text style={{ fontSize: 11, fontFamily: Font.regular, color: C.textMuted }}>{row.desc}</Text>
                    </View>
                    <Text style={{ fontSize: 12, fontFamily: Font.semiBold, color: active ? C.primary : C.textMuted }}>
                      {countFor(row.key)}
                    </Text>
                    <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: active ? C.primary : C.border, alignItems: 'center', justifyContent: 'center' }}>
                      {active && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.primary }} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Section: Pick Users ── */}
            <Text style={{ fontSize: 10, fontFamily: Font.semiBold, color: C.textMuted, letterSpacing: 0.8, marginBottom: 6 }}>
              MANUAL
            </Text>

            {/* Pick card — expands user list inline */}
            <TouchableOpacity
              style={{
                borderRadius: 12, borderWidth: 1.5,
                borderColor: isPick ? C.primary : C.border,
                backgroundColor: isPick ? C.primaryLight : C.background,
                overflow: 'hidden',
              }}
              onPress={() => setFilter(isPick ? null : 'pick')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12 }}>
                <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: isPick ? C.primaryMid : C.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 15 }}>🎯</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: Font.semiBold, color: isPick ? C.primary : C.text }}>Pick Users</Text>
                  <Text style={{ fontSize: 11, fontFamily: Font.regular, color: C.textMuted }}>Choose manually</Text>
                </View>
                {pickedIds.length > 0 && (
                  <Text style={{ fontSize: 12, fontFamily: Font.semiBold, color: C.primary }}>
                    {pickedIds.length}
                  </Text>
                )}
                <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: isPick ? C.primary : C.border, alignItems: 'center', justifyContent: 'center' }}>
                  {isPick && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.primary }} />}
                </View>
              </View>
              {/* Inline user picker — only when selected */}
              {isPick && (
                <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                  <View style={{ height: 1, backgroundColor: C.primaryMid, marginBottom: 10 }} />
                  <SearchBar
                    value={userSearch}
                    onChangeText={setUserSearch}
                    placeholder="Search by name or email…"
                    onClear={() => setUserSearch('')}
                    style={{ marginHorizontal: 0, marginBottom: 8 }}
                  />
                  {filteredUsers.length === 0 ? (
                    <Text style={{ fontSize: 12, fontFamily: Font.regular, color: C.textMuted, textAlign: 'center', paddingVertical: 12 }}>
                      No users found
                    </Text>
                  ) : (
                    filteredUsers.map(item => {
                      const selected = pickedIds.includes(item.id);
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.primaryMid }}
                          onPress={() => toggleUser(item.id)}
                          activeOpacity={0.7}
                        >
                          <View style={{ width: 32, height: 32, borderRadius: 16, marginRight: 10, backgroundColor: selected ? C.primary : C.primaryMid, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 12, fontFamily: Font.bold, color: selected ? '#fff' : C.primary }}>
                              {initials(item.full_name)}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontFamily: Font.semiBold, color: C.text }}>{item.full_name || '—'}</Text>
                            <Text style={{ fontSize: 11, fontFamily: Font.regular, color: C.textMuted }}>{item.email}</Text>
                          </View>
                          <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: selected ? C.primary : C.primaryMid, backgroundColor: selected ? C.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                            {selected && <CheckIcon color="#fff" size={9} />}
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>
              )}
            </TouchableOpacity>

          </ScrollView>

          <TouchableOpacity
            style={{ backgroundColor: canApply ? C.primary : C.border, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 10, opacity: canApply ? 1 : 0.5 }}
            onPress={canApply ? handleApply : undefined}
            activeOpacity={0.85}
          >
            <Text style={{ fontSize: 14, fontFamily: Font.bold, color: '#fff' }}>Apply</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Sent History Row ──────────────────────────────────────────────────────────

function SentRow({ item, C }) {
  const badge = targetBadge(item.target_type, item.days_threshold);
  const bgColor   = badge.color === 'cashIn' ? C.cashInLight : badge.color === 'danger' ? C.dangerLight : C.primaryLight;
  const textColor = badge.color === 'cashIn' ? C.cashIn     : badge.color === 'danger' ? C.danger      : C.primary;

  return (
    <View style={[sentRowStyles.row, { backgroundColor: C.card, borderColor: C.border }]}>
      {/* Icon box — matches NotificationsScreen row layout */}
      <View style={[sentRowStyles.iconBox, { backgroundColor: C.primaryLight }]}>
        <BellIcon color={C.primary} size={16} />
      </View>

      <View style={sentRowStyles.body}>
        {/* Title row + badge */}
        <View style={sentRowStyles.titleRow}>
          <Text style={[sentRowStyles.title, { color: C.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={[sentRowStyles.badge, { backgroundColor: bgColor }]}>
            <Text style={{ fontSize: 10, fontFamily: Font.bold, color: textColor }}>{badge.label}</Text>
          </View>
        </View>

        {/* Body preview */}
        <Text style={[sentRowStyles.bodyText, { color: C.textMuted }]} numberOfLines={1}>
          {item.body}
        </Text>

        {/* Footer: datetime + recipients */}
        <View style={sentRowStyles.footer}>
          <Text style={[sentRowStyles.dateTime, { color: C.textSubtle }]}>{formatDateTime(item.created_at)}</Text>
          <View style={[sentRowStyles.recipientPill, { backgroundColor: C.primaryLight }]}>
            <Text style={{ fontSize: 11, fontFamily: Font.semiBold, color: C.primary }}>
              {item.recipient_count} recipient{item.recipient_count !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const sentRowStyles = StyleSheet.create({
  row:           { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 12, marginBottom: 8, borderRadius: 12, borderWidth: 1.5 },
  iconBox:       { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  body:          { flex: 1 },
  titleRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  title:         { fontSize: 13, fontFamily: Font.bold, flex: 1, marginRight: 8 },
  badge:         { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  bodyText:      { fontSize: 12, fontFamily: Font.regular, lineHeight: 17 },
  footer:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 },
  dateTime:      { fontSize: 10, fontFamily: Font.regular },
  recipientPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AdminNotificationsScreen() {
  const { C, isDark } = useTheme();
  const send   = useSendNotification();
  const { data: sent = [], isLoading: sentLoading } = useSentNotifications();
  const { data: allUsers = [] } = useQuery({ queryKey: ['admin-users'], queryFn: apiGetAllUsers });

  const [title, setTitle]           = useState('');
  const [body, setBody]             = useState('');
  const [targetType, setTargetType] = useState('all');
  const [daysThreshold, setDaysThreshold] = useState(30);
  const [selectedIds, setSelectedIds]     = useState([]);
  const [modalVisible, setModalVisible]   = useState(false);
  const [sentSearch, setSentSearch]       = useState('');

  // Keyboard lift
  const kbOffset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const up   = Keyboard.addListener(showEv, (e) =>
      Animated.timing(kbOffset, { toValue: e.endCoordinates.height, duration: Platform.OS === 'ios' ? e.duration : 150, useNativeDriver: false }).start()
    );
    const down = Keyboard.addListener(hideEv, () =>
      Animated.timing(kbOffset, { toValue: 0, duration: 150, useNativeDriver: false }).start()
    );
    return () => { up.remove(); down.remove(); };
  }, []);

  const activeUsers = useMemo(() => allUsers, [allUsers]);

  // Compute estimated recipient count from local allUsers data.
  // +1 only for 'all'/'new_users' where the backend self-appends the admin.
  // Plan filters are precise segments — the superadmin has no subscription plan.
  const recipientCount = useMemo(() => {
    if (!allUsers.length && targetType !== 'specific') return null;
    switch (targetType) {
      case 'all':        return allUsers.length + 1;
      case 'new_users': {
        const cutoff = Date.now() - daysThreshold * 86400000;
        return allUsers.filter(u => new Date(u.created_at).getTime() >= cutoff).length + 1;
      }
      case 'plan_free':  return allUsers.filter(u => !u.subscription_tier || u.subscription_tier === 'free').length;
      case 'plan_pro_m': return allUsers.filter(u => u.subscription_tier === 'pro'      && u.subscription_billing_cycle === 'monthly').length;
      case 'plan_pro_y': return allUsers.filter(u => u.subscription_tier === 'pro'      && u.subscription_billing_cycle === 'yearly').length;
      case 'plan_biz_m': return allUsers.filter(u => u.subscription_tier === 'business' && u.subscription_billing_cycle === 'monthly').length;
      case 'plan_biz_y': return allUsers.filter(u => u.subscription_tier === 'business' && u.subscription_billing_cycle === 'yearly').length;
      case 'specific':   return selectedIds.length;
      default:           return null;
    }
  }, [allUsers, targetType, daysThreshold, selectedIds]);

  // current target label shown on the "Specific" button
  const summary = useMemo(
    () => targetSummary(targetType, daysThreshold, selectedIds),
    [targetType, daysThreshold, selectedIds],
  );

  const isSpecific = targetType !== 'all';

  // initial state passed into the modal depends on current selection
  const modalInitialFilter = useMemo(() => {
    if (!isSpecific) return null;
    return targetType === 'specific' ? 'pick' : targetType;
  }, [isSpecific, targetType]);

  const canSend = title.trim().length > 0 && body.trim().length > 0 &&
    (targetType !== 'specific' || selectedIds.length > 0);

  const handleApply = ({ targetType: t, daysThreshold: d, selectedIds: ids }) => {
    setTargetType(t);
    setDaysThreshold(d);
    setSelectedIds(ids);
    setModalVisible(false);
  };

  const handleSend = () => {
    if (!canSend || send.isPending) return;
    Keyboard.dismiss();
    const payload = {
      title: title.trim(),
      body: body.trim(),
      target_type: targetType,
      ...(targetType === 'new_users' && { days_threshold: daysThreshold }),
      ...(targetType === 'specific'  && { user_ids: selectedIds }),
    };
    send.mutate(payload, {
      onSuccess: (res) => {
        Toast.show({ type: 'success', text1: `Sent to ${res.recipient_count} recipient${res.recipient_count !== 1 ? 's' : ''}` });
        setTitle(''); setBody(''); setTargetType('all'); setDaysThreshold(30); setSelectedIds([]);
      },
      onError: (err) => {
        Toast.show({ type: 'error', text1: 'Failed to send', text2: err?.response?.data?.detail || 'Please try again.' });
      },
    });
  };

  const filteredSent = useMemo(() => {
    const q = sentSearch.toLowerCase().trim();
    if (!q) return sent;
    return sent.filter(n => n.title?.toLowerCase().includes(q) || n.body?.toLowerCase().includes(q));
  }, [sent, sentSearch]);

  const s = useMemo(() => makeStyles(C), [C]);

  // Build FlatList data: [history-header-item, ...rows / states]
  const listData = useMemo(() => {
    const header = { _type: 'history-header', _key: 'history-header' };
    if (sentLoading) return [header, { _type: 'loading',    _key: 'loading'    }];
    if (sent.length === 0)         return [header, { _type: 'empty',      _key: 'empty'      }];
    if (filteredSent.length === 0) return [header, { _type: 'no-results', _key: 'no-results' }];
    return [header, ...filteredSent];
  }, [sentLoading, sent, filteredSent]);

  const renderItem = useCallback(({ item }) => {
    if (item._type === 'history-header') {
      return (
        <View style={[s.stickyHeader, { backgroundColor: C.background }]}>
          <View style={s.historyHeader}>
            <Text style={[s.sectionLabel, { color: C.textMuted }]}>SENT HISTORY</Text>
            {sent.length > 0 && (
              <Text style={{ fontSize: 12, fontFamily: Font.regular, color: C.textSubtle }}>
                {filteredSent.length}{sentSearch ? ` of ${sent.length}` : ''}
              </Text>
            )}
          </View>
          {sent.length > 0 && (
            <SearchBar
              value={sentSearch}
              onChangeText={setSentSearch}
              placeholder="Search sent notifications…"
              onClear={() => setSentSearch('')}
              style={s.searchBar}
            />
          )}
        </View>
      );
    }
    if (item._type === 'loading')    return <ActivityIndicator color={C.primary} style={{ marginTop: 20 }} />;
    if (item._type === 'empty')      return (
      <View style={{ alignItems: 'center', paddingVertical: 32 }}>
        <View style={{ width: 60, height: 60, borderRadius: 18, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <BellIcon color={C.primary} size={28} />
        </View>
        <Text style={{ fontSize: 15, fontFamily: Font.semiBold, color: C.text, marginBottom: 4 }}>No notifications sent yet</Text>
        <Text style={{ fontSize: 13, fontFamily: Font.regular, color: C.textMuted, textAlign: 'center' }}>
          Notifications you send will appear here.
        </Text>
      </View>
    );
    if (item._type === 'no-results') return (
      <View style={{ alignItems: 'center', paddingVertical: 32 }}>
        <Text style={{ fontSize: 15, fontFamily: Font.semiBold, color: C.textMuted }}>
          No results for "{sentSearch}"
        </Text>
      </View>
    );
    return <SentRow item={item} C={C} />;
  }, [C, s, sent, filteredSent, sentSearch, setSentSearch]);

  const ComposeCard = useMemo(() => (
    <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
      {/* Section header row */}
      <View style={s.cardHeader}>
        <Text style={[s.cardLabel, { color: C.textMuted }]}>COMPOSE NOTIFICATION</Text>
        {/* Compact "Send To" chips inline */}
        <View style={s.targetRow}>
          <TouchableOpacity
            style={[s.targetChip, { backgroundColor: targetType === 'all' ? C.primary : C.background, borderColor: targetType === 'all' ? C.primary : C.border }]}
            onPress={() => { setTargetType('all'); setSelectedIds([]); }}
            activeOpacity={0.8}
          >
            <Text style={[s.targetChipLabel, { color: targetType === 'all' ? '#fff' : C.textMuted }]}>All</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.targetChip, { backgroundColor: isSpecific ? C.primary : C.background, borderColor: isSpecific ? C.primary : C.border }]}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={[s.targetChipLabel, { color: isSpecific ? '#fff' : C.textMuted }]} numberOfLines={1}>
              {isSpecific ? summary.label : 'Specific'}
            </Text>
            <ChevronIcon color={isSpecific ? 'rgba(255,255,255,0.75)' : C.textSubtle} size={10} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Recipient count row */}
      {recipientCount !== null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, marginTop: -4 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.cashIn }} />
          <Text style={{ fontSize: 12, fontFamily: Font.semiBold, color: C.cashIn }}>
            {recipientCount} recipient{recipientCount !== 1 ? 's' : ''}
          </Text>
          {targetType === 'new_users' && (
            <Text style={{ fontSize: 11, fontFamily: Font.regular, color: C.textMuted }}>
              (last {daysThreshold} days)
            </Text>
          )}
        </View>
      )}

      <AppInput
        label="TITLE"
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. System Update"
        style={s.appInput}
      />

      <AppInput
        label="MESSAGE"
        value={body}
        onChangeText={setBody}
        placeholder="Write your notification message here…"
        multiline
        isLast
        style={s.appInput}
      />
      <Text style={{ fontSize: 11, fontFamily: Font.regular, color: C.textSubtle, textAlign: 'right', marginTop: 2, marginBottom: 4 }}>
        {body.length}/500
      </Text>

      <TouchableOpacity
        style={[s.sendBtn, { backgroundColor: canSend ? C.primary : C.border }]}
        onPress={handleSend}
        disabled={!canSend || send.isPending}
        activeOpacity={0.8}
      >
        {send.isPending ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <SendIcon color="#fff" size={16} />
            <Text style={{ fontSize: 15, fontFamily: Font.bold, color: '#fff' }}>Send Notification</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  ), [C, s, targetType, isSpecific, summary, title, body, canSend, send.isPending, recipientCount, daysThreshold]);

  return (
    <SafeAreaView applyTop={false} style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? C.background : C.primary} />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Send Notification</Text>
      </View>

      <FlatList
        data={listData}
        keyExtractor={(item) => item._key ?? item.id}
        renderItem={renderItem}
        ListHeaderComponent={ComposeCard}
        stickyHeaderIndices={[1]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
      />

      <SpecificModal
        visible={modalVisible}
        users={activeUsers}
        initialFilter={modalInitialFilter}
        initialDays={daysThreshold}
        initialIds={selectedIds}
        onApply={handleApply}
        onClose={() => setModalVisible(false)}
        C={C}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeStyles = (C) => StyleSheet.create({
  safe:        { flex: 1, backgroundColor: C.background },
  header:      { backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { fontSize: 17, fontFamily: Font.bold, color: '#fff' },
  scroll:      { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },

  card:       { borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 24 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardLabel:  { fontSize: 10, fontFamily: Font.semiBold, letterSpacing: 0.8 },

  targetRow:      { flexDirection: 'row', gap: 6 },
  targetChip:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1.5 },
  targetChipLabel:{ fontSize: 12, fontFamily: Font.semiBold, maxWidth: 90 },

  appInput: { marginTop: 10 },
  sendBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, borderRadius: 14, marginTop: 12 },

  stickyHeader:  { paddingTop: 8, paddingBottom: 4 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sectionLabel:  { fontSize: 11, fontFamily: Font.semiBold, letterSpacing: 1, marginLeft: 2 },
  searchBar:     { marginBottom: 8 },
});
