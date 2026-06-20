import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useRealtimeInvitations, useRealtimeGivenInvitations } from '../hooks/useRealtimeSync';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  StatusBar, ActivityIndicator, Alert, Modal, Animated,
} from 'react-native';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import {
  useReceivedInvitations,
  useGivenInvitations,
  useRespondToInvitation,
  useRemoveShareByOwner,
  useLeaveSharedBook,
} from '../hooks/useSharing';
import { RIGHTS_MAP, getInitials } from '../constants/sharing';
import EditShareSheet from '../components/sharing/EditShareSheet';
import { canAccess } from '../lib/canAccess';

// ── Status badge config ────────────────────────────────────────────────────────
// Two statuses: 'pending' (awaiting) and 'accepted' (active).
// Rejection deletes the row — no rejected state is stored.

const STATUS_META = {
  pending:  { icon: 'clock', label: 'Awaiting', color: '#D97706', light: '#FEF3C7', darkLight: '#2D1A00' },
  accepted: { icon: 'check', label: 'Active',   color: '#059669', light: '#D1FAE5', darkLight: '#022C22' },
};

// ── Tab bar ────────────────────────────────────────────────────────────────────

const TabBar = ({ active, onChange, receivedCount, C, Font }) => (
  <View style={[tb.wrap, { backgroundColor: C.card, borderBottomColor: C.border }]}>
    {[
      { key: 'received', label: 'Received', badge: receivedCount },
      { key: 'given',    label: 'Given',    badge: 0 },
    ].map(tab => (
      <TouchableOpacity
        key={tab.key}
        style={[tb.tab, active === tab.key && { borderBottomColor: C.primary, borderBottomWidth: 2 }]}
        onPress={() => onChange(tab.key)}
        activeOpacity={0.8}
      >
        <Text style={[tb.label, { color: active === tab.key ? C.primary : C.textMuted, fontFamily: active === tab.key ? Font.semiBold : Font.regular }]}>
          {tab.label}
        </Text>
        {tab.badge > 0 && (
          <View style={[tb.badge, { backgroundColor: C.danger }]}>
            <Text style={[tb.badgeText, { fontFamily: Font.bold }]}>{tab.badge}</Text>
          </View>
        )}
      </TouchableOpacity>
    ))}
  </View>
);

const tb = StyleSheet.create({
  wrap:      { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab:       { flex: 1, alignItems: 'center', paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  label:     { fontSize: 14, lineHeight: 20 },
  badge:     { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, color: '#fff', lineHeight: 14 },
});

// ── Avatar ─────────────────────────────────────────────────────────────────────

const Avatar = ({ name, email, C, Font, size = 42 }) => {
  const initials = getInitials(name || email || '');
  return (
    <View style={[av.box, { width: size, height: size, borderRadius: size / 2, backgroundColor: C.primaryLight }]}>
      <Text style={[av.text, { color: C.primary, fontFamily: Font.bold, fontSize: size * 0.35 }]}>
        {initials}
      </Text>
    </View>
  );
};
const av = StyleSheet.create({ box: { alignItems: 'center', justifyContent: 'center' }, text: {} });

// ── Status badge ───────────────────────────────────────────────────────────────

const StatusBadge = ({ status, C, Font, isDark }) => {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  const bg   = isDark ? meta.darkLight : meta.light;
  return (
    <View style={[bx.wrap, { backgroundColor: bg }]}>
      <Feather name={meta.icon} size={10} color={meta.color} />
      <Text style={[bx.text, { color: meta.color, fontFamily: Font.semiBold }]}>{meta.label}</Text>
    </View>
  );
};

// ── Rights badge ───────────────────────────────────────────────────────────────

const RightsBadge = ({ rights, C, Font, isDark }) => {
  const meta = RIGHTS_MAP[rights] ?? RIGHTS_MAP.view;
  const bg   = isDark ? meta.darkLight : meta.light;
  return (
    <View style={[bx.wrap, { backgroundColor: bg }]}>
      <Feather name={meta.icon} size={10} color={meta.color} />
      <Text style={[bx.text, { color: meta.color, fontFamily: Font.medium }]}>{meta.title}</Text>
    </View>
  );
};

const bx = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, alignSelf: 'flex-start' },
  text: { fontSize: 10, lineHeight: 15 },
});

// ── Decline confirmation sheet ─────────────────────────────────────────────────

