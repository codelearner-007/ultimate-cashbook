import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  StatusBar, Linking, ActivityIndicator, Modal, Animated, Platform,
} from 'react-native';
import SuccessDialog from '../components/ui/SuccessDialog';
import UpgradeSyncSheet from '../components/ui/UpgradeSyncSheet';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import { useTheme } from '../hooks/useTheme';
import { useAuthStore } from '../store/authStore';
import { apiUpdateSubscription, apiGetProfile } from '../lib/api';
import {
  isPurchasesAvailable, configurePurchases, purchaseTier, restorePurchases,
} from '../lib/purchases';
import { Font } from '../constants/fonts';
import { PLAN_META } from '../constants/plans';

// ── Plan definitions ──────────────────────────────────────────────────────────

const PLANS = [
  {
    key:          'free',
    name:         'Free',
    monthly:      0,
    yearly:       0,
    yearlyLabel:  '$0',
    monthlyLabel: '$0',
    crown:        PLAN_META.free.crown,
    color:        PLAN_META.free.color,
    description:  'Perfect for getting started',
    rows: [
      { label: 'Cashbooks',           value: '3',          included: true  },
      { label: 'Entries',             value: 'Unlimited',  included: true  },
      { label: 'Storage',             value: 'Local only', included: true  },
      { label: 'Multi-device',        value: 'No',         included: false },
      { label: 'PDF / Excel Export',  value: 'No',         included: false },
      { label: 'Reports',             value: 'View only',  included: true  },
      { label: 'Shared Books',        value: 'No',         included: false },
      { label: 'Backup History',      value: 'None',       included: false },
      { label: 'Guest Access',        value: 'No',         included: false },
    ],
  },
  {
    key:          'pro',
    name:         'Pro',
    monthly:      4.99,
    yearly:       41.99,
    yearlyLabel:  '$41.99 / yr',
    monthlyLabel: '$4.99 / mo',
    crown:        PLAN_META.pro.crown,
    color:        PLAN_META.pro.color,
    description:  'For individuals who need more',
    rows: [
      { label: 'Cashbooks',           value: '15',             included: true  },
      { label: 'Entries',             value: 'Unlimited',      included: true  },
      { label: 'Storage',             value: 'Cloud sync',     included: true  },
      { label: 'Multi-device',        value: 'Yes',            included: true  },
      { label: 'PDF / Excel Export',  value: 'Yes',            included: true  },
      { label: 'Reports',             value: 'Full access',    included: true  },
      { label: 'Shared Books',        value: 'Yes',            included: true  },
      { label: 'Backup History',      value: '7 days',         included: true  },
      { label: 'Guest Access',        value: '1 guest',        included: true  },
    ],
  },
  {
    key:          'business',
    name:         'Business',
    monthly:      9.99,
    yearly:       83.99,
    yearlyLabel:  '$83.99 / yr',
    monthlyLabel: '$9.99 / mo',
    crown:        PLAN_META.business.crown,
    color:        PLAN_META.business.color,
    description:  'For teams & power users',
    rows: [
      { label: 'Cashbooks',           value: 'Unlimited',      included: true  },
      { label: 'Entries',             value: 'Unlimited',      included: true  },
      { label: 'Storage',             value: 'Cloud sync',     included: true  },
      { label: 'Multi-device',        value: 'Yes',            included: true  },
      { label: 'PDF / Excel Export',  value: 'Yes',            included: true  },
      { label: 'Reports',             value: 'Full access',    included: true  },
      { label: 'Shared Books',        value: 'Yes',            included: true  },
      { label: 'Backup History',      value: '30 days',        included: true  },
      { label: 'Guest Access',        value: 'Up to 10 guests', included: true  },
    ],
  },
];

// ── Deep-link helpers (platform billing management) ───────────────────────────

const PLATFORM_LABEL = Platform.OS === 'ios' ? 'App Store' : 'Google Play';

function openPlatformSubscriptions() {
  const url = Platform.OS === 'ios'
    ? 'itms-apps://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';
  Linking.openURL(url).catch(() => {});
}

// ── Date helpers ──────────────────────────────────────────────────────────────

const DATE_FMT = { month: 'short', day: 'numeric', year: 'numeric' };

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-US', DATE_FMT);
}

// ── Inline icon components ────────────────────────────────────────────────────

const BackIcon = ({ color }) => (
  <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 9, height: 9, borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderColor: color, transform: [{ rotate: '45deg' }] }} />
  </View>
);

const CheckIcon = ({ color, size = 14 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{
      width: size * 0.52, height: size * 0.3,
      borderLeftWidth: 2, borderBottomWidth: 2, borderColor: color,
      transform: [{ rotate: '-45deg' }, { translateY: -size * 0.06 }],
    }} />
  </View>
);

const CrossIcon = ({ color, size = 12 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ position: 'absolute', width: size * 0.7, height: 1.5, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '45deg' }] }} />
    <View style={{ position: 'absolute', width: size * 0.7, height: 1.5, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '-45deg' }] }} />
  </View>
);

// ── CTA logic — maps (plan, current tier, status) → button label/variant/action ──

/**
 * Returns { label, variant, action } for a plan card's CTA button.
 *
 * variant: 'current' | 'outline-info' | 'activate' | 'upgrade' | 'cancel' | 'reactivate' | 'none'
 * action:  'activate' | 'upgrade' | 'cancel' | 'reactivate' | 'none'
 */
