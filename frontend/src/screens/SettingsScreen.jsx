import { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  StatusBar, ScrollView, useWindowDimensions,
} from 'react-native';
import { useReceivedInvitations } from '../hooks/useSharing';
import { useRealtimeInvitations } from '../hooks/useRealtimeSync';
import { Image as ExpoImage } from 'expo-image';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import { useRouter, useSegments } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useProfile } from '../hooks/useProfile';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { Font } from '../constants/fonts';
import { getCurrency } from '../constants/currencies';
import AdminPillBadge from '../components/ui/AdminPillBadge';
import CrownBadge, { CROWN_COLORS } from '../components/ui/CrownBadge';
import LogoutSheet from '../components/ui/LogoutSheet';
import { canAccess } from '../lib/canAccess';

// ── Icons ─────────────────────────────────────────────────────────────────────

const BookIcon = ({ color, size = 20 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.72, height: size * 0.88, borderRadius: 2, borderWidth: 1.5, borderColor: color, justifyContent: 'center', alignItems: 'center', gap: 3 }}>
      {[0, 1, 2].map(i => (
        <View key={i} style={{ width: size * 0.4, height: 1.5, backgroundColor: color, borderRadius: 1 }} />
      ))}
    </View>
  </View>
);

const HelpIcon = ({ color, size = 20 }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ fontSize: size * 0.55, color, fontWeight: '700', lineHeight: size * 0.65 }}>?</Text>
  </View>
);

const GearIcon = ({ color, size = 20 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.45, height: size * 0.45, borderRadius: size * 0.225, borderWidth: 2, borderColor: color }} />
    <View style={{ position: 'absolute', width: size * 0.8, height: 2.5, backgroundColor: color, borderRadius: 1 }} />
    <View style={{ position: 'absolute', width: size * 0.8, height: 2.5, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '60deg' }] }} />
    <View style={{ position: 'absolute', width: size * 0.8, height: 2.5, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '120deg' }] }} />
  </View>
);

const BackIcon = ({ color }) => (
  <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 9, height: 9, borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderColor: color, transform: [{ rotate: '45deg' }] }} />
  </View>
);

const ChevronRight = ({ color }) => (
  <View style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 7, height: 7, borderRightWidth: 2, borderTopWidth: 2, borderColor: color, transform: [{ rotate: '45deg' }] }} />
  </View>
);

const UserIcon = ({ color, size = 14 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.5, height: size * 0.5, borderRadius: size * 0.25, borderWidth: 1.5, borderColor: color }} />
    <View style={{ width: size * 0.75, height: size * 0.35, borderTopLeftRadius: size * 0.375, borderTopRightRadius: size * 0.375, borderWidth: 1.5, borderColor: color, borderBottomWidth: 0, marginTop: 2 }} />
  </View>
);


const CurrencyIcon = ({ color, size = 14 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.72, height: size * 0.72, borderRadius: size * 0.36, borderWidth: 1.5, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 1.5, height: size * 0.38, backgroundColor: color }} />
    </View>
  </View>
);

const BellIcon = ({ color, size = 14 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.65, height: size * 0.58, borderTopLeftRadius: size * 0.325, borderTopRightRadius: size * 0.325, borderWidth: 1.5, borderColor: color, borderBottomWidth: 0, marginTop: 2 }} />
    <View style={{ width: size * 0.78, height: size * 0.15, borderWidth: 1.5, borderColor: color, marginTop: -1 }} />
    <View style={{ width: size * 0.3, height: size * 0.15, borderBottomLeftRadius: size * 0.15, borderBottomRightRadius: size * 0.15, borderWidth: 1.5, borderColor: color, borderTopWidth: 0, marginTop: 0 }} />
  </View>
);

const ShieldIcon = ({ color, size = 14 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.72, height: size * 0.78, borderTopLeftRadius: size * 0.2, borderTopRightRadius: size * 0.2, borderBottomLeftRadius: size * 0.36, borderBottomRightRadius: size * 0.36, borderWidth: 1.5, borderColor: color }} />
  </View>
);

