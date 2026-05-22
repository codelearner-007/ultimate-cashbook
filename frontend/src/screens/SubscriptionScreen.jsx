import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  StatusBar, Alert, ActivityIndicator, Modal, Animated,
} from 'react-native';
import SuccessDialog from '../components/ui/SuccessDialog';
import UpgradeSyncSheet from '../components/ui/UpgradeSyncSheet';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import { useTheme } from '../hooks/useTheme';
import { useAuthStore } from '../store/authStore';
import { apiUpdateSubscription } from '../lib/api';
import { Font } from '../constants/fonts';
import { PLAN_META } from '../constants/plans';

// ── Plan definitions — sourced from SUBSCRIPTION_PLANS.md ────────────────────

const PLANS = [
  {
    key:           'free',
    name:          'Free',
    monthly:       0,
    yearly:        0,
    yearlyLabel:   '$0',
    monthlyLabel:  '$0',
    crown:         PLAN_META.free.crown,
    color:         PLAN_META.free.color,  // null → resolved from C.primary at render time
    description:   'Perfect for getting started',
    rows: [
      { label: 'Cashbooks',        value: '3',         included: true  },
      { label: 'Entries',          value: 'Unlimited', included: true  },
      { label: 'Storage',          value: 'Local only', included: true  },
      { label: 'Multi-device',     value: 'No',        included: false },
      { label: 'PDF / Excel Export', value: 'No',      included: false },
      { label: 'Reports',          value: 'View only', included: true  },
      { label: 'Shared Books',     value: 'No',        included: false },
      { label: 'Backup History',   value: 'None',      included: false },
      { label: 'Guest Access',     value: 'No',        included: false },
    ],
  },
  {
    key:           'pro',
    name:          'Pro',
    monthly:       4.99,
    yearly:        41.99,
    yearlyLabel:   '$41.99 / yr',
    monthlyLabel:  '$4.99 / mo',
    crown:         PLAN_META.pro.crown,
    color:         PLAN_META.pro.color,
    description:   'For individuals who need more',
    rows: [
      { label: 'Cashbooks',        value: '15',              included: true  },
      { label: 'Entries',          value: 'Unlimited',       included: true  },
      { label: 'Storage',          value: 'Cloud sync',      included: true  },
      { label: 'Multi-device',     value: 'Yes',             included: true  },
      { label: 'PDF / Excel Export', value: 'Yes',           included: true  },
      { label: 'Reports',          value: 'Full access',     included: true  },
      { label: 'Shared Books',     value: 'Yes',             included: true  },
      { label: 'Backup History',   value: '7 days',          included: true  },
      { label: 'Guest Access',     value: '1 guest',         included: true  },
    ],
  },
  {
    key:           'business',
    name:          'Business',
    monthly:       9.99,
    yearly:        83.99,
    yearlyLabel:   '$83.99 / yr',
    monthlyLabel:  '$9.99 / mo',
    crown:         PLAN_META.business.crown,
    color:         PLAN_META.business.color,
    description:   'For teams & power users',
    rows: [
      { label: 'Cashbooks',        value: 'Unlimited',       included: true  },
      { label: 'Entries',          value: 'Unlimited',       included: true  },
      { label: 'Storage',          value: 'Cloud sync',      included: true  },
      { label: 'Multi-device',     value: 'Yes',             included: true  },
      { label: 'PDF / Excel Export', value: 'Yes',           included: true  },
      { label: 'Reports',          value: 'Full access',     included: true  },
      { label: 'Shared Books',     value: 'Yes',             included: true  },
      { label: 'Backup History',   value: '30 days',         included: true  },
      { label: 'Guest Access',     value: 'Up to 10 guests', included: true  },
    ],
  },
];

// ── Icons ─────────────────────────────────────────────────────────────────────

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

// ── Plan Card ─────────────────────────────────────────────────────────────────

/**
 * isCurrent      — same tier AND same billing cycle as active subscription
 * isSwitchCycle  — same tier BUT billing toggle shows a different cycle (show switch button)
 * onActivate(planKey, targetBilling) — called for both new activations and cycle switches
 */