function getPlanCTA({ planKey, currentTier, subscriptionStatus, isSuperAdmin }) {
  if (isSuperAdmin) return { label: '✓ Included', variant: 'current', action: 'none' };

  const isCancelled = subscriptionStatus === 'cancelled';

  // ── Free card ──
  if (planKey === 'free') {
    if (currentTier === 'free') return { label: 'Current Plan', variant: 'current', action: 'none' };
    if (isCancelled) {
      return {
        label: 'Cancels on expiry — no action needed',
        variant: 'outline-info',
        action: 'none',
      };
    }
    // active paid — show Cancel Subscription on the Free card
    return { label: 'Cancel Subscription', variant: 'cancel', action: 'cancel' };
  }

  // ── Pro card ──
  if (planKey === 'pro') {
    if (currentTier === 'pro') {
      if (isCancelled) return { label: 'Reactivate', variant: 'reactivate', action: 'reactivate' };
      return { label: 'Current Plan', variant: 'current', action: 'none' };
    }
    if (currentTier === 'free') return { label: 'Activate Pro', variant: 'activate', action: 'activate' };
    if (currentTier === 'business') return { label: null, variant: 'none', action: 'none' }; // lower tier — no button
    return { label: 'Activate Pro', variant: 'activate', action: 'activate' };
  }

  // ── Business card ──
  if (planKey === 'business') {
    if (currentTier === 'business') {
      if (isCancelled) return { label: 'Reactivate', variant: 'reactivate', action: 'reactivate' };
      return { label: 'Current Plan', variant: 'current', action: 'none' };
    }
    if (currentTier === 'free') return { label: 'Activate Business', variant: 'activate', action: 'activate' };
    if (currentTier === 'pro') {
      if (isCancelled) return { label: 'Reactivate & Upgrade', variant: 'upgrade', action: 'upgrade' };
      return { label: 'Upgrade to Business', variant: 'upgrade', action: 'upgrade' };
    }
  }

  return { label: null, variant: 'none', action: 'none' };
}

// ── Billing Toggle ────────────────────────────────────────────────────────────