const CloudIcon = ({ color, size = 14 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.78, height: size * 0.45, borderRadius: size * 0.225, borderWidth: 1.5, borderColor: color, marginTop: 2 }} />
    <View style={{ position: 'absolute', left: size * 0.18, bottom: size * 0.22, width: size * 0.62, height: size * 0.28, borderBottomLeftRadius: size * 0.14, borderBottomRightRadius: size * 0.14, borderWidth: 1.5, borderColor: color, borderTopWidth: 0 }} />
  </View>
);

const GlobeIcon = ({ color, size = 14 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.78, height: size * 0.78, borderRadius: size * 0.39, borderWidth: 1.5, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.78, height: 1.5, backgroundColor: color }} />
      <View style={{ position: 'absolute', width: 1.5, height: size * 0.78, backgroundColor: color }} />
    </View>
  </View>
);

const QuestionIcon = ({ color, size = 14 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.78, height: size * 0.78, borderRadius: size * 0.39, borderWidth: 1.5, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.48, color, fontFamily: Font.bold, lineHeight: size * 0.6 }}>?</Text>
    </View>
  </View>
);

const StarIcon = ({ color, size = 14 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ fontSize: size * 0.9, color, lineHeight: size }}>★</Text>
  </View>
);

const ShareIcon = ({ color, size = 14 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.35, height: size * 0.35, borderRadius: size * 0.175, borderWidth: 1.5, borderColor: color, position: 'absolute', top: 0, alignSelf: 'center' }} />
    <View style={{ width: size * 0.35, height: size * 0.35, borderRadius: size * 0.175, borderWidth: 1.5, borderColor: color, position: 'absolute', bottom: 0, left: 0 }} />
    <View style={{ width: size * 0.35, height: size * 0.35, borderRadius: size * 0.175, borderWidth: 1.5, borderColor: color, position: 'absolute', bottom: 0, right: 0 }} />
    <View style={{ width: size * 0.48, height: 1.5, backgroundColor: color, position: 'absolute', top: size * 0.22, left: size * 0.08, transform: [{ rotate: '30deg' }] }} />
    <View style={{ width: size * 0.48, height: 1.5, backgroundColor: color, position: 'absolute', top: size * 0.22, right: size * 0.08, transform: [{ rotate: '-30deg' }] }} />
  </View>
);

const DiamondIcon = ({ color, size = 14 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{
      width: size * 0.65, height: size * 0.65,
      borderWidth: 1.5, borderColor: color,
      transform: [{ rotate: '45deg' }],
      borderRadius: 2,
    }} />
  </View>
);

const LogoutIcon = ({ color, size = 14 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.55, height: size * 0.72, borderWidth: 1.5, borderColor: color, borderRightWidth: 0 }} />
    <View style={{ position: 'absolute', right: 0, width: size * 0.55, height: 1.5, backgroundColor: color }} />
    <View style={{ position: 'absolute', right: size * 0.06, top: size * 0.2, width: size * 0.22, height: size * 0.22, borderTopWidth: 1.5, borderRightWidth: 1.5, borderColor: color, transform: [{ rotate: '45deg' }] }} />
  </View>
);

// ── Section data ──────────────────────────────────────────────────────────────

const SUPPORT_SECTION = {
  title: 'Support',
  items: [
    { Icon: QuestionIcon, label: 'Help & FAQ',  sub: null, route: null, accent: 'primary' },
    { Icon: StarIcon,     label: 'Rate the App', sub: null, route: null, accent: 'primary' },
    { Icon: ShareIcon,    label: 'Share App',   sub: null, route: null, accent: 'primary' },
  ],
};

// ── Setting Row ───────────────────────────────────────────────────────────────

