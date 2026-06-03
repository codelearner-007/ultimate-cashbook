import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  StatusBar, ActivityIndicator,
} from 'react-native';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useBookShares, useRemoveCollaborator } from '../hooks/useSharing';
import { useRealtimeCollaborators, useRealtimeGivenInvitations } from '../hooks/useRealtimeSync';
import { useAuthStore } from '../store/authStore';
import { useBookBasePath } from '../hooks/useBookBasePath';
import { canAccess, getLimit } from '../lib/canAccess';
import { RIGHTS_MAP, getInitials } from '../constants/sharing';
import EditShareSheet from '../components/sharing/EditShareSheet';
import RemoveAccessSheet from '../components/sharing/RemoveAccessSheet';

// ── Status badge meta ─────────────────────────────────────────────────────────
// 'pending'  → amber "Awaiting" badge
// 'accepted' → no badge (normal active state)
// Rejection deletes the row — no 'rejected' state is stored.

const STATUS_META = {
  pending: { icon: 'clock', label: 'Awaiting', color: '#D97706', light: '#FEF3C7', darkLight: '#2D1A00' },
};

// ── CollaboratorRow ───────────────────────────────────────────────────────────

const CollaboratorRow = ({ item, onEdit, onRemove, C, Font, isDark }) => {
  const meta     = RIGHTS_MAP[item.rights] ?? RIGHTS_MAP.view;
  const initials = getInitials(item.shared_with?.full_name || item.shared_with?.email || '');
  const badgeBg  = isDark ? meta.darkLight : meta.light;
  const statusMeta = STATUS_META[item.status];  // defined for 'pending'; undefined for 'accepted'
  const isActive   = item.status === 'accepted';

  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: C.border, opacity: isActive ? 1 : 0.75 }]}
      onPress={() => isActive && onEdit(item)}
      activeOpacity={0.75}
    >
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: C.primaryLight }]}>
        <Text style={[styles.avatarText, { color: C.primary, fontFamily: Font.bold }]}>
          {initials}
        </Text>
      </View>

      {/* Info */}
      <View style={styles.rowBody}>
        <Text style={[styles.rowName, { color: C.text, fontFamily: Font.semiBold }]} numberOfLines={1}>
          {item.shared_with?.full_name || 'Unknown'}
        </Text>
        <Text style={[styles.rowEmail, { color: C.textMuted, fontFamily: Font.regular }]} numberOfLines={1}>
          {item.shared_with?.email}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
          <View style={[styles.rightsBadge, { backgroundColor: badgeBg }]}>
            <Feather name={meta.icon} size={11} color={meta.color} />
            <Text style={[styles.rightsText, { color: meta.color, fontFamily: Font.semiBold }]}>
              {meta.title}
            </Text>
          </View>
          {statusMeta && (
            <View style={[styles.rightsBadge, { backgroundColor: isDark ? statusMeta.darkLight : statusMeta.light }]}>
              <Feather name={statusMeta.icon} size={11} color={statusMeta.color} />
              <Text style={[styles.rightsText, { color: statusMeta.color, fontFamily: Font.semiBold }]}>
                {statusMeta.label}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        {isActive && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: C.primaryLight }]}
            onPress={() => onEdit(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.75}
          >
            <Feather name="edit-2" size={14} color={C.primary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: C.dangerLight }]}
          onPress={() => onRemove(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.75}
        >
          <Feather name="user-x" size={14} color={C.danger} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ManageSharesScreen() {
  const router   = useRouter();
  const basePath = useBookBasePath();
  const { id, name } = useLocalSearchParams();
  const { C, Font, isDark } = useTheme();

  const user       = useAuthStore((s) => s.user);
  const canShare   = canAccess(user, 'book_sharing');
  const guestLimit = getLimit(user, 'guest_access');   // 0 | 1 | 10

  const { data: shares = [], isLoading } = useBookShares(id);
  const removeCollaborator = useRemoveCollaborator(id);
  useRealtimeCollaborators(id);
  useRealtimeGivenInvitations(user?.id);

  // Count active + pending (rejected rows are deleted from DB)
  const activeGuestCount = shares.length;
  const isAtGuestLimit   = guestLimit !== Infinity && activeGuestCount >= guestLimit;

  const [editShare, setEditShare]     = useState(null);
  const [removeShare, setRemoveShare] = useState(null);

  const handleEdit = useCallback((share) => {
    setEditShare(share);
  }, []);

  const handleRemove = useCallback((share) => {
    setRemoveShare(share);
  }, []);

  const handleConfirmRemove = useCallback(() => {
    if (!removeShare) return;
    removeCollaborator.mutate(removeShare.id, {
      onSuccess: () => setRemoveShare(null),
      onError:   () => setRemoveShare(null),
    });
  }, [removeShare, removeCollaborator]);

  const openAdd = useCallback(() => {
    if (!canShare) { router.push('/(app)/settings/subscription'); return; }
    if (isAtGuestLimit) {
      const tier = user?.subscription_tier ?? 'free';
      const upgradeMsg = tier === 'pro'
        ? 'Pro plan allows 1 guest. Upgrade to Business for up to 10 guests.'
        : 'You have reached the maximum of 10 guests.';
      Alert.alert('Guest limit reached', upgradeMsg,
        tier === 'pro'
          ? [{ text: 'Cancel', style: 'cancel' }, { text: 'Upgrade', onPress: () => router.push('/(app)/settings/subscription') }]
          : [{ text: 'OK' }],
      );
      return;
    }
    router.push({ pathname: `${basePath}/[id]/add-collaborator`, params: { id, name } });
  }, [router, basePath, id, name, canShare, isAtGuestLimit, user]);

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
          <Text style={[styles.headerTitle, { fontFamily: Font.bold }]}>Manage Access</Text>
          <Text style={[styles.headerSub, { fontFamily: Font.regular }]} numberOfLines={1}>
            {name}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, {
            backgroundColor: (!canShare || isAtGuestLimit)
              ? 'rgba(245,158,11,0.28)'
              : 'rgba(255,255,255,0.22)',
          }]}
          onPress={openAdd}
          activeOpacity={0.8}
        >
          {(!canShare || isAtGuestLimit)
            ? <Text style={{ fontSize: 16, lineHeight: 20 }}>👑</Text>
            : <Feather name="user-plus" size={18} color="#fff" />
          }
        </TouchableOpacity>
      </View>

      {/* ── Upgrade gate (free tier) ─────────────────────────────────────── */}
      {!canShare ? (
        <View style={styles.empty}>
          <View style={[styles.emptyBox, { backgroundColor: '#F59E0B1A' }]}>
            <Text style={{ fontSize: 38 }}>👑</Text>
          </View>
          <Text style={[styles.emptyTitle, { color: C.text, fontFamily: Font.bold }]}>
            Pro Feature
          </Text>
          <Text style={[styles.emptySub, { color: C.textMuted, fontFamily: Font.regular }]}>
            Book sharing requires a Pro or Business plan. Collaborate with others and grant custom access to your cashbooks.
          </Text>
          <TouchableOpacity
            style={[styles.emptyAddBtn, { backgroundColor: '#F59E0B' }]}
            onPress={() => router.push('/(app)/settings/subscription')}
            activeOpacity={0.85}
          >
            <Text style={{ fontSize: 16, marginRight: 6 }}>👑</Text>
            <Text style={[styles.emptyAddBtnText, { fontFamily: Font.bold }]}>
              Upgrade to Pro
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Info banner */}
          <View style={[styles.banner, { backgroundColor: C.primaryLight, borderColor: C.primaryMid }]}>
            <Feather name="info" size={14} color={C.primary} />
            <Text style={[styles.bannerText, { color: C.primary, fontFamily: Font.regular }]}>
              Tap any row to edit their access, or use the buttons to edit or remove.
            </Text>
          </View>

          {/* Guest limit banner (Pro at limit) */}
          {isAtGuestLimit && (user?.subscription_tier ?? 'free') === 'pro' && (
            <View style={[styles.banner, { backgroundColor: '#FEF3C7', borderColor: '#D97706', marginTop: 0 }]}>
              <Text style={{ fontSize: 13, marginRight: 6 }}>👑</Text>
              <Text style={[styles.bannerText, { color: '#B45309', fontFamily: Font.regular, flex: 1 }]}>
                Pro plan: 1 guest limit reached.{' '}
              </Text>
              <TouchableOpacity onPress={() => router.push('/(app)/settings/subscription')} activeOpacity={0.8}>
                <Text style={[styles.bannerText, { color: '#D97706', fontFamily: Font.bold }]}>Upgrade →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* List */}
          {isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={C.primary} size="large" />
            </View>
          ) : shares.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyBox, { backgroundColor: C.primaryLight }]}>
                <Feather name="users" size={36} color={C.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: C.text, fontFamily: Font.bold }]}>
                No collaborators yet
              </Text>
              <Text style={[styles.emptySub, { color: C.textMuted, fontFamily: Font.regular }]}>
                Tap + to share this book with someone
              </Text>
              {!isAtGuestLimit && (
                <TouchableOpacity
                  style={[styles.emptyAddBtn, { backgroundColor: C.primary }]}
                  onPress={openAdd}
                  activeOpacity={0.85}
                >
                  <Feather name="user-plus" size={16} color="#fff" />
                  <Text style={[styles.emptyAddBtnText, { fontFamily: Font.bold }]}>
                    Add Collaborator
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <FlatList
              data={shares}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <CollaboratorRow
                  item={item}
                  onEdit={handleEdit}
                  onRemove={handleRemove}
                  C={C}
                  Font={Font}
                  isDark={isDark}
                />
              )}
              contentContainerStyle={styles.list}
              ListHeaderComponent={
                <View style={{ marginHorizontal: 16, marginTop: 20, marginBottom: 6 }}>
                  <Text style={[styles.listHeader, { color: C.textMuted, fontFamily: Font.semiBold }]}>
                    {shares.length} {shares.length === 1 ? 'COLLABORATOR' : 'COLLABORATORS'}
                    {guestLimit !== Infinity ? `  ·  ${shares.length}/${guestLimit}` : ''}
                  </Text>
                  {shares.some(s => s.status === 'pending') && (
                    <View style={[styles.statusNote, { backgroundColor: '#FEF3C7', borderColor: '#D97706' }]}>
                      <Feather name="clock" size={12} color="#D97706" />
                      <Text style={[styles.statusNoteText, { fontFamily: Font.regular, color: '#D97706' }]}>
                        {shares.filter(s => s.status === 'pending').length} awaiting response
                      </Text>
                    </View>
                  )}
                </View>
              }
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      )}

      {/* Edit sheet */}
      <EditShareSheet
        visible={!!editShare}
        share={editShare}
        bookId={id}
        onClose={() => setEditShare(null)}
      />

      {/* Remove access sheet */}
      <RemoveAccessSheet
        visible={!!removeShare}
        share={removeShare}
        bookName={name}
        isLoading={removeCollaborator.isPending}
        onDismiss={() => setRemoveShare(null)}
        onConfirm={handleConfirmRemove}
        C={C}
        Font={Font}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  backBtn:      { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1 },
  headerTitle:  { fontSize: 17, color: '#fff', lineHeight: 24 },
  headerSub:    { fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 18, marginTop: 1 },
  addBtn:       { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginHorizontal: 16, marginTop: 16, marginBottom: 4,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  bannerText: { flex: 1, fontSize: 12, lineHeight: 18 },

  list:       { paddingBottom: 40 },
  listHeader: {
    fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: 6,
  },
  statusNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 5, marginTop: 4, alignSelf: 'flex-start',
  },
  statusNoteText: { fontSize: 11, lineHeight: 16 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 12,
  },
  avatar:     { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15 },
  rowBody:    { flex: 1 },
  rowName:    { fontSize: 15, lineHeight: 22, marginBottom: 2 },
  rowEmail:   { fontSize: 12, lineHeight: 18, marginBottom: 6 },
  rightsBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  rightsText: { fontSize: 11, lineHeight: 16 },
  actions:    { flexDirection: 'row', gap: 8 },
  actionBtn:  { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  empty:           { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyBox:        { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle:      { fontSize: 18, lineHeight: 26, marginBottom: 8 },
  emptySub:        { fontSize: 13, lineHeight: 20, textAlign: 'center', marginBottom: 28 },
  emptyAddBtn:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 32, paddingHorizontal: 28, paddingVertical: 15 },
  emptyAddBtnText: { fontSize: 15, color: '#fff', lineHeight: 22 },
});