function BillingToggle({ billing, onChange, C }) {
  return (
    <View style={[toggleStyles.wrap, { backgroundColor: C.card, borderColor: C.border }]}>
      {['monthly', 'yearly'].map(cycle => (
        <TouchableOpacity
          key={cycle}
          style={[toggleStyles.pill, billing === cycle && { backgroundColor: C.primary }]}
          onPress={() => onChange(cycle)}
          activeOpacity={0.8}
        >
          <Text style={[
            toggleStyles.label,
            {
              color:      billing === cycle ? '#fff' : C.textMuted,
              fontFamily: billing === cycle ? Font.bold : Font.medium,
            },
          ]}>
            {cycle === 'monthly' ? 'Monthly' : 'Yearly  💰'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const toggleStyles = StyleSheet.create({
  wrap:  { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 3 },
  pill:  { flex: 1, paddingVertical: 8, borderRadius: 11, alignItems: 'center' },
  label: { fontSize: 13 },
});

// ── Plan Card ─────────────────────────────────────────────────────────────────

function PlanCard({ plan, currentTier, subscriptionStatus, expiresAt, billing, isSuperAdmin, isActivating, onCTA, C, primaryColor }) {
  const accentColor = plan.color ?? primaryColor;
  const dimmed      = '#9CA3AF';
  const price       = billing === 'yearly' ? plan.yearlyLabel : plan.monthlyLabel;
  const isCurrentTier = plan.key === currentTier;
  const isCancelled   = subscriptionStatus === 'cancelled';

  const { label: ctaLabel, variant, action } = getPlanCTA({
    planKey: plan.key, currentTier, subscriptionStatus, isSuperAdmin,
  });

  const savingsBadge = billing === 'yearly' && plan.key !== 'free' && !isCurrentTier;
  const cancelsBadge = isCurrentTier && isCancelled && expiresAt;

  return (
    <View style={[
      cardStyles.card,
      {
        backgroundColor: C.card,
        borderColor:     isCurrentTier ? accentColor : C.border,
        borderWidth:     isCurrentTier ? 2 : 1.5,
        shadowColor:     accentColor,
        shadowOpacity:   isCurrentTier ? 0.2 : 0.06,
      },
    ]}>
      {/* ── Card header ── */}
      <View style={cardStyles.header}>
        <View style={cardStyles.titleRow}>
          {plan.crown && <Text style={{ fontSize: 18, marginRight: 5 }}>👑</Text>}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={[cardStyles.planName, { color: accentColor, fontFamily: Font.extraBold }]}>
                {plan.name}
              </Text>
              {isCurrentTier && !isCancelled && (
                <View style={[cardStyles.currentBadge, { backgroundColor: accentColor + '22', borderColor: accentColor + '55' }]}>
                  <Text style={[cardStyles.currentBadgeText, { color: accentColor, fontFamily: Font.bold }]}>
                    Current Plan
                  </Text>
                </View>
              )}
              {cancelsBadge && (
                <View style={[cardStyles.cancelBadge, { backgroundColor: C.danger + '18', borderColor: C.danger + '44' }]}>
                  <Text style={[cardStyles.cancelBadgeText, { color: C.danger, fontFamily: Font.bold }]}>
                    Cancels {fmtDate(expiresAt)}
                  </Text>
                </View>
              )}
              {savingsBadge && (
                <View style={[cardStyles.savingsBadge, { backgroundColor: '#10B98122' }]}>
                  <Text style={[cardStyles.savingsText, { color: '#10B981', fontFamily: Font.bold }]}>Save 30%</Text>
                </View>
              )}
            </View>
            <Text style={[cardStyles.description, { color: C.textMuted, fontFamily: Font.regular }]}>
              {plan.description}
            </Text>
          </View>
        </View>

        <View style={cardStyles.priceRow}>
          {plan.key === 'free' ? (
            <Text style={[cardStyles.price, { color: C.text, fontFamily: Font.extraBold }]}>$0</Text>
          ) : (
            <>
              <Text style={[cardStyles.price, { color: accentColor, fontFamily: Font.extraBold }]}>{price}</Text>
              {billing === 'yearly' && (
                <Text style={[cardStyles.priceNote, { color: C.textSubtle, fontFamily: Font.regular }]}>
                  {'  '}(${(plan.monthly).toFixed(2)}/mo billed yearly)
                </Text>
              )}
            </>
          )}
        </View>
      </View>

      {/* ── Divider ── */}
      <View style={[cardStyles.divider, { backgroundColor: C.border }]} />

      {/* ── Feature rows ── */}
      <View style={cardStyles.features}>
        {plan.rows.map((row, i) => (
          <View key={i} style={cardStyles.featureRow}>
            <View style={[
              cardStyles.featureIcon,
              { backgroundColor: row.included ? accentColor + '18' : dimmed + '14' },
            ]}>
              {row.included
                ? <CheckIcon color={accentColor} size={13} />
                : <CrossIcon color={dimmed} size={11} />
              }
            </View>
            <Text style={[cardStyles.featureLabel, { color: C.textMuted, fontFamily: Font.regular }]}>
              {row.label}
            </Text>
            <Text style={[
              cardStyles.featureValue,
              {
                color:      row.included ? C.text : dimmed,
                fontFamily: row.included ? Font.semiBold : Font.regular,
              },
            ]}>
              {row.value}
            </Text>
          </View>
        ))}
      </View>

      {/* ── CTA ── */}
      {variant === 'none' ? null
        : variant === 'current' ? (
          <View style={[cardStyles.btnOutline, { borderColor: accentColor }]}>
            <Text style={[cardStyles.btnOutlineText, { color: accentColor, fontFamily: Font.semiBold }]}>
              {ctaLabel}
            </Text>
          </View>
        ) : variant === 'outline-info' ? (
          <View style={[cardStyles.btnOutline, { borderColor: C.border }]}>
            <Text style={[cardStyles.btnOutlineText, { color: C.textMuted, fontFamily: Font.regular, fontSize: 12 }]}>
              {ctaLabel}
            </Text>
          </View>
        ) : variant === 'cancel' ? (
          <TouchableOpacity
            style={[cardStyles.btn, { backgroundColor: C.danger, opacity: isActivating ? 0.7 : 1 }]}
            onPress={() => onCTA(plan.key, action)}
            disabled={isActivating}
            activeOpacity={0.85}
          >
            {isActivating
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={[cardStyles.btnText, { fontFamily: Font.bold }]}>{ctaLabel}</Text>
            }
          </TouchableOpacity>
        ) : variant === 'reactivate' ? (
          <TouchableOpacity
            style={[cardStyles.btn, { backgroundColor: accentColor, opacity: isActivating ? 0.7 : 1 }]}
            onPress={() => onCTA(plan.key, action)}
            disabled={isActivating}
            activeOpacity={0.85}
          >
            {isActivating
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={[cardStyles.btnText, { fontFamily: Font.bold }]}>{ctaLabel}</Text>
            }
          </TouchableOpacity>
        ) : (
          /* activate | upgrade */
          <TouchableOpacity
            style={[cardStyles.btn, { backgroundColor: accentColor, opacity: isActivating ? 0.7 : 1 }]}
            onPress={() => onCTA(plan.key, action)}
            disabled={isActivating}
            activeOpacity={0.85}
          >
            {isActivating
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={[cardStyles.btnText, { fontFamily: Font.bold }]}>{ctaLabel}</Text>
            }
          </TouchableOpacity>
        )
      }
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 20,
    marginBottom: 16,
    paddingHorizontal: 18,
    paddingVertical: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 14,
    elevation: 4,
  },
  header:       { marginBottom: 14 },
  titleRow:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  planName:     { fontSize: 21 },
  description:  { fontSize: 12, marginTop: 2 },
  currentBadge: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  currentBadgeText: { fontSize: 11 },
  cancelBadge:  { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  cancelBadgeText: { fontSize: 11 },
  savingsBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  savingsText:  { fontSize: 11 },
  priceRow:     { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  price:        { fontSize: 28 },
  priceNote:    { fontSize: 12 },
  divider:      { height: 1, marginBottom: 14 },
  features:     { gap: 9, marginBottom: 18 },
  featureRow:   { flexDirection: 'row', alignItems: 'center', gap: 9 },
  featureIcon:  { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  featureLabel: { fontSize: 13, flex: 1 },
  featureValue: { fontSize: 13, textAlign: 'right' },
  btn:          { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  btnText:      { fontSize: 14, color: '#fff', letterSpacing: 0.3 },
  btnOutline:   { height: 48, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  btnOutlineText: { fontSize: 14, textAlign: 'center' },
});

// ── Cancel Confirmation Sheet ─────────────────────────────────────────────────

function CancelSheet({ visible, planName, expiresAt, isLoading, onDismiss, onConfirm, C }) {
  const slideY    = useRef(new Animated.Value(600)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  const animateClose = useCallback((cb) => {
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideY,    { toValue: 600, duration: 200, useNativeDriver: true }),
    ]).start(() => cb?.());
  }, [bgOpacity, slideY]);

  useEffect(() => {
    if (!visible) return;
    slideY.setValue(600);
    bgOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.spring(slideY,    { toValue: 0, tension: 160, friction: 20, useNativeDriver: true }),
    ]).start();
  }, [visible]);

  const close = useCallback(() => animateClose(onDismiss), [animateClose, onDismiss]);

  if (!visible) return null;

  const expiryLabel = expiresAt ? fmtDate(expiresAt) : null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[sheetS.dim, StyleSheet.absoluteFill, { opacity: bgOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
      </Animated.View>

      <View style={sheetS.anchor} pointerEvents="box-none">
        <Animated.View style={[sheetS.sheet, { backgroundColor: C.card, transform: [{ translateY: slideY }] }]}>
          <View style={[sheetS.handle, { backgroundColor: C.border }]} />

          <Text style={[sheetS.title, { color: C.text, fontFamily: Font.bold }]}>
            Cancel Subscription?
          </Text>

          <View style={[sheetS.bodyCard, { backgroundColor: C.background, borderColor: C.border }]}>
            <Text style={[sheetS.bodyLine, { color: C.textMuted, fontFamily: Font.regular }]}>
              You'll be taken to{' '}
              <Text style={{ color: C.text, fontFamily: Font.semiBold }}>{PLATFORM_LABEL}</Text>
              {' '}to cancel your subscription.
            </Text>
            {expiryLabel && (
              <Text style={[sheetS.bodyLine, { color: C.textMuted, fontFamily: Font.regular, marginTop: 10 }]}>
                You'll keep full{' '}
                <Text style={{ color: C.text, fontFamily: Font.semiBold }}>{planName}</Text>
                {' '}access until{' '}
                <Text style={{ color: C.text, fontFamily: Font.semiBold }}>{expiryLabel}</Text>.
              </Text>
            )}
            <Text style={[sheetS.bodyLine, { color: C.textMuted, fontFamily: Font.regular, marginTop: 10 }]}>
              After that, your account moves to{' '}
              <Text style={{ color: C.text, fontFamily: Font.semiBold }}>Free</Text>
              {' '}automatically.
            </Text>
          </View>

          <View style={sheetS.btnRow}>
            <TouchableOpacity
              style={[sheetS.btn, { borderColor: C.border }]}
              onPress={close}
              activeOpacity={0.8}
              disabled={isLoading}
            >
              <Text style={[sheetS.btnText, { color: C.textMuted, fontFamily: Font.semiBold }]}>
                Maybe Later
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[sheetS.btn, sheetS.btnFill, { backgroundColor: C.danger, opacity: isLoading ? 0.7 : 1 }]}
              onPress={onConfirm}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={[sheetS.btnText, { color: '#fff', fontFamily: Font.bold }]}>
                    Go to {PLATFORM_LABEL}
                  </Text>
              }
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Activate / Upgrade Confirmation Sheet ─────────────────────────────────────

function ActivateSheet({ visible, plan, billing, action, isLoading, onDismiss, onConfirm, C }) {
  const slideY    = useRef(new Animated.Value(600)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  const animateClose = useCallback((cb) => {
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideY,    { toValue: 600, duration: 200, useNativeDriver: true }),
    ]).start(() => cb?.());
  }, [bgOpacity, slideY]);

  useEffect(() => {
    if (!visible) return;
    slideY.setValue(600);
    bgOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.spring(slideY,    { toValue: 0, tension: 160, friction: 20, useNativeDriver: true }),
    ]).start();
  }, [visible]);

  const close = useCallback(() => animateClose(onDismiss), [animateClose, onDismiss]);

  if (!visible || !plan) return null;

  const accentColor = plan.color ?? C.primary;
  const price       = billing === 'yearly' ? plan.yearlyLabel : plan.monthlyLabel;
  const isUpgrade   = action === 'upgrade';

  const confirmLabel = isLoading ? 'Processing…'
    : isUpgrade ? `Upgrade to ${plan.name}`
    : `Activate ${plan.name}`;

  return (
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[sheetS.dim, StyleSheet.absoluteFill, { opacity: bgOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
      </Animated.View>

      <View style={sheetS.anchor} pointerEvents="box-none">
        <Animated.View style={[sheetS.sheet, { backgroundColor: C.card, transform: [{ translateY: slideY }] }]}>
          <View style={[sheetS.handle, { backgroundColor: C.border }]} />

          <Text style={[sheetS.title, { color: C.text, fontFamily: Font.bold }]}>
            {isUpgrade ? `Upgrade to ${plan.name}` : `Activate ${plan.name}`}
          </Text>

          <View style={sheetS.chipRow}>
            <View style={[sheetS.chip, { backgroundColor: accentColor + '14', borderColor: accentColor + '44' }]}>
              {plan.crown && <Text style={{ fontSize: 13, marginRight: 3 }}>👑</Text>}
              <Text style={[sheetS.chipText, { color: accentColor, fontFamily: Font.semiBold }]}>
                {plan.name}  ·  {price}
              </Text>
            </View>
          </View>

          <Text style={[sheetS.body, { color: C.textMuted, fontFamily: Font.regular }]}>
            {isUpgrade
              ? `You'll be taken to ${PLATFORM_LABEL} to complete the upgrade. The platform handles proration automatically.`
              : `You'll be taken to ${PLATFORM_LABEL} to complete your subscription. Your ${plan.name} features unlock immediately after purchase.`
            }
          </Text>

          <View style={sheetS.btnRow}>
            <TouchableOpacity
              style={[sheetS.btn, { borderColor: C.border }]}
              onPress={close}
              activeOpacity={0.8}
              disabled={isLoading}
            >
              <Text style={[sheetS.btnText, { color: C.textMuted, fontFamily: Font.semiBold }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[sheetS.btn, sheetS.btnFill, { backgroundColor: accentColor, opacity: isLoading ? 0.7 : 1 }]}
              onPress={onConfirm}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={[sheetS.btnText, { color: '#fff', fontFamily: Font.bold }]}>{confirmLabel}</Text>
              }
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const sheetS = StyleSheet.create({
  dim:    { backgroundColor: 'rgba(0,0,0,0.6)' },
  anchor: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingBottom: 38, paddingTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.18, shadowRadius: 24, elevation: 24,
  },
  handle:  { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
  title:   { fontSize: 20, textAlign: 'center', marginBottom: 16, letterSpacing: 0.2 },
  chipRow: { alignItems: 'center', marginBottom: 20 },
  chip: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  chipText: { fontSize: 14 },
  body: { fontSize: 13, lineHeight: 20, textAlign: 'center', marginBottom: 24, paddingHorizontal: 4 },
  bodyCard: {
    borderRadius: 14, borderWidth: 1.5, padding: 16, marginBottom: 24,
  },
  bodyLine: { fontSize: 13, lineHeight: 20 },
  btnRow: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1, paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 7,
  },
  btnFill: { borderWidth: 0 },
  btnText: { fontSize: 13 },
});

// ── Past-due banner ───────────────────────────────────────────────────────────

function PastDueBanner({ C }) {
  return (
    <View style={[pastDueS.wrap, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B55' }]}>
      <Text style={[pastDueS.icon]}>⚠️</Text>
      <View style={{ flex: 1 }}>
        <Text style={[pastDueS.title, { color: '#92400E', fontFamily: Font.bold }]}>
          Payment Failed
        </Text>
        <Text style={[pastDueS.body, { color: '#92400E', fontFamily: Font.regular }]}>
          Please update your payment method in {PLATFORM_LABEL} to keep your subscription active.
        </Text>
        <TouchableOpacity onPress={openPlatformSubscriptions} activeOpacity={0.8} style={pastDueS.link}>
          <Text style={[pastDueS.linkText, { color: '#B45309', fontFamily: Font.semiBold }]}>
            Open {PLATFORM_LABEL} →
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const pastDueS = StyleSheet.create({
  wrap:  { flexDirection: 'row', gap: 12, borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 12 },
  icon:  { fontSize: 22, marginTop: 1 },
  title: { fontSize: 13, marginBottom: 3 },
  body:  { fontSize: 12, lineHeight: 17 },
  link:  { marginTop: 6 },
  linkText: { fontSize: 12 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function SubscriptionScreen() {
  const router   = useRouter();
  const { C, isDark }    = useTheme();
  const qc       = useQueryClient();

  const user    = useAuthStore(s => s.user);
  const session = useAuthStore(s => s.session);
  const setUser = useAuthStore(s => s.setUser);

  const isSuperAdmin        = user?.role === 'superadmin';
  const currentTier         = user?.subscription_tier          ?? 'free';
  const subscriptionStatus  = user?.subscription_status        ?? 'free';
  const currentBillingCycle = user?.subscription_billing_cycle ?? 'monthly';
  const expiresAt           = user?.subscription_expires_at    ?? null;
  const cancelAtPeriodEnd   = user?.subscription_cancel_at_period_end ?? false;
  const startedAt           = user?.subscription_started_at    ?? null;
  const isPastDue           = subscriptionStatus === 'past_due';

  const [billing,           setBilling]           = useState(() => currentBillingCycle);
  const [showSyncSheet,     setShowSyncSheet]     = useState(false);
  const [syncSheetPlan,     setSyncSheetPlan]     = useState(null);
  const [showCancelSheet,   setShowCancelSheet]   = useState(false);
  const [showActivateSheet, setShowActivateSheet] = useState(false);
  const [pendingPlanKey,    setPendingPlanKey]    = useState(null);
  const [pendingAction,     setPendingAction]     = useState(null);
  const [activatingKey,     setActivatingKey]     = useState(null);
  const [showSuccess,       setShowSuccess]       = useState(false);
  const [successTitle,      setSuccessTitle]      = useState('');

  const { mutate: updateSub } = useMutation({
    mutationFn: apiUpdateSubscription,
    onMutate:   ({ tier }) => setActivatingKey(tier),
    onSettled:  ()         => setActivatingKey(null),
    onSuccess:  (updatedProfile) => {
      const tier   = updatedProfile?.subscription_tier ?? 'free';
      const plan   = PLANS.find(p => p.key === tier);
      const wasFreeTier = currentTier === 'free';

      setSuccessTitle(
        tier === 'free' ? 'Downgraded to Free'
          : pendingAction === 'upgrade' ? `Upgraded to ${plan?.name ?? tier}! 👑`
          : `${plan?.name ?? tier} Activated! 👑`
      );
      setUser(updatedProfile, session);
      qc.setQueryData(['profile'], updatedProfile);
      setBilling(updatedProfile?.subscription_billing_cycle ?? 'monthly');
      setShowCancelSheet(false);
      setShowActivateSheet(false);
      setPendingPlanKey(null);
      setPendingAction(null);

      if (wasFreeTier && tier !== 'free') {
        setSyncSheetPlan({ name: plan?.name ?? tier, color: plan?.color ?? C.primary });
        setShowSyncSheet(true);
      } else {
        setShowSuccess(true);
      }
    },
    onError: () => {
      setShowCancelSheet(false);
      setShowActivateSheet(false);
    },
  });

  const handleCTA = useCallback((planKey, action) => {
    if (isSuperAdmin) return;
    setPendingPlanKey(planKey);
    setPendingAction(action);

    if (action === 'cancel') {
      setShowCancelSheet(true);
    } else if (action === 'reactivate') {
      // Deep-link to platform; no DB call (platform fires server notification)
      openPlatformSubscriptions();
    } else if (action === 'activate' || action === 'upgrade') {
      setShowActivateSheet(true);
    }
  }, [isSuperAdmin]);

  const handleCancelConfirm = useCallback(() => {
    // Deep-link to platform; mark processing locally until platform notification arrives
    setActivatingKey('cancel');
    openPlatformSubscriptions();
    // Dismiss sheet after a brief delay (platform takes over from here)
    setTimeout(() => {
      setActivatingKey(null);
      setShowCancelSheet(false);
    }, 600);
  }, []);

  // Configure RevenueCat once, binding purchases to the Supabase user id.
  useEffect(() => {
    if (user?.id) configurePurchases(user.id);
  }, [user?.id]);

  const showUpgradeSuccess = useCallback((tier) => {
    const plan = PLANS.find(p => p.key === tier);
    const wasFreeTier = currentTier === 'free';
    setSuccessTitle(
      tier === 'free' ? 'Downgraded to Free'
        : pendingAction === 'upgrade' ? `Upgraded to ${plan?.name ?? tier}! 👑`
        : `${plan?.name ?? tier} Activated! 👑`
    );
    setShowCancelSheet(false);
    setShowActivateSheet(false);
    setPendingPlanKey(null);
    setPendingAction(null);
    if (wasFreeTier && tier !== 'free') {
      setSyncSheetPlan({ name: plan?.name ?? tier, color: plan?.color ?? C.primary });
      setShowSyncSheet(true);
    } else {
      setShowSuccess(true);
    }
  }, [currentTier, pendingAction, C.primary, session]);

  // Entitlement is applied by the RevenueCat webhook; poll the profile until the
  // new tier appears (or timeout), then update local auth/cache.
  const syncProfileAfterPurchase = useCallback(async (expectedTier) => {
    let updated = null;
    for (let i = 0; i < 6; i++) {
      updated = await apiGetProfile().catch(() => null);
      if (updated?.subscription_tier === expectedTier) break;
      await new Promise(r => setTimeout(r, 2000));
    }
    if (updated) {
      setUser(updated, session);
      qc.setQueryData(['profile'], updated);
    }
    return updated;
  }, [session, qc, setUser]);

  const handleRestore = useCallback(async () => {
    if (!isPurchasesAvailable()) return;
    setActivatingKey('restore');
    try {
      await restorePurchases();
      await syncProfileAfterPurchase(currentTier);
    } catch { /* nothing to restore */ }
    finally { setActivatingKey(null); }
  }, [currentTier, syncProfileAfterPurchase]);

  const handleActivateConfirm = useCallback(async () => {
    if (!pendingPlanKey) return;
    if (isPurchasesAvailable()) {
      // Real store purchase; entitlement is granted by the verified webhook.
      setActivatingKey(pendingPlanKey);
      try {
        await purchaseTier(pendingPlanKey, billing);
        const updated = await syncProfileAfterPurchase(pendingPlanKey);
        showUpgradeSuccess(updated?.subscription_tier ?? pendingPlanKey);
      } catch {
        setShowActivateSheet(false);   // user cancelled or purchase failed
      } finally {
        setActivatingKey(null);
      }
    } else if (process.env.NODE_ENV !== 'production') {
      // Dev/web fallback (no native store) — requires backend
      // DEV_ALLOW_CLIENT_SUBSCRIPTION=true. Lets us exercise the paywall UX.
      // updateSub manages its own activating spinner.
      updateSub({ tier: pendingPlanKey, subscription_status: 'active', billing_cycle: billing });
    } else {
      // Production without the native module (e.g. web) — send to the store.
      openPlatformSubscriptions();
      setShowActivateSheet(false);
    }
  }, [pendingPlanKey, billing, updateSub, syncProfileAfterPurchase, showUpgradeSuccess]);

  const currentPlan = PLANS.find(p => p.key === currentTier) ?? PLANS[0];
  const accentColor = currentPlan.color ?? C.primary;
  const pendingPlan = PLANS.find(p => p.key === pendingPlanKey) ?? null;

  // Timing display
  const startedLabel  = startedAt ? fmtDate(startedAt) : null;
  const expiresLabel  = expiresAt ? fmtDate(expiresAt) : null;
  let daysLeft = null;
  if (expiresAt) {
    daysLeft = Math.max(0, Math.ceil((new Date(expiresAt) - Date.now()) / 86400000));
  }

  const s = useMemo(() => makeStyles(C), [C]);

  return (
    <SafeAreaView applyTop style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? C.background : C.primary} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/settings')}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <BackIcon color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Subscription & Plans</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Superadmin info banner */}
      {isSuperAdmin && (
        <View style={[s.adminBanner, { backgroundColor: C.primaryLight, borderColor: C.primary + '44' }]}>
          <Text style={[s.adminBannerText, { color: C.primary, fontFamily: Font.semiBold }]}>
            👑 As an admin, all features are included at no cost. Plans are shown for reference only.
          </Text>
        </View>
      )}

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
      >
        {/* index 0 — current plan banner, scrolls away */}
        <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
          {/* Past-due payment warning */}
          {isPastDue && !isSuperAdmin && (
            <PastDueBanner C={C} />
          )}

          <View style={[s.banner, { backgroundColor: accentColor + '12', borderColor: accentColor + '44' }]}>
            {/* Top row: label + cycle chip */}
            <View style={s.bannerTopRow}>
              <Text style={[s.bannerLabel, { color: C.textMuted, fontFamily: Font.medium }]}>
                Your current plan
              </Text>
              {!isSuperAdmin && currentTier !== 'free' && (
                <View style={[s.cyclePill, { backgroundColor: accentColor + '22', borderColor: accentColor + '55' }]}>
                  <Text style={[s.cyclePillText, { color: accentColor, fontFamily: Font.bold }]}>
                    {currentBillingCycle === 'yearly' ? 'Yearly' : 'Monthly'}
                  </Text>
                </View>
              )}
            </View>

            {/* Plan name */}
            <View style={s.bannerTierRow}>
              <Text style={{ fontSize: 20, marginRight: 6 }}>👑</Text>
              <Text style={[s.bannerTier, { color: accentColor, fontFamily: Font.extraBold }]}>
                {isSuperAdmin ? 'Super Admin' : currentPlan.name}
              </Text>
              {isSuperAdmin && (
                <Text style={[s.bannerTierSub, { color: C.textMuted, fontFamily: Font.regular }]}>
                  {'  '}· All features included
                </Text>
              )}
              {!isSuperAdmin && currentTier === 'free' && (
                <Text style={[s.bannerTierSub, { color: C.textMuted, fontFamily: Font.regular }]}>
                  {'  '}· Always free
                </Text>
              )}
              {!isSuperAdmin && currentTier !== 'free' && cancelAtPeriodEnd && (
                <View style={[s.cancelledPill, { backgroundColor: C.danger + '18', borderColor: C.danger + '44' }]}>
                  <Text style={[s.cancelledPillText, { color: C.danger, fontFamily: Font.bold }]}>
                    Cancelled
                  </Text>
                </View>
              )}
            </View>

            {/* Timing row — paid plans only */}
            {!isSuperAdmin && currentTier !== 'free' && (
              <View style={[s.timingGrid, { borderTopColor: accentColor + '30' }]}>
                {startedLabel && (
                  <View style={s.timingCell}>
                    <Text style={[s.timingLabel, { color: C.textMuted, fontFamily: Font.medium }]}>Started</Text>
                    <Text style={[s.timingValue, { color: C.text, fontFamily: Font.semiBold }]}>{startedLabel}</Text>
                  </View>
                )}
                {startedLabel && <View style={[s.timingDivider, { backgroundColor: accentColor + '30' }]} />}
                <View style={s.timingCell}>
                  <Text style={[s.timingLabel, { color: C.textMuted, fontFamily: Font.medium }]}>
                    {cancelAtPeriodEnd ? 'Access until' : currentBillingCycle === 'yearly' ? 'Expires' : 'Renews'}
                  </Text>
                  <Text style={[s.timingValue, { color: C.text, fontFamily: Font.semiBold }]}>
                    {expiresLabel ?? '—'}
                  </Text>
                </View>
                {daysLeft !== null && (
                  <>
                    <View style={[s.timingDivider, { backgroundColor: accentColor + '30' }]} />
                    <View style={s.timingCell}>
                      <Text style={[s.timingLabel, { color: C.textMuted, fontFamily: Font.medium }]}>Days left</Text>
                      <Text style={[s.timingValue, { color: accentColor, fontFamily: Font.bold }]}>{daysLeft}</Text>
                    </View>
                  </>
                )}
              </View>
            )}
          </View>
        </View>

        {/* index 1 — sticky billing toggle */}
        <View style={[s.stickyToggle, { backgroundColor: C.background }]}>
          <BillingToggle billing={billing} onChange={setBilling} C={C} />
          {billing === 'yearly' && (
            <Text style={[s.yearlyNote, { color: C.textMuted, fontFamily: Font.regular }]}>
              Yearly plans save 30% — billed as one annual payment.
            </Text>
          )}
        </View>

        {/* index 2 — plan cards */}
        <View style={s.cardsWrap}>
          {PLANS.map(plan => (
            <PlanCard
              key={plan.key}
              plan={plan}
              currentTier={currentTier}
              subscriptionStatus={subscriptionStatus}
              expiresAt={expiresAt}
              billing={billing}
              isSuperAdmin={isSuperAdmin}
              isActivating={activatingKey === plan.key || activatingKey === 'cancel'}
              onCTA={handleCTA}
              C={C}
              primaryColor={C.primary}
            />
          ))}

          <Text style={[s.note, { color: C.textSubtle, fontFamily: Font.regular }]}>
            Subscriptions are managed through {PLATFORM_LABEL}. Tap any plan to open the payment flow.
          </Text>
          {isPurchasesAvailable() && !isSuperAdmin && (
            <TouchableOpacity onPress={handleRestore} activeOpacity={0.7} style={{ marginTop: 12 }}>
              <Text style={[s.note, { color: C.primary, fontFamily: Font.semiBold, marginTop: 0 }]}>
                Restore Purchases
              </Text>
            </TouchableOpacity>
          )}

          {/* Auto-renew disclosure — App Store Guideline 3.1.2 / Play billing policy */}
          <Text style={[s.disclosure, { color: C.textSubtle, fontFamily: Font.regular }]}>
            Payment is charged to your {PLATFORM_LABEL} account at confirmation of purchase.
            Subscriptions renew automatically for the same price and period unless cancelled at
            least 24 hours before the end of the current period. Manage or cancel anytime in your
            {' '}{PLATFORM_LABEL} account settings.
          </Text>

          <View style={s.legalRow}>
            <Text
              style={[s.legalLink, { color: C.primary, fontFamily: Font.semiBold }]}
              onPress={() => router.push('/(app)/settings/terms')}
            >
              Terms of Use
            </Text>
            <Text style={[s.legalDot, { color: C.textSubtle }]}>•</Text>
            <Text
              style={[s.legalLink, { color: C.primary, fontFamily: Font.semiBold }]}
              onPress={() => router.push('/(app)/settings/privacy-policy')}
            >
              Privacy Policy
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Cancel confirmation sheet */}
      <CancelSheet
        visible={showCancelSheet}
        planName={currentPlan.name}
        expiresAt={expiresAt}
        isLoading={activatingKey === 'cancel'}
        onDismiss={() => { setShowCancelSheet(false); setPendingPlanKey(null); setPendingAction(null); }}
        onConfirm={handleCancelConfirm}
        C={C}
      />

      {/* Activate / upgrade confirmation sheet */}
      <ActivateSheet
        visible={showActivateSheet}
        plan={pendingPlan}
        billing={billing}
        action={pendingAction}
        isLoading={!!activatingKey && activatingKey !== 'cancel'}
        onDismiss={() => { setShowActivateSheet(false); setPendingPlanKey(null); setPendingAction(null); }}
        onConfirm={handleActivateConfirm}
        C={C}
      />

      {/* Success dialog */}
      <SuccessDialog
        visible={showSuccess}
        onDismiss={() => setShowSuccess(false)}
        title={successTitle}
        subtitle="Your subscription has been updated"
      />

      {/* Post-upgrade: offer to sync local data to cloud */}
      <UpgradeSyncSheet
        visible={showSyncSheet}
        planName={syncSheetPlan?.name ?? ''}
        planColor={syncSheetPlan?.color ?? C.primary}
        onDismiss={() => { setShowSyncSheet(false); setShowSuccess(true); }}
        C={C}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeStyles = (C) => StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.background },
  scroll:        { flex: 1 },
  scrollContent: { paddingBottom: 48 },

  header: {
    backgroundColor: C.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: Font.bold, color: '#fff' },

  adminBanner: {
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderRadius: 14, borderWidth: 1.5,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  adminBannerText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },

  banner: {
    borderRadius: 18, borderWidth: 1.5,
    paddingHorizontal: 18, paddingTop: 16, paddingBottom: 0,
    marginBottom: 20, overflow: 'hidden',
  },
  bannerTopRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  bannerLabel:   { fontSize: 12 },
  cyclePill:     { borderRadius: 20, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 3 },
  cyclePillText: { fontSize: 11 },
  bannerTierRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 },
  bannerTier:    { fontSize: 26 },
  bannerTierSub: { fontSize: 14 },
  cancelledPill: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  cancelledPillText: { fontSize: 11 },

  timingGrid: {
    flexDirection: 'row', alignItems: 'stretch',
    borderTopWidth: 1, marginHorizontal: -18,
  },
  timingCell:    { flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 6 },
  timingDivider: { width: 1 },
  timingLabel:   { fontSize: 11, marginBottom: 4 },
  timingValue:   { fontSize: 13 },

  stickyToggle: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  cardsWrap:    { paddingHorizontal: 16, paddingTop: 16 },
  yearlyNote:   { fontSize: 12, textAlign: 'center', marginBottom: 4 },
  note:         { textAlign: 'center', fontSize: 12, marginTop: 4, paddingHorizontal: 16 },
  disclosure:   { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 18, paddingHorizontal: 16 },
  legalRow:     { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 10 },
  legalLink:    { fontSize: 12 },
  legalDot:     { fontSize: 12 },
});