function SettingRow({ Icon, label, sub, route, isLast, onPress, badgeCount, crown, iconAccent, C }) {
  const frozen    = !route && !crown;
  const iconBg    = frozen ? C.border : (iconAccent ? iconAccent + '1A' : C.primaryLight);
  const iconColor = frozen ? C.textMuted : (iconAccent ?? C.primary);
  return (
    <>
      <TouchableOpacity
        style={rowStyles.row}
        onPress={onPress}
        activeOpacity={route || crown ? 0.7 : 1}
      >
        <View style={[rowStyles.iconBox, { backgroundColor: iconBg }]}>
          <Icon color={iconColor} size={15} />
        </View>
        <View style={rowStyles.body}>
          <Text style={[rowStyles.label, { color: frozen ? C.textMuted : C.text, fontFamily: Font.semiBold }]}>{label}</Text>
          {sub ? <Text style={[rowStyles.sub, { color: C.textMuted, fontFamily: Font.regular }]}>{sub}</Text> : null}
        </View>
        {badgeCount > 0 && (
          <View style={[rowStyles.badge, { backgroundColor: C.danger }]}>
            <Text style={[rowStyles.badgeText, { fontFamily: Font.bold }]}>{badgeCount}</Text>
          </View>
        )}
        {crown && <View style={{ marginRight: 6 }}><CrownBadge tier={crown} size={11} /></View>}
        {(route || crown) && <ChevronRight color={C.textSubtle} />}
      </TouchableOpacity>
      {!isLast && <View style={[rowStyles.divider, { backgroundColor: C.border }]} />}
    </>
  );
}