const DeclineSheet = ({ visible, invitation, isLoading, onConfirm, onDismiss, C, Font }) => {
  const slideY    = useRef(new Animated.Value(500)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  const animateClose = useCallback((cb) => {
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideY,    { toValue: 500, duration: 220, useNativeDriver: true }),
    ]).start(() => cb?.());
  }, [bgOpacity, slideY]);

  useEffect(() => {
    if (!visible) return;
    slideY.setValue(500);
    bgOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.spring(slideY, { toValue: 0, tension: 160, friction: 20, useNativeDriver: true }),
    ]).start();
  }, [visible]);

  const close = useCallback(() => animateClose(onDismiss), [animateClose, onDismiss]);

  if (!visible || !invitation) return null;

  const ownerName  = invitation.owner?.full_name || invitation.owner?.email || 'Someone';
  const bookName   = invitation.book_name || 'this book';

  return (
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent>
      {/* Dim backdrop — uses theme overlay color */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: C.overlay, opacity: bgOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
      </Animated.View>

      {/* Sheet pinned to bottom */}
      <View style={ds.anchor} pointerEvents="box-none">
        <Animated.View style={[ds.sheet, { backgroundColor: C.card, transform: [{ translateY: slideY }] }]}>
          {/* Handle bar */}
          <View style={[ds.handle, { backgroundColor: C.border }]} />

          {/* Header */}
          <View style={ds.headerRow}>
            <View style={[ds.iconCircle, { backgroundColor: C.danger, shadowColor: C.danger }]}>
              <Feather name="x-circle" size={20} color={C.onPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[ds.title, { color: C.text, fontFamily: Font.bold }]}>Decline Invitation</Text>
              <Text style={[ds.subtitle, { color: C.danger, fontFamily: Font.medium }]}>
                You won't get access to this book
              </Text>
            </View>
          </View>

          {/* Book info card */}
          <View style={[ds.infoCard, { backgroundColor: C.cardAlt, borderColor: C.border }]}>
            <Feather name="book-open" size={15} color={C.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={[ds.infoBook, { color: C.text, fontFamily: Font.semiBold }]} numberOfLines={1}>
                {bookName}
              </Text>
              <Text style={[ds.infoOwner, { color: C.textMuted, fontFamily: Font.regular }]} numberOfLines={1}>
                Shared by {ownerName}
              </Text>
            </View>
          </View>

          <Text style={[ds.body, { color: C.textMuted, fontFamily: Font.regular }]}>
            Declining will remove this invitation.{' '}
            <Text style={{ color: C.text, fontFamily: Font.medium }}>{ownerName}</Text>
            {' '}will be notified that you declined.
          </Text>

          {/* Buttons */}
          <View style={ds.btnRow}>
            <TouchableOpacity
              style={[ds.btn, { borderColor: C.border, backgroundColor: C.background }]}
              onPress={close}
              activeOpacity={0.8}
              disabled={isLoading}
            >
              <Text style={[ds.btnText, { color: C.text, fontFamily: Font.semiBold }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[ds.btn, ds.btnDecline, { backgroundColor: C.danger, opacity: isLoading ? 0.7 : 1 }]}
              onPress={onConfirm}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading
                ? <ActivityIndicator size="small" color={C.onPrimary} />
                : <Feather name="x" size={15} color={C.onPrimary} />
              }
              <Text style={[ds.btnText, { color: C.onPrimary, fontFamily: Font.bold }]}>
                {isLoading ? 'Declining…' : 'Decline Invitation'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const ds = StyleSheet.create({
  anchor: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 20,
  },
  handle:    { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  iconCircle: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  title:    { fontSize: 16, lineHeight: 22 },
  subtitle: { fontSize: 12, lineHeight: 17, marginTop: 1 },
  infoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14,
  },
  infoBook:  { fontSize: 14, lineHeight: 20 },
  infoOwner: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  body:      { fontSize: 13, lineHeight: 20, marginBottom: 22, paddingHorizontal: 2 },
  btnRow:    { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 7,
  },
  btnDecline: { borderWidth: 0 },
  btnText:    { fontSize: 14 },
});

// ── Leave book confirmation sheet ─────────────────────────────────────────────

const LeaveBookSheet = ({ visible, item, isLoading, onConfirm, onDismiss, C, Font }) => {
  const slideY    = useRef(new Animated.Value(500)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  const animateClose = useCallback((cb) => {
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideY,    { toValue: 500, duration: 220, useNativeDriver: true }),
    ]).start(() => cb?.());
  }, [bgOpacity, slideY]);

  useEffect(() => {
    if (!visible) return;
    slideY.setValue(500);
    bgOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.spring(slideY, { toValue: 0, tension: 160, friction: 20, useNativeDriver: true }),
    ]).start();
  }, [visible]);

  const close = useCallback(() => animateClose(onDismiss), [animateClose, onDismiss]);

  if (!visible || !item) return null;

  const ownerName = item.owner?.full_name || item.owner?.email || 'the owner';
  const bookName  = item.book_name || 'this book';

  return (
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: C.overlay, opacity: bgOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
      </Animated.View>

      <View style={ls.anchor} pointerEvents="box-none">
        <Animated.View style={[ls.sheet, { backgroundColor: C.card, transform: [{ translateY: slideY }] }]}>
          {/* Handle */}
          <View style={[ls.handle, { backgroundColor: C.border }]} />

          {/* Header */}
          <View style={ls.headerRow}>
            <View style={[ls.iconCircle, { backgroundColor: C.danger, shadowColor: C.danger }]}>
              <Feather name="log-out" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[ls.title, { color: C.text, fontFamily: Font.bold }]}>Leave Book</Text>
              <Text style={[ls.subtitle, { color: C.danger, fontFamily: Font.medium }]}>
                You'll lose access immediately
              </Text>
            </View>
          </View>

          {/* Book info card */}
          <View style={[ls.infoCard, { backgroundColor: C.cardAlt, borderColor: C.border }]}>
            <Feather name="book-open" size={15} color={C.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={[ls.infoBook, { color: C.text, fontFamily: Font.semiBold }]} numberOfLines={1}>
                {bookName}
              </Text>
              <Text style={[ls.infoOwner, { color: C.textMuted, fontFamily: Font.regular }]} numberOfLines={1}>
                Shared by {ownerName}
              </Text>
            </View>
          </View>

          <Text style={[ls.body, { color: C.textMuted, fontFamily: Font.regular }]}>
            You will no longer be able to view or edit this book.{' '}
            <Text style={{ color: C.text, fontFamily: Font.medium }}>{ownerName}</Text>
            {' '}can re-invite you if needed.
          </Text>

          {/* Buttons */}
          <View style={ls.btnRow}>
            <TouchableOpacity
              style={[ls.btn, { borderColor: C.border, backgroundColor: C.background }]}
              onPress={close}
              activeOpacity={0.8}
              disabled={isLoading}
            >
              <Text style={[ls.btnText, { color: C.text, fontFamily: Font.semiBold }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[ls.btn, ls.btnLeave, { backgroundColor: C.danger, opacity: isLoading ? 0.7 : 1 }]}
              onPress={onConfirm}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Feather name="log-out" size={15} color="#fff" />
              }
              <Text style={[ls.btnText, { color: '#fff', fontFamily: Font.bold }]}>
                {isLoading ? 'Leaving…' : 'Leave Book'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const ls = StyleSheet.create({
  anchor: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 20,
  },
  handle:    { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  iconCircle: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  title:    { fontSize: 16, lineHeight: 22 },
  subtitle: { fontSize: 12, lineHeight: 17, marginTop: 1 },
  infoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14,
  },
  infoBook:  { fontSize: 14, lineHeight: 20 },
  infoOwner: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  body:      { fontSize: 13, lineHeight: 20, marginBottom: 22, paddingHorizontal: 2 },
  btnRow:    { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 7,
  },
  btnLeave: { borderWidth: 0 },
  btnText:  { fontSize: 14 },
});

// ── Received invitation card ───────────────────────────────────────────────────

const ReceivedCard = ({ item, onAccept, onDecline, onLeave, isResponding, C, Font, isDark }) => {
  const isPending  = item.status === 'pending';
  const isAccepted = item.status === 'accepted';

  return (
    <View style={[rc.card, { backgroundColor: C.card, borderColor: C.border }]}>
      {/* Book + owner info */}
      <View style={rc.top}>
        <Avatar name={item.owner?.full_name} email={item.owner?.email} C={C} Font={Font} />
        <View style={rc.info}>
          <Text style={[rc.bookName, { color: C.text, fontFamily: Font.semiBold }]} numberOfLines={1}>
            {item.book_name}
          </Text>
          <Text style={[rc.ownerName, { color: C.textMuted, fontFamily: Font.regular }]} numberOfLines={1}>
            From {item.owner?.full_name || item.owner?.email}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
            <StatusBadge status={item.status} C={C} Font={Font} isDark={isDark} />
            <RightsBadge rights={item.rights} C={C} Font={Font} isDark={isDark} />
          </View>
        </View>
      </View>

      {/* Pending: Accept / Decline */}
      {isPending && (
        <View style={rc.actions}>
          <TouchableOpacity
            style={[rc.btn, { borderWidth: 1, borderColor: C.danger }]}
            onPress={() => onDecline(item)}
            disabled={isResponding}
            activeOpacity={0.8}
          >
            <Feather name="x" size={14} color={C.danger} />
            <Text style={[rc.btnText, { color: C.danger, fontFamily: Font.semiBold }]}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[rc.btn, { backgroundColor: C.primary }]}
            onPress={() => onAccept(item)}
            disabled={isResponding}
            activeOpacity={0.8}
          >
            {isResponding ? (
              <ActivityIndicator size={14} color="#fff" />
            ) : (
              <>
                <Feather name="check" size={14} color="#fff" />
                <Text style={[rc.btnText, { color: '#fff', fontFamily: Font.semiBold }]}>Accept</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Accepted: Leave book */}
      {isAccepted && (
        <View style={rc.actions}>
          <TouchableOpacity
            style={[rc.btn, { borderWidth: 1, borderColor: C.danger }]}
            onPress={() => onLeave(item)}
            activeOpacity={0.8}
          >
            <Feather name="log-out" size={14} color={C.danger} />
            <Text style={[rc.btnText, { color: C.danger, fontFamily: Font.regular }]}>Leave Book</Text>
          </TouchableOpacity>
        </View>
      )}

    </View>
  );
};

const rc = StyleSheet.create({
  card:         { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  top:          { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  info:         { flex: 1 },
  bookName:     { fontSize: 15, lineHeight: 22, marginBottom: 2 },
  ownerName:    { fontSize: 12, lineHeight: 18 },
  actions:      { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' },
  btn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10 },
  btnText: { fontSize: 13, lineHeight: 19 },
});

// ── Given invitation card ──────────────────────────────────────────────────────

const GivenCard = ({ item, onEdit, onRemove, C, Font, isDark }) => (
  <View style={[gc.card, { backgroundColor: C.card, borderColor: C.border }]}>
    <View style={gc.row}>
      <Avatar name={item.collaborator?.full_name} email={item.collaborator?.email} C={C} Font={Font} size={40} />
      <View style={gc.info}>
        <Text style={[gc.name, { color: C.text, fontFamily: Font.semiBold }]} numberOfLines={1}>
          {item.collaborator?.full_name || item.collaborator?.email}
        </Text>
        <Text style={[gc.bookLabel, { color: C.textMuted, fontFamily: Font.regular }]} numberOfLines={1}>
          {item.book_name}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
          <StatusBadge status={item.status} C={C} Font={Font} isDark={isDark} />
          <RightsBadge rights={item.rights} C={C} Font={Font} isDark={isDark} />
        </View>
      </View>
      <View style={gc.btns}>
        {item.status === 'accepted' && (
          <TouchableOpacity
            style={[gc.iconBtn, { backgroundColor: C.primaryLight }]}
            onPress={() => onEdit(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.75}
          >
            <Feather name="edit-2" size={13} color={C.primary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[gc.iconBtn, { backgroundColor: C.dangerLight }]}
          onPress={() => onRemove(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.75}
        >
          <Feather name="trash-2" size={13} color={C.danger} />
        </TouchableOpacity>
      </View>
    </View>
  </View>
);

const gc = StyleSheet.create({
  card:      { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  row:       { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  info:      { flex: 1 },
  name:      { fontSize: 14, lineHeight: 21, marginBottom: 1 },
  bookLabel: { fontSize: 12, lineHeight: 18 },
  btns:      { flexDirection: 'row', gap: 8 },
  iconBtn:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});

// ── Empty state ────────────────────────────────────────────────────────────────

const EmptyState = ({ icon, title, sub, C, Font }) => (
  <View style={es.wrap}>
    <View style={[es.iconBox, { backgroundColor: C.primaryLight }]}>
      <Feather name={icon} size={32} color={C.primary} />
    </View>
    <Text style={[es.title, { color: C.text, fontFamily: Font.bold }]}>{title}</Text>
    <Text style={[es.sub, { color: C.textMuted, fontFamily: Font.regular }]}>{sub}</Text>
  </View>
);
const es = StyleSheet.create({
  wrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingTop: 60 },
  iconBox: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title:   { fontSize: 17, lineHeight: 24, marginBottom: 8 },
  sub:     { fontSize: 13, lineHeight: 20, textAlign: 'center' },
});

// ── Paywall overlay ────────────────────────────────────────────────────────────

const PaywallOverlay = ({ onUpgrade, C, Font }) => (
  <View style={pw.wrap}>
    {/* Card */}
    <View style={[pw.card, { backgroundColor: C.card, borderColor: C.border }]}>
      <View style={[pw.iconCircle, { backgroundColor: C.primaryLight }]}>
        <Feather name="lock" size={28} color={C.primary} />
      </View>

      <Text style={[pw.title, { color: C.text, fontFamily: Font.bold }]}>
        Pro Feature
      </Text>
      <Text style={[pw.sub, { color: C.textMuted, fontFamily: Font.regular }]}>
        Book sharing and collaboration is available on the Pro plan. Upgrade to invite others and manage access to your cashbooks.
      </Text>

      <TouchableOpacity
        style={[pw.btn, { backgroundColor: C.primary }]}
        onPress={onUpgrade}
        activeOpacity={0.85}
      >
        <Feather name="zap" size={15} color="#fff" />
        <Text style={[pw.btnText, { fontFamily: Font.bold }]}>Upgrade to Pro</Text>
      </TouchableOpacity>
    </View>
  </View>
);

const pw = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 12,
  },
  iconCircle: {
    width: 68, height: 68, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  title:   { fontSize: 20, lineHeight: 28, marginBottom: 10 },
  sub:     { fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: 28,
    borderRadius: 14, width: '100%', justifyContent: 'center',
  },
  btnText: { fontSize: 15, color: '#fff' },
});

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function ManageAccessScreen() {
  const router = useRouter();
  const { C, Font, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const hasAccess = canAccess(user, 'book_sharing');
  useRealtimeInvitations(user?.id);
  useRealtimeGivenInvitations(user?.id);

  const [activeTab,    setActiveTab]    = useState('received');
  const [editShare,    setEditShare]    = useState(null);
  const [declineItem,  setDeclineItem]  = useState(null);
  const [leaveItem,    setLeaveItem]    = useState(null);
  const [respondingId, setRespondingId] = useState(null);

  const { data: received = [], isLoading: receivedLoading } = useReceivedInvitations();
  const { data: given    = [], isLoading: givenLoading }    = useGivenInvitations();
  const respondMutation = useRespondToInvitation();
  const leaveBook       = useLeaveSharedBook();
  const removeByOwner   = useRemoveShareByOwner();

  const pendingCount    = useMemo(() => received.filter(i => i.status === 'pending').length, [received]);
  const isDeclining     = respondMutation.isPending && declineItem !== null;

  const handleAccept = useCallback((item) => {
    setRespondingId(item.share_id);
    respondMutation.mutate(
      { bookId: item.book_id, shareId: item.share_id, action: 'accept' },
      {
        onSuccess: () => setRespondingId(null),
        onError:   () => {
          setRespondingId(null);
          Alert.alert('Error', 'Could not accept invitation. Please try again.');
        },
      }
    );
  }, [respondMutation]);

  // Opens the decline confirmation sheet
  const handleDecline = useCallback((item) => {
    setDeclineItem(item);
  }, []);

  // Called from inside the DeclineSheet when user confirms
  const handleConfirmDecline = useCallback(() => {
    if (!declineItem) return;
    respondMutation.mutate(
      { bookId: declineItem.book_id, shareId: declineItem.share_id, action: 'reject' },
      {
        onSuccess: () => setDeclineItem(null),
        onError:   () => {
          setDeclineItem(null);
          Alert.alert('Error', 'Could not decline invitation. Please try again.');
        },
      }
    );
  }, [declineItem, respondMutation]);

  const handleLeave = useCallback((item) => {
    setLeaveItem(item);
  }, []);

  const handleConfirmLeave = useCallback(() => {
    if (!leaveItem) return;
    leaveBook.mutate(leaveItem.book_id, {
      onSuccess: () => setLeaveItem(null),
      onError:   () => {
        setLeaveItem(null);
        Alert.alert('Error', 'Could not leave this book. Please try again.');
      },
    });
  }, [leaveItem, leaveBook]);

  const handleRemoveGiven = useCallback((item) => {
    const label = item.status === 'pending' ? 'Cancel Invitation' : 'Remove Access';
    const msg   = item.status === 'pending'
      ? `Cancel your invitation to ${item.collaborator?.full_name || item.collaborator?.email} for "${item.book_name}"?`
      : `Remove ${item.collaborator?.full_name || item.collaborator?.email}'s access to "${item.book_name}"?`;
    Alert.alert(label, msg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: label,
        style: 'destructive',
        onPress: () => {
          removeByOwner.mutate(
            { bookId: item.book_id, shareId: item.share_id },
            { onError: () => Alert.alert('Error', 'Could not remove access. Please try again.') }
          );
        },
      },
    ]);
  }, [removeByOwner]);

  const isLoading = activeTab === 'received' ? receivedLoading : givenLoading;

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
        <Text style={[styles.headerTitle, { fontFamily: Font.bold }]}>Manage Access</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab bar */}
      <TabBar
        active={activeTab}
        onChange={setActiveTab}
        receivedCount={pendingCount}
        C={C}
        Font={Font}
      />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.primary} size="large" />
        </View>
      ) : activeTab === 'received' ? (
        received.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="No invitations"
            sub="When someone shares a book with you, the invitation will appear here."
            C={C} Font={Font}
          />
        ) : (
          <FlatList
            data={received}
            keyExtractor={item => item.share_id}
            renderItem={({ item }) => (
              <ReceivedCard
                item={item}
                onAccept={handleAccept}
                onDecline={handleDecline}
                onLeave={handleLeave}
                isResponding={respondingId === item.share_id}
                C={C} Font={Font} isDark={isDark}
              />
            )}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              pendingCount > 0 ? (
                <View style={[styles.pendingBanner, { backgroundColor: C.primaryLight, borderColor: C.primaryMid }]}>
                  <Feather name="bell" size={14} color={C.primary} />
                  <Text style={[styles.pendingText, { color: C.primary, fontFamily: Font.medium }]}>
                    {pendingCount} pending {pendingCount === 1 ? 'invitation' : 'invitations'} awaiting your response
                  </Text>
                </View>
              ) : null
            }
          />
        )
      ) : !hasAccess ? (
        <PaywallOverlay
          onUpgrade={() => router.push('/(app)/settings/subscription')}
          C={C}
          Font={Font}
        />
      ) : (
        given.length === 0 ? (
          <EmptyState
            icon="share-2"
            title="No access given"
            sub="Books you share with others will appear here with their response status."
            C={C} Font={Font}
          />
        ) : (
          <FlatList
            data={given}
            keyExtractor={item => item.share_id}
            renderItem={({ item }) => (
              <GivenCard
                item={item}
                onEdit={(share) => setEditShare({
                  id:          share.share_id,
                  book_id:     share.book_id,
                  rights:      share.rights,
                  screens:     share.screens,
                  shared_with: share.collaborator,
                })}
                onRemove={handleRemoveGiven}
                C={C} Font={Font} isDark={isDark}
              />
            )}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )
      )}

      {/* Edit rights sheet */}
      <EditShareSheet
        visible={!!editShare}
        share={editShare}
        bookId={editShare?.book_id}
        onClose={() => setEditShare(null)}
      />

      {/* Decline confirmation sheet */}
      <DeclineSheet
        visible={!!declineItem}
        invitation={declineItem}
        isLoading={isDeclining}
        onConfirm={handleConfirmDecline}
        onDismiss={() => setDeclineItem(null)}
        C={C}
        Font={Font}
      />

      {/* Leave book confirmation sheet */}
      <LeaveBookSheet
        visible={!!leaveItem}
        item={leaveItem}
        isLoading={leaveBook.isPending}
        onConfirm={handleConfirmLeave}
        onDismiss={() => setLeaveItem(null)}
        C={C}
        Font={Font}
      />

    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, color: '#fff', lineHeight: 24 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:        { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 40 },
  pendingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12,
  },
  pendingText: { flex: 1, fontSize: 12, lineHeight: 18 },
});