function PlanCard({ plan, isCurrent, isSwitchCycle, isActivating, billing, onActivate, C, primaryColor }) {
  const accentColor  = plan.color ?? primaryColor;
  const dimmed       = '#9CA3AF';
  const price        = billing === 'yearly' ? plan.yearlyLabel : plan.monthlyLabel;
  const savingsBadge = billing === 'yearly' && plan.key !== 'free' && !isCurrent;

  return (
    <View style={[
      cardStyles.card,
      {
        backgroundColor: C.card,
        borderColor:     isCurrent ? accentColor : C.border,
        borderWidth:     isCurrent ? 2 : 1.5,
        shadowColor:     accentColor,
        shadowOpacity:   isCurrent ? 0.2 : 0.06,
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
              {isCurrent && (
                <View style={[cardStyles.currentBadge, { backgroundColor: accentColor + '22', borderColor: accentColor + '55' }]}>
                  <Text style={[cardStyles.currentBadgeText, { color: accentColor, fontFamily: Font.bold }]}>
                    Current Plan
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
            </>
          )}
          {billing === 'yearly' && plan.key !== 'free' && (
            <Text style={[cardStyles.priceNote, { color: C.textSubtle, fontFamily: Font.regular }]}>
              {'  '}(${(plan.monthly).toFixed(2)}/mo billed yearly)
            </Text>
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
      {isCurrent ? (
        /* Exact match — active plan + active billing cycle */
        <View style={[cardStyles.btnOutline, { borderColor: accentColor }]}>
          <Text style={[cardStyles.btnOutlineText, { color: accentColor, fontFamily: Font.semiBold }]}>
            ✓ Active Plan
          </Text>
        </View>
      ) : isSwitchCycle ? (
        /* Same tier, different billing cycle — solid filled, same style as Activate */
        <TouchableOpacity
          style={[cardStyles.btn, cardStyles.btnFlex, { backgroundColor: accentColor, opacity: isActivating ? 0.7 : 1 }]}
          onPress={() => onActivate(plan.key, billing)}
          disabled={isActivating}
          activeOpacity={0.85}
        >
          {isActivating
            ? <ActivityIndicator color="#fff" size="small" />
            : <>
                <Text style={[cardStyles.btnText, { fontFamily: Font.bold }]}>
                  Switch to {billing === 'yearly' ? 'Yearly' : 'Monthly'}
                </Text>
              </>
          }
        </TouchableOpacity>
      ) : (
        /* Different tier — normal activate / downgrade */
        <TouchableOpacity
          style={[cardStyles.btn, { backgroundColor: accentColor, opacity: isActivating ? 0.7 : 1 }]}
          onPress={() => onActivate(plan.key, billing)}
          disabled={isActivating}
          activeOpacity={0.85}
        >
          {isActivating
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={[cardStyles.btnText, { fontFamily: Font.bold }]}>
                {plan.key === 'free' ? 'Downgrade to Free' : `Activate ${plan.name}`}
              </Text>
          }
        </TouchableOpacity>
      )}
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

  btn:          { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnFlex:      { flexDirection: 'row', gap: 7 },
  btnText:      { fontSize: 14, color: '#fff', letterSpacing: 0.3 },
  btnOutline:   { height: 48, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  btnOutlineText: { fontSize: 14 },
});

// ── Proration calculator ──────────────────────────────────────────────────────

/**
 * For monthly → yearly upgrades of the same tier.
 * Returns { yearlyPrice, credit, daysLeft, amountToPay } or null if not applicable.
 */
function calculateProration(user, plan) {
  const startedAt = user?.subscription_started_at;
  if (!startedAt) return null;
  const daysUsed    = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 86400000));
  const daysLeft    = Math.max(0, 30 - daysUsed);
  const dailyRate   = plan.monthly / 30;
  const credit      = Math.round(dailyRate * daysLeft * 100) / 100;
  const amountToPay = Math.max(0, Math.round((plan.yearly - credit) * 100) / 100);
  return { yearlyPrice: plan.yearly, credit, daysLeft, amountToPay };
}

// ── Activate / Confirm sheet ──────────────────────────────────────────────────

/**
 * cycleSwitch: null | { toCycle, proration, renewDate }
 *   toCycle   — 'yearly' | 'monthly'
 *   proration — { yearlyPrice, credit, daysLeft, amountToPay } | null  (only for monthly→yearly)
 *   renewDate — formatted date string (for yearly→monthly, when monthly kicks in)
 */
function ActivatePlanSheet({ visible, plan, billing, currentTier, isLoading, onDismiss, onConfirm, cycleSwitch, C }) {
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

  const isDowngrade   = plan.key === 'free' && !cycleSwitch;
  const isCycleSwitch = !!cycleSwitch;
  const isToYearly    = cycleSwitch?.toCycle === 'yearly';
  const proration     = cycleSwitch?.proration ?? null;
  const accentColor   = plan.color ?? C.primary;
  const price         = billing === 'yearly' ? plan.yearlyLabel : plan.monthlyLabel;

  const confirmBtnColor = isDowngrade ? C.danger : accentColor;
  const confirmLabel = isLoading ? 'Processing…'
    : isCycleSwitch ? `Switch to ${isToYearly ? 'Yearly' : 'Monthly'}`
    : isDowngrade   ? 'Downgrade'
    : `Activate ${plan.name}`;
  return (
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, sheetS.dim, { opacity: bgOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
      </Animated.View>

      <View style={sheetS.anchor} pointerEvents="box-none">
        <Animated.View style={[sheetS.sheet, { backgroundColor: C.card, transform: [{ translateY: slideY }] }]}>
          <View style={[sheetS.handle, { backgroundColor: C.border }]} />

          {/* ── Title ── */}
          <Text style={[sheetS.title, { color: C.text, fontFamily: Font.bold }]}>
            {isCycleSwitch
              ? `Switch to ${isToYearly ? 'Yearly' : 'Monthly'} Billing`
              : isDowngrade ? 'Downgrade to Free?' : `Activate ${plan.name}`
            }
          </Text>

          {/* ── Plan name chip ── */}
          <View style={sheetS.chipRow}>
            <View style={[sheetS.chip, { backgroundColor: accentColor + '14', borderColor: accentColor + '44' }]}>
              {plan.crown && <Text style={{ fontSize: 13, marginRight: 3 }}>👑</Text>}
              <Text style={[sheetS.chipText, { color: accentColor, fontFamily: Font.semiBold }]}>
                {plan.name}{!isDowngrade ? `  ·  ${price}` : ''}
              </Text>
            </View>
          </View>

          {/* ══════════ MONTHLY → YEARLY (proration breakdown) ══════════ */}
          {isCycleSwitch && isToYearly && proration ? (
            <View style={[sheetS.breakdownCard, { backgroundColor: C.background, borderColor: C.border }]}>

              {/* Full yearly price — struck through */}
              <View style={sheetS.bdRow}>
                <View style={sheetS.bdLeft}>
                  <Text style={[sheetS.bdLabel, { color: C.textMuted, fontFamily: Font.regular }]}>
                    Yearly plan
                  </Text>
                  <Text style={[sheetS.bdSub, { color: C.textSubtle, fontFamily: Font.regular }]}>
                    Full price
                  </Text>
                </View>
                <Text style={[sheetS.bdStrike, { color: C.textSubtle, fontFamily: Font.regular }]}>
                  ${proration.yearlyPrice.toFixed(2)}
                </Text>
              </View>

              {/* Credit row */}
              <View style={[sheetS.bdDivider, { backgroundColor: C.border }]} />
              <View style={sheetS.bdRow}>
                <View style={sheetS.bdLeft}>
                  <View style={sheetS.creditBadge}>
                    <Text style={[sheetS.creditBadgeText, { color: '#10B981', fontFamily: Font.bold }]}>
                      CREDIT
                    </Text>
                  </View>
                  <Text style={[sheetS.bdSub, { color: C.textSubtle, fontFamily: Font.regular }]}>
                    {proration.daysLeft} days remaining in current month
                  </Text>
                </View>
                <Text style={[sheetS.bdCredit, { color: '#10B981', fontFamily: Font.bold }]}>
                  −${proration.credit.toFixed(2)}
                </Text>
              </View>

              {/* You pay — highlighted total */}
              <View style={[sheetS.totalBand, { backgroundColor: accentColor + '12' }]}>
                <Text style={[sheetS.totalLabel, { color: C.text, fontFamily: Font.semiBold }]}>
                  You pay today
                </Text>
                <Text style={[sheetS.totalValue, { color: accentColor, fontFamily: Font.extraBold }]}>
                  ${proration.amountToPay.toFixed(2)}
                </Text>
              </View>

              {/* Savings note */}
              <View style={sheetS.savingsRow}>
                <Text style={[sheetS.savingsText, { color: '#10B981', fontFamily: Font.medium }]}>
                  ✓ You save ${proration.credit.toFixed(2)} vs paying the full yearly price
                </Text>
              </View>
            </View>

          ) : /* ══════════ YEARLY → MONTHLY ══════════ */ isCycleSwitch && !isToYearly ? (
            <View style={[sheetS.breakdownCard, { backgroundColor: C.background, borderColor: C.border }]}>
              <View style={sheetS.bdRow}>
                <View style={sheetS.bdLeft}>
                  <Text style={[sheetS.bdLabel, { color: C.textMuted, fontFamily: Font.regular }]}>
                    Current plan active until
                  </Text>
                </View>
                <Text style={[sheetS.bdValue, { color: C.text, fontFamily: Font.semiBold }]}>
                  {cycleSwitch.renewDate ?? '—'}
                </Text>
              </View>
              <View style={[sheetS.bdDivider, { backgroundColor: C.border }]} />
              <View style={sheetS.bdRow}>
                <View style={sheetS.bdLeft}>
                  <Text style={[sheetS.bdLabel, { color: C.textMuted, fontFamily: Font.regular }]}>
                    Monthly billing starts
                  </Text>
                </View>
                <Text style={[sheetS.bdValue, { color: accentColor, fontFamily: Font.bold }]}>
                  ${plan.monthly.toFixed(2)} / mo
                </Text>
              </View>
              <View style={sheetS.savingsRow}>
                <Text style={[sheetS.savingsText, { color: C.textMuted, fontFamily: Font.regular }]}>
                  No charge today — switch takes effect at renewal
                </Text>
              </View>
            </View>

          ) : /* ══════════ NORMAL ACTIVATION / DOWNGRADE ══════════ */ (
            <Text style={[sheetS.body, { color: C.textMuted, fontFamily: Font.regular }]}>
              {isDowngrade
                ? 'You will immediately lose access to Pro & Business features. Your data stays safe.'
                : `Your ${plan.name} plan will be activated instantly.\nPayment gateway coming soon.`
              }
            </Text>
          )}

          {/* ── Buttons ── */}
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
              style={[sheetS.btn, sheetS.btnFill, { backgroundColor: confirmBtnColor, opacity: isLoading ? 0.7 : 1 }]}
              onPress={onConfirm}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading && <ActivityIndicator size="small" color="#fff" />}
              <Text style={[sheetS.btnText, { color: '#fff', fontFamily: Font.bold }]}>
                {isLoading ? 'Processing…' : confirmLabel}
                {isCycleSwitch && isToYearly && proration && !isLoading
                  ? `  —  $${proration.amountToPay.toFixed(2)}`
                  : ''
                }
              </Text>
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
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 24 },

  // Icon at top
  iconRow:    { alignItems: 'center', marginBottom: 16 },
  iconCircle: {
    width: 64, height: 64, borderRadius: 20, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  iconEmoji:  { fontSize: 28, lineHeight: 34 },

  // Title + chip
  title:    { fontSize: 20, textAlign: 'center', marginBottom: 10, letterSpacing: 0.2 },
  chipRow:  { alignItems: 'center', marginBottom: 20 },
  chip: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  chipText: { fontSize: 14 },

  // Normal body (activation / downgrade)
  body: { fontSize: 13, lineHeight: 20, textAlign: 'center', marginBottom: 24, paddingHorizontal: 4 },

  // ── Proration / Yearly→Monthly breakdown card ──
  breakdownCard: {
    borderRadius: 16, borderWidth: 1.5, overflow: 'hidden', marginBottom: 20,
  },
  bdRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
  },
  bdLeft:   { flex: 1, marginRight: 12 },
  bdLabel:  { fontSize: 13, lineHeight: 18 },
  bdSub:    { fontSize: 11, marginTop: 2, lineHeight: 15 },
  bdDivider:{ height: 1 },
  bdStrike: { fontSize: 16, textDecorationLine: 'line-through' },
  bdCredit: { fontSize: 16 },
  bdValue:  { fontSize: 15 },

  // Credit badge pill
  creditBadge: {
    alignSelf: 'flex-start', borderRadius: 6,
    backgroundColor: '#10B98118', paddingHorizontal: 7, paddingVertical: 2, marginBottom: 4,
  },
  creditBadgeText: { fontSize: 10, letterSpacing: 0.6 },

  // "You pay today" highlighted band
  totalBand: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  totalLabel: { fontSize: 14 },
  totalValue: { fontSize: 26 },

  // Savings / info note at bottom of card
  savingsRow: { paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4 },
  savingsText:{ fontSize: 12, lineHeight: 17 },

  // Buttons
  btnRow: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1, paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 7,
  },
  btnFill: { borderWidth: 0 },
  btnText: { fontSize: 13 },
});

// ── Billing Toggle ────────────────────────────────────────────────────────────

function BillingToggle({ billing, onChange, C }) {
  return (
    <View style={[toggleStyles.wrap, { backgroundColor: C.card, borderColor: C.border }]}>
      {['monthly', 'yearly'].map(cycle => (
        <TouchableOpacity
          key={cycle}
          style={[
            toggleStyles.pill,
            billing === cycle && { backgroundColor: C.primary },
          ]}
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
  wrap:  { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 3, marginBottom: 0 },
  pill:  { flex: 1, paddingVertical: 8, borderRadius: 11, alignItems: 'center' },
  label: { fontSize: 13 },
});

// ── Timing helpers ────────────────────────────────────────────────────────────

const DATE_FMT = { month: 'short', day: 'numeric', year: 'numeric' };

function fmtDate(d) {
  return d.toLocaleDateString('en-US', DATE_FMT);
}

function getRenewalDate(startedAt, cycle) {
  const d = new Date(startedAt);
  if (cycle === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

function useSubscriptionTiming(user) {
  const tier    = user?.subscription_tier ?? 'free';
  const started = user?.subscription_started_at ?? null;
  const cycle   = user?.subscription_billing_cycle ?? 'monthly';

  if (tier === 'free' || !started) return { started: null, renews: null, cycle, daysLeft: null };

  const startDate  = new Date(started);
  const renewDate  = getRenewalDate(started, cycle);
  const daysLeft   = Math.max(0, Math.ceil((renewDate - Date.now()) / 86400000));

  return {
    started:  fmtDate(startDate),
    renews:   fmtDate(renewDate),
    cycle,
    daysLeft,
  };
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function SubscriptionScreen() {
  const router   = useRouter();
  const { C }    = useTheme();
  const qc       = useQueryClient();

  const user    = useAuthStore(s => s.user);
  const session = useAuthStore(s => s.session);
  const setUser = useAuthStore(s => s.setUser);

  const currentTier         = user?.subscription_tier          ?? 'free';
  const currentBillingCycle = user?.subscription_billing_cycle  ?? 'monthly';

  // Default billing toggle to the user's active cycle so the current plan looks "active" immediately
  const [billing,          setBilling]          = useState(() => currentBillingCycle);
  const [showSyncSheet,    setShowSyncSheet]    = useState(false);
  const [syncSheetPlan,    setSyncSheetPlan]    = useState(null);  // { name, color }
  const [pendingTier,      setPendingTier]      = useState(null);
  const [pendingCycle,     setPendingCycle]      = useState('monthly');
  const [pendingCycleSwitch, setPendingCycleSwitch] = useState(null); // { toCycle, proration, renewDate } | null
  const [showConfirmSheet,  setShowConfirmSheet]  = useState(false);
  const [showSuccess,       setShowSuccess]       = useState(false);
  const [activatingKey,     setActivatingKey]     = useState(null);
  const [successTitle,      setSuccessTitle]      = useState('');
  const [successSpinColor,  setSuccessSpinColor]  = useState(null);

  const { mutate: activatePlan } = useMutation({
    mutationFn: apiUpdateSubscription,
    onMutate:   ({ tier }) => setActivatingKey(tier),
    onSettled:  ()         => setActivatingKey(null),
    onSuccess:  (updatedProfile) => {
      const tier        = updatedProfile?.subscription_tier          ?? 'free';
      const cycle       = updatedProfile?.subscription_billing_cycle ?? 'monthly';
      const plan        = PLANS.find(p => p.key === tier);
      const isCycleOnly = pendingCycleSwitch != null;
      const wasFreeTier = currentTier === 'free';

      setSuccessTitle(
        tier === 'free'  ? 'Downgraded to Free' :
        isCycleOnly      ? `Switched to ${cycle === 'yearly' ? 'Yearly' : 'Monthly'} Billing` :
                           `${plan?.name ?? tier} Activated! 👑`
      );
      setSuccessSpinColor(isCycleOnly ? (plan?.color ?? C.primary) : null);
      setUser(updatedProfile, session);
      qc.setQueryData(['profile'], updatedProfile);
      setBilling(cycle);
      setShowConfirmSheet(false);
      setPendingTier(null);
      setPendingCycleSwitch(null);

      // Show the upload-local-data sheet when a free user upgrades to a paid tier
      if (wasFreeTier && tier !== 'free' && !isCycleOnly) {
        setSyncSheetPlan({ name: plan?.name ?? tier, color: plan?.color ?? C.primary });
        setShowSyncSheet(true);
      } else {
        setShowSuccess(true);
      }
    },
    onError: () => Alert.alert('Error', 'Could not update subscription. Please try again.'),
  });

  /**
   * handleActivate(planKey, targetBilling)
   * Detects whether this is a same-tier cycle switch or a new tier activation,
   * builds the appropriate cycleSwitch payload, then opens the confirm sheet.
   */
  const handleActivate = (planKey, targetBilling) => {
    const plan          = PLANS.find(p => p.key === planKey);
    const sameTier      = planKey === currentTier;
    const sameCycle     = targetBilling === currentBillingCycle;

    if (sameTier && sameCycle) return; // already on this exact plan+cycle

    setPendingTier(planKey);
    setPendingCycle(targetBilling);

    if (sameTier && !sameCycle) {
      // Billing cycle switch — same tier
      const isToYearly = targetBilling === 'yearly';
      const proration  = isToYearly && currentBillingCycle === 'monthly'
        ? calculateProration(user, plan)
        : null;
      const renewDate  = !isToYearly ? timing.renews : null; // "effective at renewal" date
      setPendingCycleSwitch({ toCycle: targetBilling, proration, renewDate });
    } else {
      // Different tier
      setPendingCycleSwitch(null);
    }

    setShowConfirmSheet(true);
  };

  const pendingPlan = PLANS.find(p => p.key === pendingTier) ?? null;

  const currentPlan = PLANS.find(p => p.key === currentTier) ?? PLANS[0];
  const accentColor = currentPlan.color ?? C.primary;
  const timing      = useSubscriptionTiming(user);

  const s = useMemo(() => makeStyles(C), [C]);

  return (
    <SafeAreaView applyTop style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

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

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
      >
        {/* index 0 — current plan card, scrolls away */}
        <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
          <View style={[s.banner, { backgroundColor: accentColor + '12', borderColor: accentColor + '44' }]}>

            {/* Top row: label + cycle chip */}
            <View style={s.bannerTopRow}>
              <Text style={[s.bannerLabel, { color: C.textMuted, fontFamily: Font.medium }]}>
                Your current plan
              </Text>
              {currentTier !== 'free' && (
                <View style={[s.cyclePill, { backgroundColor: accentColor + '22', borderColor: accentColor + '55' }]}>
                  <Text style={[s.cyclePillText, { color: accentColor, fontFamily: Font.bold }]}>
                    {timing.cycle === 'yearly' ? 'Yearly' : 'Monthly'}
                  </Text>
                </View>
              )}
            </View>

            {/* Plan name */}
            <View style={s.bannerTierRow}>
              {currentTier !== 'free' && <Text style={{ fontSize: 20, marginRight: 6 }}>👑</Text>}
              <Text style={[s.bannerTier, { color: accentColor, fontFamily: Font.extraBold }]}>
                {currentPlan.name}
              </Text>
              {currentTier === 'free' && (
                <Text style={[s.bannerTierSub, { color: C.textMuted, fontFamily: Font.regular }]}>
                  {'  '}· Always free
                </Text>
              )}
            </View>

            {/* Timing rows — only for paid plans */}
            {currentTier !== 'free' && (
              <View style={[s.timingGrid, { borderTopColor: accentColor + '30' }]}>
                <View style={s.timingCell}>
                  <Text style={[s.timingLabel, { color: C.textMuted, fontFamily: Font.medium }]}>
                    Started
                  </Text>
                  <Text style={[s.timingValue, { color: C.text, fontFamily: Font.semiBold }]}>
                    {timing.started ?? '—'}
                  </Text>
                </View>
                <View style={[s.timingDivider, { backgroundColor: accentColor + '30' }]} />
                <View style={s.timingCell}>
                  <Text style={[s.timingLabel, { color: C.textMuted, fontFamily: Font.medium }]}>
                    {timing.cycle === 'yearly' ? 'Expires' : 'Renews'}
                  </Text>
                  <Text style={[s.timingValue, { color: C.text, fontFamily: Font.semiBold }]}>
                    {timing.renews ?? '—'}
                  </Text>
                </View>
                <View style={[s.timingDivider, { backgroundColor: accentColor + '30' }]} />
                <View style={s.timingCell}>
                  <Text style={[s.timingLabel, { color: C.textMuted, fontFamily: Font.medium }]}>
                    Days left
                  </Text>
                  <Text style={[s.timingValue, { color: accentColor, fontFamily: Font.bold }]}>
                    {timing.daysLeft ?? '—'}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* index 1 — sticks to top after banner scrolls off */}
        <View style={[s.stickyToggle, { backgroundColor: C.background }]}>
          <BillingToggle billing={billing} onChange={setBilling} C={C} />
          {billing === 'yearly' && (
            <Text style={[s.yearlyNote, { color: C.textMuted, fontFamily: Font.regular }]}>
              Yearly plans save 30% — billed as one annual payment.
            </Text>
          )}
        </View>

        {/* index 2 — plan cards + footer */}
        <View style={s.cardsWrap}>
          {PLANS.map(plan => (
            <PlanCard
              key={plan.key}
              plan={plan}
              isCurrent={
                plan.key === currentTier && (
                  plan.key === 'free' || billing === currentBillingCycle
                )
              }
              isSwitchCycle={
                plan.key === currentTier &&
                plan.key !== 'free' &&
                billing !== currentBillingCycle
              }
              isActivating={activatingKey === plan.key}
              billing={billing}
              onActivate={handleActivate}
              C={C}
              primaryColor={C.primary}
            />
          ))}

          <Text style={[s.note, { color: C.textSubtle, fontFamily: Font.regular }]}>
            Payment gateway coming soon. Plans activate instantly for now.
          </Text>
        </View>
      </ScrollView>

      {/* Activate / cycle-switch / downgrade confirmation sheet */}
      <ActivatePlanSheet
        visible={showConfirmSheet}
        plan={pendingPlan}
        billing={pendingCycle}
        currentTier={currentTier}
        isLoading={!!activatingKey}
        cycleSwitch={pendingCycleSwitch}
        onDismiss={() => { setShowConfirmSheet(false); setPendingTier(null); setPendingCycleSwitch(null); }}
        onConfirm={() => pendingTier && activatePlan({ tier: pendingTier, billing_cycle: pendingCycle })}
        C={C}
      />

      {/* Success dialog — same as ProfileScreen */}
      <SuccessDialog
        visible={showSuccess}
        onDismiss={() => setShowSuccess(false)}
        title={successTitle}
        subtitle="Your subscription has been updated"
        spinIcon={successSpinColor}
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
  safe:   { flex: 1, backgroundColor: C.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 48 },

  stickyToggle: {
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
  },
  cardsWrap: { paddingHorizontal: 16, paddingTop: 16 },

  header: {
    backgroundColor: C.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: Font.bold, color: '#fff' },

  banner: {
    borderRadius: 18, borderWidth: 1.5,
    paddingHorizontal: 18, paddingTop: 16, paddingBottom: 0,
    marginBottom: 20, overflow: 'hidden',
  },
  bannerTopRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  bannerLabel:   { fontSize: 12 },
  cyclePill:     { borderRadius: 20, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 3 },
  cyclePillText: { fontSize: 11 },
  bannerTierRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  bannerTier:    { fontSize: 26 },
  bannerTierSub: { fontSize: 14 },

  timingGrid: {
    flexDirection: 'row', alignItems: 'stretch',
    borderTopWidth: 1, marginHorizontal: -18,
  },
  timingCell: {
    flex: 1, alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 6,
  },
  timingDivider: { width: 1 },
  timingLabel:   { fontSize: 11, marginBottom: 4 },
  timingValue:   { fontSize: 13 },

  yearlyNote: { fontSize: 12, textAlign: 'center', marginBottom: 4 },
  note:       { textAlign: 'center', fontSize: 12, marginTop: 4, paddingHorizontal: 16 },
});