const rowStyles = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14 },
  iconBox: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  body:    { flex: 1 },
  label:     { fontSize: 14, lineHeight: 20 },
  sub:       { fontSize: 12, lineHeight: 17, marginTop: 1 },
  divider:   { height: 1, marginHorizontal: 18 },
  badge:     { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  badgeText: { fontSize: 10, color: '#fff', lineHeight: 14 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function SettingsScreen({ applyTop = true, showBottomNav = false, profileRoute = '/(app)/settings/profile' }) {
  const router    = useRouter();
  const segments  = useSegments();
  const { C, isDark }     = useTheme();
  // Tab-root screens have no back stack — hide the back button so it doesn't
  // mislead admins on the dashboard/settings tab into a wrong fallback route.
  const isTabRoot = segments[1] === 'dashboard' && segments.length <= 3;
  const clearUser = useAuthStore((s) => s.clearUser);
  const user      = useAuthStore((s) => s.user);
  useRealtimeInvitations(user?.id);
  const { width } = useWindowDimensions();
  const hPad      = width > 600 ? Math.floor((width - 540) / 2) : 16;

  const { data: profile } = useProfile();
  const isSuperAdmin = profile?.role === 'superadmin';
  const { data: receivedInvitations = [] } = useReceivedInvitations();
  const pendingInviteCount = useMemo(
    () => receivedInvitations.filter(i => i.status === 'pending').length,
    [receivedInvitations],
  );

  const initials = (profile?.full_name ?? '?')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const currencyCode  = profile?.currency ?? 'PKR';
  const currencyEntry = getCurrency(currencyCode);
  const currencySub   = `${currencyEntry.code} – ${currencyEntry.name}`;

  const tier        = user?.subscription_tier ?? 'free';
  const tierLabel   = tier === 'business' ? 'Business' : tier === 'pro' ? 'Pro' : 'Free';
  const tierColor   = tier === 'business' ? CROWN_COLORS.business : tier === 'pro' ? CROWN_COLORS.pro : C.primary;

  const hasSharing  = canAccess(user, 'book_sharing');
  const hasCloud    = canAccess(user, 'cloud_sync');

  const SECTIONS = useMemo(() => [
    {
      title: 'Account',
      items: [
        { Icon: UserIcon,     label: 'Profile',  sub: null,        route: profileRoute,               accent: null },
        { Icon: CurrencyIcon, label: 'Currency', sub: currencySub, route: '/(app)/settings/currency', accent: null },
      ],
    },
    {
      title: 'Subscription',
      items: [
        {
          Icon:        DiamondIcon,
          label:       'Subscription & Plans',
          sub:         `Current plan: ${tierLabel}`,
          route:       '/(app)/settings/subscription',
          accent:      tierColor,
          crown:       null,
        },
      ],
    },
    {
      title: 'App',
      items: [
        { Icon: ShareIcon,  label: 'Manage Access',      sub: 'Invitations & shared books', route: '/(app)/settings/manage-access', accent: null, badge: pendingInviteCount, crown: hasSharing ? null : 'pro' },
        { Icon: BellIcon,   label: 'Notifications',      sub: 'Manage alerts',              route: '/(app)/settings/notifications', accent: null },
        { Icon: ShieldIcon, label: 'Privacy & Security', sub: 'Privacy policy',              route: '/(app)/settings/privacy-policy', accent: null },
        { Icon: CloudIcon,  label: 'Backup & Sync',      sub: hasCloud ? 'Cloud sync active' : 'Requires Pro or Business', route: hasCloud ? '/(app)/settings/backup-sync' : '/(app)/settings/subscription', accent: null, crown: hasCloud ? null : 'pro' },
        { Icon: GlobeIcon,  label: 'Language',           sub: 'English',                    route: null, accent: null },
      ],
    },
    SUPPORT_SECTION,
  ], [currencySub, pendingInviteCount, profileRoute, tierLabel, tierColor, hasSharing, hasCloud]);

  const [logoutVisible, setLogoutVisible] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const handleLogout = () => setLogoutVisible(true);

  const confirmLogout = async () => {
    setLogoutLoading(true);
    if (supabase) await supabase.auth.signOut();
    setLogoutLoading(false);
    setLogoutVisible(false);
    clearUser(); // AuthGuard in _layout.jsx handles the redirect
  };

  const s = useMemo(() => makeStyles(C, hPad, showBottomNav), [C, hPad, showBottomNav]);

  return (
    <SafeAreaView applyTop={applyTop} style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? C.background : C.primary} />

      {/* Header */}
      <View style={s.header}>
        {(showBottomNav || isTabRoot) ? (
          <View style={{ width: 40, height: 40 }} />
        ) : (
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/books')}
            style={s.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <BackIcon color="#fff" />
          </TouchableOpacity>
        )}
        <Text style={s.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>

        {/* Avatar Card */}
        <View style={[s.avatarCard, { backgroundColor: C.card, borderColor: C.border }]}>
          {profile?.avatar_url ? (
            <View style={[s.avatar, { borderColor: C.card }]}>
              <ExpoImage source={{ uri: profile.avatar_url }} style={{ width: '100%', height: '100%', borderRadius: 36 }} contentFit="cover" />
            </View>
          ) : (
            <View style={[s.avatar, { backgroundColor: C.primary, borderColor: C.card }]}>
              <Text style={s.avatarInitials}>{initials}</Text>
            </View>
          )}
          <Text style={[s.avatarName,  { color: C.text,      fontFamily: Font.bold }]}>
            {profile?.full_name ?? '—'}
          </Text>
          <Text style={[s.avatarEmail, { color: C.textMuted, fontFamily: Font.regular }]}>
            {profile?.email ?? '—'}
          </Text>
          {isSuperAdmin && (
            <View style={{ marginTop: 4 }}>
              <AdminPillBadge />
            </View>
          )}
          {/* Subscription tier badge */}
          <TouchableOpacity
            onPress={() => router.push('/(app)/settings/subscription')}
            activeOpacity={0.8}
            style={[s.tierChip, { backgroundColor: tierColor + '1A', borderColor: tierColor + '44' }]}
          >
            {(tier === 'pro' || tier === 'business') && <Text style={{ fontSize: 12, marginRight: 3 }}>👑</Text>}
            <Text style={[s.tierChipText, { color: tierColor, fontFamily: Font.bold }]}>
              {tierLabel} Plan
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.editBtn, { backgroundColor: C.primaryLight, borderColor: C.primary }]}
            onPress={() => router.push(profileRoute)}
            activeOpacity={0.8}
          >
            <Text style={[s.editBtnText, { color: C.primary, fontFamily: Font.semiBold }]}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Sections */}
        {SECTIONS.map((section) => (
          <View key={section.title} style={s.sectionWrap}>
            <Text style={[s.sectionLabel, { color: C.textMuted, fontFamily: Font.semiBold }]}>
              {section.title.toUpperCase()}
            </Text>
            <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
              {section.items.map((item, idx) => (
                <SettingRow
                  key={item.label}
                  Icon={item.Icon}
                  label={item.label}
                  sub={item.sub}
                  route={item.route}
                  isLast={idx === section.items.length - 1}
                  onPress={() => item.route && router.push(item.route)}
                  badgeCount={item.badge ?? 0}
                  crown={item.crown ?? null}
                  iconAccent={item.accent}
                  C={C}
                />
              ))}
            </View>
          </View>
        ))}

        {/* Logout */}
        <View style={s.sectionWrap}>
          <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
            <TouchableOpacity style={rowStyles.row} onPress={handleLogout} activeOpacity={0.7}>
              <View style={[rowStyles.iconBox, { backgroundColor: C.dangerLight }]}>
                <LogoutIcon color={C.danger} size={15} />
              </View>
              <View style={rowStyles.body}>
                <Text style={[rowStyles.label, { color: C.danger, fontFamily: Font.semiBold }]}>Logout</Text>
              </View>
              <ChevronRight color={C.danger} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[s.version, { color: C.textSubtle, fontFamily: Font.regular }]}>Ultimate CashBook v1.0.0</Text>

      </ScrollView>

      <LogoutSheet
        visible={logoutVisible}
        onDismiss={() => setLogoutVisible(false)}
        onConfirm={confirmLogout}
        isLoading={logoutLoading}
        C={C}
        Font={Font}
      />

      {/* ── Bottom nav (regular user only) ──────────────────────────────── */}
      {showBottomNav && (
        <View style={s.bottomNav}>
          {[
            { label: 'My Books', Icon: BookIcon, active: false, onPress: () => router.replace('/(app)/books') },
            { label: 'Help',     Icon: HelpIcon, active: false, onPress: () => {} },
            { label: 'Settings', Icon: GearIcon, active: true,  onPress: () => {} },
          ].map(tab => (
            <TouchableOpacity key={tab.label} style={s.navItem} onPress={tab.onPress}>
              <tab.Icon color={tab.active ? C.primary : C.textMuted} size={22} />
              <Text style={tab.active ? s.navLabelActive : s.navLabel}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeStyles = (C, hPad, showBottomNav) => StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.background },
  scroll:        { flex: 1 },
  scrollContent: { paddingBottom: showBottomNav ? 100 : 48, paddingHorizontal: hPad - 16 },

  header: {
    backgroundColor: C.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: hPad, paddingVertical: 14,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: Font.bold, color: '#fff' },

  avatarCard: {
    alignItems: 'center', marginHorizontal: 16, borderRadius: 20,
    paddingVertical: 24, marginTop: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 6,
    borderWidth: 1,
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, marginBottom: 12,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  avatarInitials: { fontSize: 28, fontFamily: Font.extraBold, color: '#fff' },
  avatarName:  { fontSize: 18, marginBottom: 3 },
  avatarEmail: { fontSize: 13, marginBottom: 6 },

  tierChip: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 4,
    marginTop: 8, marginBottom: 6,
  },
  tierChipText: { fontSize: 12 },

  editBtn: {
    paddingHorizontal: 22, paddingVertical: 9, borderRadius: 20, borderWidth: 1,
  },
  editBtnText: { fontSize: 13 },

  sectionWrap:  { marginHorizontal: 16, marginTop: 24 },
  sectionLabel: {
    fontSize: 11, letterSpacing: 1,
    marginBottom: 8, marginLeft: 2,
  },
  card: { borderRadius: 16, overflow: 'hidden', borderWidth: 1 },

  version: { textAlign: 'center', fontSize: 12, marginTop: 28, marginBottom: 8 },

  bottomNav:      { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 40, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, paddingBottom: 16, zIndex: 10, elevation: 10 },
  navItem:        { alignItems: 'center', gap: 4, minWidth: 56, minHeight: 44, justifyContent: 'center' },
  navLabel:       { fontSize: 11, fontFamily: Font.medium, color: C.textMuted, lineHeight: 16 },
  navLabelActive: { fontSize: 11, fontFamily: Font.bold,   color: C.primary,   lineHeight: 16 },
});
