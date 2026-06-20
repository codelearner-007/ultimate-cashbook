import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  StatusBar, ScrollView, Switch, ActivityIndicator, Alert, Keyboard,
} from 'react-native';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import SearchBar from '../components/ui/SearchBar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useAddCollaborator, useGivenInvitations } from '../hooks/useSharing';
import { apiSearchUsers } from '../lib/api';
import { useQuery } from '@tanstack/react-query';
import { shadow } from '../constants/shadows';
import SuccessDialog from '../components/ui/SuccessDialog';
import LimitReachedSheet from '../components/ui/LimitReachedSheet';
import { RIGHTS, SCREENS, DEFAULT_SCREENS, getInitials } from '../constants/sharing';
import { useAuthStore } from '../store/authStore';
import { canAccess, getLimit } from '../lib/canAccess';

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AddCollaboratorScreen() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams();
  const { C, Font, isDark } = useTheme();

  const authUser = useAuthStore(s => s.user);
  const canShare = canAccess(authUser, 'book_sharing');
  const shareLimit = getLimit(authUser, 'guest_access'); // Infinity for superadmin / business

  // Only free-tier guests count against the quota; subscribed guests are unlimited.
  const { data: givenInvitations = [] } = useGivenInvitations();
  const freeGuestCount = givenInvitations.filter(
    i => (i.status === 'accepted' || i.status === 'pending') &&
         (!i.collaborator?.subscription_tier || i.collaborator.subscription_tier === 'free')
  ).length;
  const atShareLimit = isFinite(shareLimit) && freeGuestCount >= shareLimit;

  const [searchInput,   setSearchInput]   = useState('');
  const [selectedUser,  setSelectedUser]  = useState(null);
  const [rights,        setRights]        = useState('view');
  const [showSuccess,   setShowSuccess]   = useState(false);
  const [successMsg,    setSuccessMsg]    = useState('');
  const [screens,       setScreens]       = useState({ ...DEFAULT_SCREENS });
  const [showLimitSheet, setShowLimitSheet] = useState(false);

  const addCollaborator = useAddCollaborator(id);

  // Debounced search
  const [debouncedQ, setDebouncedQ] = useState('');
  const debounceRef = useRef(null);

  const handleSearchChange = (text) => {
    setSearchInput(text);
    setSelectedUser(null);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(text.trim()), 400);
  };

  const { data: rawSearchResults = [], isFetching: isSearching } = useQuery({
    queryKey: ['user-search', debouncedQ],
    queryFn:  () => apiSearchUsers(debouncedQ),
    enabled:  debouncedQ.length >= 2,
    staleTime: 30000,
  });

  // Only show a result when the typed text exactly matches the user's email (case-insensitive)
  const searchResults = rawSearchResults.filter(
    u => u.email?.toLowerCase() === debouncedQ.trim().toLowerCase()
  );

  const toggleScreen = useCallback((key) => {
    if (key === 'entries' || key === 'settings') return; // always on
    setScreens(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleAdd = useCallback(() => {
    if (!selectedUser) return;
    // Client-side limit guard (backend also enforces this)
    if (atShareLimit) {
      setShowLimitSheet(true);
      return;
    }
    addCollaborator.mutate(
      {
        email:   selectedUser.email,
        rights,
        screens: { ...screens, entries: true },
      },
      {
        onSuccess: () => {
          setSuccessMsg(`Invitation sent to ${selectedUser.full_name || selectedUser.email}. They will need to accept before accessing "${name}".`);
          setShowSuccess(true);
        },
        onError: (err) => {
          const detail = err?.response?.data?.detail ?? 'Something went wrong. Please try again.';
          if (typeof detail === 'string' && detail.startsWith('SHARE_LIMIT_REACHED:')) {
            setShowLimitSheet(true);
            return;
          }
          Alert.alert('Could not add', detail);
        },
      },
    );
  }, [selectedUser, rights, screens, addCollaborator, name, atShareLimit]);

  const canSubmit = !!selectedUser && !addCollaborator.isPending && !atShareLimit;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: C.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? C.background : C.primary} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: C.primary }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="chevron-left" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { fontFamily: Font.bold }]}>Add Collaborator</Text>
          <Text style={[styles.headerSub, { fontFamily: Font.regular }]} numberOfLines={1}>
            {name}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Upgrade gate (free tier) ─────────────────────────────────────── */}
      {!canShare && (
        <View style={styles.gate}>
          <View style={[styles.gateBox, { backgroundColor: '#F59E0B1A' }]}>
            <Text style={{ fontSize: 42 }}>👑</Text>
          </View>
          <Text style={[styles.gateTitle, { color: C.text, fontFamily: Font.bold }]}>
            Pro Feature
          </Text>
          <Text style={[styles.gateSub, { color: C.textMuted, fontFamily: Font.regular }]}>
            Book sharing requires a Pro or Business plan. Invite collaborators and set granular access levels for each book.
          </Text>
          <TouchableOpacity
            style={[styles.gateBtn, { backgroundColor: '#F59E0B' }]}
            onPress={() => router.push('/(app)/settings/subscription')}
            activeOpacity={0.85}
          >
            <Text style={{ fontSize: 16, marginRight: 8 }}>👑</Text>
            <Text style={[styles.gateBtnText, { fontFamily: Font.bold }]}>Upgrade to Pro</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={!canShare ? { display: 'none' } : undefined}
      >

        {/* ── Share quota indicator ─────────────────────────────────────── */}
        {isFinite(shareLimit) && (
          <View style={[
            styles.quotaBar,
            atShareLimit
              ? { backgroundColor: C.dangerLight, borderColor: C.danger + '55' }
              : { backgroundColor: C.primaryLight, borderColor: C.primaryMid },
          ]}>
            <Feather
              name={atShareLimit ? 'alert-circle' : 'users'}
              size={14}
              color={atShareLimit ? C.danger : C.primary}
            />
            <Text style={[
              styles.quotaText,
              { color: atShareLimit ? C.danger : C.primary, fontFamily: Font.medium },
            ]}>
              {atShareLimit
                ? `Guest limit reached (${activeShareCount}/${shareLimit}) — upgrade to add more`
                : `${activeShareCount}/${shareLimit} guests used on your plan`
              }
            </Text>
          </View>
        )}

        {/* ── Step 1: Search ─────────────────────────────────────────────── */}
        <Text style={[styles.stepLabel, { color: C.textMuted, fontFamily: Font.semiBold }]}>
          FIND PERSON
        </Text>

        <SearchBar
          placeholder="Search by name or email…"
          value={searchInput}
          onChangeText={handleSearchChange}
          onClear={() => { setSearchInput(''); setDebouncedQ(''); setSelectedUser(null); }}
          style={{ marginHorizontal: 0, marginBottom: 10 }}
        />

        {/* Search results */}
        {debouncedQ.length >= 2 && !isSearching && searchResults.length === 0 && (
          <View style={[styles.noResult, { backgroundColor: C.cardAlt }]}>
            <Feather name="user-x" size={18} color={C.textSubtle} />
            <Text style={[styles.noResultText, { color: C.textMuted, fontFamily: Font.regular }]}>
              No user found with that email
            </Text>
          </View>
        )}

        {searchResults.length > 0 && !selectedUser && (
          <View style={[styles.resultList, { backgroundColor: C.card, borderColor: C.border }]}>
            {searchResults.map((u, idx) => (
              <TouchableOpacity
                key={u.id}
                style={[
                  styles.resultRow,
                  { borderBottomColor: C.border },
                  idx === searchResults.length - 1 && { borderBottomWidth: 0 },
                ]}
                onPress={() => { setSelectedUser(u); setSearchInput(u.email); Keyboard.dismiss(); }}
                activeOpacity={0.75}
              >
                <View style={[styles.resultAvatar, { backgroundColor: C.primaryLight }]}>
                  <Text style={[styles.resultAvatarText, { color: C.primary, fontFamily: Font.bold }]}>
                    {getInitials(u.full_name || u.email)}
                  </Text>
                </View>
                <View style={styles.resultBody}>
                  <Text style={[styles.resultName, { color: C.text, fontFamily: Font.semiBold }]}>
                    {u.full_name || '—'}
                  </Text>
                  <Text style={[styles.resultEmail, { color: C.textMuted, fontFamily: Font.regular }]}>
                    {u.email}
                  </Text>
                </View>
                <Feather name="plus-circle" size={18} color={C.primary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Selected user card */}
        {selectedUser && (
          <View style={[styles.selectedCard, { backgroundColor: C.primaryLight, borderColor: C.primaryMid }]}>
            <View style={[styles.selectedAvatar, { backgroundColor: C.primary }]}>
              <Text style={[styles.selectedAvatarText, { fontFamily: Font.bold }]}>
                {getInitials(selectedUser.full_name || selectedUser.email)}
              </Text>
            </View>
            <View style={styles.selectedBody}>
              <Text style={[styles.selectedName, { color: C.text, fontFamily: Font.bold }]}>
                {selectedUser.full_name || '—'}
              </Text>
              <Text style={[styles.selectedEmail, { color: C.primary, fontFamily: Font.regular }]}>
                {selectedUser.email}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => { setSelectedUser(null); setSearchInput(''); setDebouncedQ(''); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="x-circle" size={20} color={C.primary} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step 2: Sections ──────────────────────────────────────────── */}
        <Text style={[styles.stepLabel, { color: C.textMuted, fontFamily: Font.semiBold, marginTop: 28 }]}>
          SECTIONS TO SHARE
        </Text>

        <View style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}>
          {SCREENS.map((sc, idx) => (
            <View key={sc.key}>
              <TouchableOpacity
                style={styles.screenRow}
                onPress={() => toggleScreen(sc.key)}
                activeOpacity={sc.required ? 1 : 0.75}
              >
                <View style={[
                  styles.screenIcon,
                  { backgroundColor: (sc.required || screens[sc.key]) ? C.primaryLight : C.cardAlt },
                ]}>
                  <Feather
                    name={sc.icon}
                    size={17}
                    color={(sc.required || screens[sc.key]) ? C.primary : C.textSubtle}
                  />
                </View>
                <Text style={[
                  styles.screenLabel,
                  {
                    color: (sc.required || screens[sc.key]) ? C.text : C.textMuted,
                    fontFamily: Font.medium,
                  },
                ]}>
                  {sc.label}
                  {sc.required ? '  ·  Required' : ''}
                </Text>
                <Switch
                  value={sc.required || screens[sc.key]}
                  onValueChange={() => toggleScreen(sc.key)}
                  disabled={sc.required}
                  trackColor={{ false: C.border, true: C.primary }}
                  thumbColor="#fff"
                />
              </TouchableOpacity>
              {idx < SCREENS.length - 1 && (
                <View style={[styles.divider, { backgroundColor: C.border }]} />
              )}
            </View>
          ))}
        </View>

        {/* ── Step 3: Rights ────────────────────────────────────────────── */}
        <Text style={[styles.stepLabel, { color: C.textMuted, fontFamily: Font.semiBold, marginTop: 28 }]}>
          ACCESS LEVEL
        </Text>

        <View style={styles.rightsGroup}>
          {RIGHTS.map((r) => {
            const active    = rights === r.key;
            const bgColor   = active ? (isDark ? r.darkLight : r.light) : C.card;
            const border    = active ? r.color : C.border;
            return (
              <TouchableOpacity
                key={r.key}
                style={[styles.rightsCard, { backgroundColor: bgColor, borderColor: border }]}
                onPress={() => setRights(r.key)}
                activeOpacity={0.8}
              >
                <View style={[styles.rightsIconBox, { backgroundColor: active ? r.color : C.cardAlt }]}>
                  <Feather name={r.icon} size={18} color={active ? '#fff' : C.textSubtle} />
                </View>
                <View style={styles.rightsBody}>
                  <Text style={[
                    styles.rightsTitle,
                    { color: active ? r.color : C.text, fontFamily: active ? Font.bold : Font.semiBold },
                  ]}>
                    {r.title}
                  </Text>
                  <Text style={[styles.rightsDesc, { color: C.textMuted, fontFamily: Font.regular }]}>
                    {r.desc}
                  </Text>
                </View>
                {active && (
                  <View style={[styles.checkCircle, { backgroundColor: r.color }]}>
                    <Feather name="check" size={12} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Add button ────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[
            styles.addBtn,
            { backgroundColor: canSubmit ? C.primary : C.border },
            canSubmit && shadow(C.primary, 2, 8, 0.28),
          ]}
          onPress={handleAdd}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {addCollaborator.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Feather name="user-check" size={18} color="#fff" />
              <Text style={[styles.addBtnText, { fontFamily: Font.extraBold }]}>
                Grant Access
              </Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      <LimitReachedSheet
        visible={showLimitSheet}
        onDismiss={() => setShowLimitSheet(false)}
        limitType="shares"
        currentLimit={shareLimit === Infinity ? 0 : shareLimit}
        currentTier={authUser?.subscription_tier ?? 'free'}
      />

      <SuccessDialog
        visible={showSuccess}
        onDismiss={() => { setShowSuccess(false); router.back(); }}
        title="Invitation Sent!"
        subtitle={successMsg}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:    { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 20 },

  quotaBar:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 18 },
  quotaText:   { fontSize: 13, flex: 1, lineHeight: 19 },

  gate:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  gateBox:     { width: 88, height: 88, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  gateTitle:   { fontSize: 20, lineHeight: 28, marginBottom: 10 },
  gateSub:     { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 28 },
  gateBtn:     { flexDirection: 'row', alignItems: 'center', borderRadius: 32, paddingHorizontal: 28, paddingVertical: 14 },
  gateBtnText: { fontSize: 15, color: '#fff', lineHeight: 22 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 17, color: '#fff', lineHeight: 24 },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 18, marginTop: 1 },

  stepLabel: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, marginLeft: 2 },

  noResult: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  noResultText: { fontSize: 14 },

  resultList: { borderRadius: 14, borderWidth: 1.5, overflow: 'hidden', marginBottom: 10 },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultAvatar:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  resultAvatarText: { fontSize: 14 },
  resultBody:       { flex: 1 },
  resultName:       { fontSize: 14, lineHeight: 20 },
  resultEmail:      { fontSize: 12, lineHeight: 18 },

  selectedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1.5,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 6,
  },
  selectedAvatar:     { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  selectedAvatarText: { fontSize: 15, color: '#fff' },
  selectedBody:       { flex: 1 },
  selectedName:       { fontSize: 15, lineHeight: 22 },
  selectedEmail:      { fontSize: 13, lineHeight: 18 },

  // Sections card
  card:       { borderRadius: 16, borderWidth: 1.5, overflow: 'hidden', marginBottom: 4 },
  screenRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  screenIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  screenLabel:{ flex: 1, fontSize: 14, lineHeight: 20 },
  divider:    { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },

  // Rights cards
  rightsGroup: { gap: 10 },
  rightsCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 16, borderWidth: 1.5,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  rightsIconBox: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rightsBody:    { flex: 1 },
  rightsTitle:   { fontSize: 15, lineHeight: 22, marginBottom: 2 },
  rightsDesc:    { fontSize: 12, lineHeight: 18 },
  checkCircle:   { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

  // Add button
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, borderRadius: 32,
    marginTop: 28, paddingVertical: 17, minHeight: 56,
  },
  addBtnText: { fontSize: 15, color: '#fff', lineHeight: 22 },
});
