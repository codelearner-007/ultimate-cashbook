import { useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  Platform,
} from 'react-native';
import { Font } from '../constants/fonts';
import { Feather } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

// Exact tokens from LightColors in colors.js
const C = {
  primary:         '#39AAAA',
  primaryDark:     '#2B8080',
  primaryLight:    '#F4FAFA',
  onPrimary:       '#FFFFFF',
  onPrimaryMuted:  'rgba(255,255,255,0.72)',
  onPrimarySubtle: 'rgba(255,255,255,0.45)',
  onPrimaryIconBg: 'rgba(255,255,255,0.20)',
  cashIn:          '#15803D',
  cashInLight:     '#DCFCE7',
  cashOut:         '#B91C1C',
  cashOutLight:    '#FEE2E2',
  danger:          '#B91C1C',
  background:      '#F8FAFC',
  card:            '#FFFFFF',
  cardAlt:         '#F1F5F9',
  text:            '#0F172A',
  textMuted:       '#64748B',
  textSubtle:      '#94A3B8',
  border:          '#E2E8F0',
};

const CARD_ACCENTS = ['#39AAAA', '#6366F1', '#F59E0B', '#EC4899', '#10B981', '#F97316'];

// The card is the full visual area for each slide illustration
const CARD_W = width - 40;
const CARD_H = height * 0.54;

// ── Shared sub-components ─────────────────────────────────────────────────────

function Header({ title, subtitle, rightIcons = [], backLabel }) {
  return (
    <View style={{ backgroundColor: C.primary, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.onPrimaryIconBg, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
        <Text style={{ fontSize: 18, color: C.onPrimary, lineHeight: 22 }}>‹</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontFamily: Font.bold, color: C.onPrimary }} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={{ fontSize: 10, fontFamily: Font.regular, color: C.onPrimaryMuted, marginTop: 1 }} numberOfLines={1}>{subtitle}</Text>}
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {rightIcons.map((icon, i) => (
          <View key={i} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.onPrimaryIconBg, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name={icon} size={14} color={C.onPrimary} />
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Slide 1: BooksScreen ──────────────────────────────────────────────────────

function BooksSlide() {
  const books = [
    { name: 'Grocery Shop',     initials: 'GS', balance: '+12,450', accent: CARD_ACCENTS[0] },
    { name: 'Medical Store',    initials: 'MS', balance: '+8,200',  accent: CARD_ACCENTS[1] },
    { name: 'Textile Business', initials: 'TB', balance: '-3,100',  accent: CARD_ACCENTS[2] },
  ];
  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      {/* Primary header with balance */}
      <View style={{ backgroundColor: C.primary, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 }}>
        {/* Top row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.onPrimaryIconBg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontFamily: Font.extraBold, color: C.onPrimary }}>AK</Text>
            </View>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 13, fontFamily: Font.bold, color: C.onPrimary }}>Arham Khan</Text>
                <View style={{ backgroundColor: C.onPrimaryIconBg, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 8, fontFamily: Font.bold, color: C.onPrimary, letterSpacing: 0.4 }}>FREE</Text>
                </View>
              </View>
              <Text style={{ fontSize: 10, fontFamily: Font.regular, color: C.onPrimaryMuted }}>Personal Workspace</Text>
            </View>
          </View>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.onPrimaryIconBg, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="moon" size={15} color={C.onPrimary} />
          </View>
        </View>
        {/* Balance */}
        <View style={{ alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ fontSize: 9, fontFamily: Font.semiBold, color: C.onPrimaryMuted, letterSpacing: 1.4, marginBottom: 4 }}>TOTAL NET BALANCE</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Text style={{ fontSize: 11, fontFamily: Font.medium, color: C.onPrimaryMuted }}>₨</Text>
            <Text style={{ fontSize: 26, fontFamily: Font.extraBold, color: C.onPrimary, letterSpacing: -1, lineHeight: 32 }}>17,550</Text>
          </View>
          <View style={{ width: 40, height: 2.5, borderRadius: 2, backgroundColor: C.onPrimarySubtle }} />
        </View>
        {/* Stats */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, fontFamily: Font.bold, color: C.onPrimary, marginBottom: 1 }}>3</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.onPrimary }} />
              <Text style={{ fontSize: 10, fontFamily: Font.medium, color: C.onPrimaryMuted }}>My Books</Text>
            </View>
          </View>
          <View style={{ width: 1, height: 28, backgroundColor: C.onPrimaryIconBg }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, fontFamily: Font.bold, color: C.onPrimary, marginBottom: 1 }}>0</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.onPrimaryMuted }} />
              <Text style={{ fontSize: 10, fontFamily: Font.medium, color: C.onPrimaryMuted }}>Shared Books</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Section label */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 }}>
        <Text style={{ fontSize: 13, fontFamily: Font.bold, color: C.text }}>My Cash Books</Text>
        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: C.primaryLight }}>
          <Text style={{ fontSize: 11, fontFamily: Font.semiBold, color: C.primary }}>Sort</Text>
        </View>
      </View>

      {/* Book cards */}
      {books.map((b, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, marginHorizontal: 14, marginBottom: 7, borderRadius: 40, paddingVertical: 5, paddingLeft: 5, paddingRight: 12, borderWidth: 1.5, borderColor: C.border }}>
          <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginRight: 10, backgroundColor: b.accent + '18' }}>
            <Text style={{ fontSize: 12, fontFamily: Font.extraBold, color: b.accent }}>{b.initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontFamily: Font.semiBold, color: C.text }}>{b.name}</Text>
            <Text style={{ fontSize: 11, fontFamily: Font.regular, color: C.textMuted, marginTop: 1 }}>Updated today</Text>
          </View>
          <View style={{ borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: C.cardAlt }}>
            <Text style={{ fontSize: 12, fontFamily: Font.bold, color: b.balance.startsWith('+') ? C.cashIn : C.danger }}>{b.balance}</Text>
          </View>
        </View>
      ))}

      {/* FAB */}
      <View style={{ alignSelf: 'center', marginTop: 6, backgroundColor: C.primary, borderRadius: 28, paddingHorizontal: 24, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Feather name="plus" size={15} color={C.onPrimary} />
        <Text style={{ color: C.onPrimary, fontFamily: Font.extraBold, fontSize: 12, letterSpacing: 0.8 }}>ADD NEW BOOK</Text>
      </View>
    </View>
  );
}

// ── Slide 2: BookDetailScreen ─────────────────────────────────────────────────

function BookDetailSlide() {
  const entries = [
    { remark: 'Milk Purchase', mode: 'Cash',   modeBg: C.primaryLight, modeText: C.primary,  cat: 'Purchase', time: '9:30 AM',  amt: '-850',    isIn: false },
    { remark: 'Morning Sale',  mode: 'Online', modeBg: '#E8F5E9',      modeText: '#1B5E20',  cat: 'Sales',    time: '11:15 AM', amt: '+4,200',  isIn: true  },
    { remark: 'Staff Salary',  mode: 'Cash',   modeBg: C.primaryLight, modeText: C.primary,  cat: 'Salary',   time: '2:00 PM',  amt: '-12,000', isIn: false },
    { remark: 'Counter Sale',  mode: 'Cash',   modeBg: C.primaryLight, modeText: C.primary,  cat: 'Sales',    time: '5:45 PM',  amt: '+2,750',  isIn: true  },
  ];

  const chips = ['All', 'Date', 'Type', 'Category', 'Payment'];

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      {/* Header */}
      <View style={{ backgroundColor: C.primary, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.onPrimaryIconBg, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
          <Text style={{ fontSize: 18, color: C.onPrimary, lineHeight: 22 }}>‹</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontFamily: Font.bold, color: C.onPrimary }}>Grocery Shop</Text>
          <Text style={{ fontSize: 10, fontFamily: Font.regular, color: C.onPrimaryMuted }}>Add Member, Book Activity etc</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {['user-plus', 'more-vertical'].map((icon, i) => (
            <View key={i} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.onPrimaryIconBg, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name={icon} size={14} color={C.onPrimary} />
            </View>
          ))}
        </View>
      </View>

      {/* Search bar */}
      <View style={{ marginHorizontal: 14, marginTop: 8, marginBottom: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 7, gap: 7 }}>
        <Feather name="search" size={13} color={C.textSubtle} />
        <Text style={{ fontSize: 12, fontFamily: Font.regular, color: C.textSubtle }}>Search by remark or amount…</Text>
      </View>

      {/* Filter chips */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingBottom: 7, gap: 5 }}>
        {chips.map((label, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 16, backgroundColor: i === 0 ? C.primary : C.card, borderWidth: 1, borderColor: i === 0 ? C.primary : C.border }}>
            <Feather name={['layers','calendar','repeat','tag','credit-card'][i]} size={10} color={i === 0 ? '#fff' : C.textMuted} />
            <Text style={{ fontSize: 10, fontFamily: Font.semiBold, color: i === 0 ? '#fff' : C.textMuted }}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Balance card */}
      <View style={{ backgroundColor: C.card, marginHorizontal: 14, marginBottom: 7, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: C.border, alignItems: 'center' }}>
        <Text style={{ fontSize: 10, fontFamily: Font.medium, color: C.textMuted, marginBottom: 1 }}>Net Balance</Text>
        <Text style={{ fontSize: 22, fontFamily: Font.extraBold, color: C.cashIn, lineHeight: 28, marginBottom: 5 }}>12,450</Text>
        <View style={{ height: 1, backgroundColor: C.border, width: '100%', marginBottom: 5 }} />
        <View style={{ flexDirection: 'row', width: '100%', marginBottom: 4 }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 9, fontFamily: Font.regular, color: C.textMuted, marginBottom: 2 }}>Total In (+)</Text>
            <Text style={{ fontSize: 12, fontFamily: Font.bold, color: C.cashIn }}>24,600</Text>
          </View>
          <View style={{ width: 1, height: 24, backgroundColor: C.border, marginHorizontal: 10 }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 9, fontFamily: Font.regular, color: C.textMuted, marginBottom: 2 }}>Total Out (-)</Text>
            <Text style={{ fontSize: 12, fontFamily: Font.bold, color: C.danger }}>12,150</Text>
          </View>
        </View>
        <Text style={{ color: C.primary, fontFamily: Font.bold, fontSize: 11, letterSpacing: 0.3 }}>VIEW REPORTS  ›</Text>
      </View>

      {/* Date row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 4 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontFamily: Font.bold, color: C.text }}>Today</Text>
          <Text style={{ fontSize: 10, fontFamily: Font.regular, color: C.textMuted }}>1 Jun 2026</Text>
        </View>
        <Text style={{ fontSize: 12, fontFamily: Font.bold, color: C.cashIn }}>+5,100</Text>
      </View>

      {/* Entries */}
      <View style={{ marginHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 7 }}>
        {entries.map((e, i) => (
          <View key={i} style={[{ backgroundColor: C.card, paddingHorizontal: 12, paddingVertical: 7, flexDirection: 'row', alignItems: 'center' }, i < entries.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border }]}>
            <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, marginRight: 8, minWidth: 44, alignItems: 'center', backgroundColor: e.modeBg }}>
              <Text style={{ fontSize: 9, fontFamily: Font.bold, color: e.modeText }}>{e.mode}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontFamily: Font.semiBold, color: C.text }}>{e.remark}</Text>
              <Text style={{ fontSize: 9, fontFamily: Font.regular, color: C.textMuted }}>{e.cat}  ·  {e.time}</Text>
            </View>
            <Text style={{ fontSize: 12, fontFamily: Font.medium, color: e.isIn ? C.cashIn : C.danger, minWidth: 50, textAlign: 'right' }}>{e.amt}</Text>
          </View>
        ))}
      </View>

      {/* Cash In / Cash Out */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 14, gap: 8, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 9 }}>
        <View style={{ flex: 1, borderRadius: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.cashIn }}>
          <Feather name="plus-circle" size={13} color="#fff" />
          <Text style={{ color: '#fff', fontFamily: Font.extraBold, fontSize: 11, letterSpacing: 0.6 }}>CASH IN</Text>
        </View>
        <View style={{ flex: 1, borderRadius: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.danger }}>
          <Feather name="minus-circle" size={13} color="#fff" />
          <Text style={{ color: '#fff', fontFamily: Font.extraBold, fontSize: 11, letterSpacing: 0.6 }}>CASH OUT</Text>
        </View>
      </View>
    </View>
  );
}

// ── Slide 3: ReportsScreen ────────────────────────────────────────────────────

function ReportsSlide() {
  const BAR_H = 64;
  const bars = [
    { label: 'Income',   amt: '24,600', color: C.cashIn,  fill: 1.0  },
    { label: 'Expenses', amt: '12,150', color: C.danger,  fill: 0.49 },
    { label: 'Net',      amt: '12,450', color: C.primary, fill: 0.51 },
  ];
  const entries = [
    { remark: 'Morning Sale',  meta: '1 Jun · Sales · Cash',   amt: '+4,200', isIn: true  },
    { remark: 'Milk Purchase', meta: '1 Jun · Purchase · Cash', amt: '-850',   isIn: false },
    { remark: 'Counter Sale',  meta: '1 Jun · Sales · Online',  amt: '+2,750', isIn: true  },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      {/* Header */}
      <View style={{ backgroundColor: C.primary, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ padding: 4, marginRight: 6 }}>
          <Text style={{ fontSize: 22, color: C.onPrimary, lineHeight: 26 }}>‹</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, color: C.onPrimary, fontFamily: Font.bold }}>Reports</Text>
          <Text style={{ fontSize: 10, color: C.onPrimaryMuted, fontFamily: Font.regular }}>Grocery Shop</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {['PDF', 'XLS'].map(lbl => (
            <View key={lbl} style={{ backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.30)' }}>
              <Text style={{ fontSize: 11, fontFamily: Font.bold, color: '#fff', letterSpacing: 0.4 }}>{lbl}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Range */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginTop: 10, marginBottom: 8 }}>
        <Text style={{ fontSize: 12, marginRight: 5 }}>📅</Text>
        <Text style={{ fontSize: 11, color: C.textMuted, fontFamily: Font.medium }}>This Month  ·  7 transactions</Text>
      </View>

      {/* Chart card */}
      <View style={{ backgroundColor: C.card, marginHorizontal: 14, borderRadius: 14, padding: 14, marginBottom: 10, elevation: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ fontSize: 13, fontFamily: Font.bold, color: C.text }}>Financial Summary</Text>
          <Text style={{ fontSize: 10, color: C.textMuted, fontFamily: Font.regular }}>7 transactions</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          {bars.map((b, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 10, fontFamily: Font.extraBold, color: b.color, textAlign: 'center', marginBottom: 3 }}>{b.amt}</Text>
              <Text style={{ fontSize: 9, color: C.textMuted, fontFamily: Font.medium, marginBottom: 6 }}>{b.label}</Text>
              <View style={{ width: 32, height: BAR_H, backgroundColor: C.cardAlt, borderRadius: 8, overflow: 'hidden', justifyContent: 'flex-end' }}>
                <View style={{ width: '100%', height: BAR_H * b.fill, backgroundColor: b.color, borderRadius: 8, minHeight: 4 }} />
              </View>
              {i < bars.length - 1 && (
                <View style={{ position: 'absolute', right: 0, width: 1, height: BAR_H, backgroundColor: C.border, bottom: 0 }} />
              )}
            </View>
          ))}
        </View>
      </View>

      {/* Recent entries */}
      <View style={{ backgroundColor: C.card, marginHorizontal: 14, borderRadius: 14, padding: 14, elevation: 1 }}>
        <Text style={{ fontSize: 13, fontFamily: Font.bold, color: C.text, marginBottom: 8 }}>Recent Entries</Text>
        {entries.map((e, i) => (
          <View key={i} style={[{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7 }, i < entries.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border }]}>
            <View style={{ width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginRight: 9, backgroundColor: e.isIn ? C.cashInLight : C.cashOutLight }}>
              <Text style={{ fontSize: 10, color: e.isIn ? C.cashIn : C.danger, fontFamily: Font.bold }}>{e.isIn ? '↑' : '↓'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontFamily: Font.semiBold, color: C.text }}>{e.remark}</Text>
              <Text style={{ fontSize: 9, color: C.textMuted, fontFamily: Font.regular, marginTop: 1 }}>{e.meta}</Text>
            </View>
            <Text style={{ fontSize: 13, fontFamily: Font.extraBold, color: e.isIn ? C.cashIn : C.danger }}>{e.amt}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Slide 4: AddEntryScreen ───────────────────────────────────────────────────
// Matches AddEntryScreen + EntryForm exactly:
// header → type toggle pills → date/time row → AppInput fields → payment chips → save button

function AddEntrySlide() {
  // AppInput field: left teal border bar, label 11px above, value 14px semiBold, divider below
  function Field({ label, value, rightIcon, last }) {
    return (
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderLeftWidth: 3, borderLeftColor: C.primary, paddingHorizontal: 14, paddingVertical: 11, minHeight: 56 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontFamily: Font.medium, color: C.primary, letterSpacing: 0.3, marginBottom: 3, lineHeight: 15 }}>{label}</Text>
            <Text style={{ fontSize: 14, fontFamily: Font.semiBold, color: value ? C.text : C.textSubtle, lineHeight: 19 }}>{value || '—'}</Text>
          </View>
          {rightIcon && <Feather name={rightIcon} size={13} color={C.textMuted} style={{ marginLeft: 8 }} />}
        </View>
        {!last && <View style={{ height: 1, backgroundColor: C.border }} />}
      </View>
    );
  }

  const paymentModes = ['Cash', 'Online', 'Cheque', 'Other'];

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>

      {/* Header — matches s.header: primary bg, back btn 44×44, centered title, right spacer */}
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.primary, paddingHorizontal: 14, paddingVertical: 12 }}>
        <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 22, color: C.onPrimary, lineHeight: 26 }}>‹</Text>
        </View>
        <Text style={{ flex: 1, fontSize: 17, fontFamily: Font.bold, color: '#fff', textAlign: 'center', lineHeight: 24 }}>Cash In</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Content scroll area — matches s.scroll: padding 16 */}
      <View style={{ flex: 1, padding: 14, backgroundColor: C.background }}>

        {/* Type toggle — matches s.typeRow / s.typeBtn: pill shape, borderRadius 24 */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          {/* Cash In — active (green) */}
          <View style={{ flex: 1, paddingVertical: 11, borderRadius: 24, backgroundColor: C.cashIn, borderWidth: 1.5, borderColor: C.cashIn, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontFamily: Font.semiBold, color: '#fff', lineHeight: 20 }}>Cash In</Text>
          </View>
          {/* Cash Out — inactive */}
          <View style={{ flex: 1, paddingVertical: 11, borderRadius: 24, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontFamily: Font.semiBold, color: C.text, lineHeight: 20 }}>Cash Out</Text>
          </View>
        </View>

        {/* Date / Time row — matches s.dateTimeRow / s.dateTimePicker */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: C.border }}>
            <Text style={{ fontSize: 14 }}>📅</Text>
            <Text style={{ flex: 1, fontSize: 13, fontFamily: Font.medium, color: C.text, lineHeight: 18 }}>01 Jun 2026</Text>
            <Feather name="chevron-down" size={11} color={C.textMuted} />
          </View>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: C.border }}>
            <Text style={{ fontSize: 14 }}>🕐</Text>
            <Text style={{ flex: 1, fontSize: 13, fontFamily: Font.medium, color: C.text, lineHeight: 18 }}>11:15 AM</Text>
            <Feather name="chevron-down" size={11} color={C.textMuted} />
          </View>
        </View>

        {/* AppInput fields — left teal bar, label + value stacked, divider between */}
        <View style={{ backgroundColor: C.card, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border, marginBottom: 14 }}>
          <Field label="Amount *"                value="4,200"         rightIcon={null}           />
          <Field label="Contact (Customer/Supplier)" value=""          rightIcon="chevron-down"   />
          <Field label="Remark"                  value="Morning sale"  rightIcon={null}           />
          <Field label="Attach Image or PDF"     value=""              rightIcon="paperclip"      />
          <Field label="Category"                value="Sales"         rightIcon="chevron-down"   last />
        </View>

        {/* Payment Mode chips — matches s.sectionLabel + s.paymentRow + s.paymentChip */}
        <Text style={{ fontSize: 13, fontFamily: Font.bold, color: C.text, marginBottom: 8, lineHeight: 18 }}>Payment Mode *</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {paymentModes.map((mode, i) => (
            <View key={i} style={{ paddingHorizontal: 18, paddingVertical: 9, borderRadius: 24, backgroundColor: i === 0 ? C.primary : C.card, borderWidth: 1.5, borderColor: i === 0 ? C.primary : C.border }}>
              <Text style={{ fontSize: 13, fontFamily: Font.semiBold, color: i === 0 ? '#fff' : C.text, lineHeight: 18 }}>{mode}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Save button — matches s.saveContainer + s.saveBtn */}
      <View style={{ padding: 14, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.card }}>
        <View style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: C.primary, minHeight: 50 }}>
          <Text style={{ color: '#fff', fontFamily: Font.extraBold, fontSize: 14, letterSpacing: 0.8, lineHeight: 20 }}>SAVE</Text>
        </View>
      </View>

    </View>
  );
}

// ── Slide 5: SettingsScreen ───────────────────────────────────────────────────

function SettingsSlide() {
  const sections = [
    {
      title: 'Account',
      items: [
        { icon: 'user',       label: 'Profile',           sub: 'Arham Khan'          },
        { icon: 'briefcase',  label: 'Business Settings', sub: 'My Business'         },
        { icon: 'dollar-sign',label: 'Currency',          sub: 'PKR – Pakistani Rupee'},
      ],
    },
    {
      title: 'Subscription',
      items: [
        { icon: 'star',       label: 'Subscription & Plans', sub: 'Current plan: Free', accent: C.primary },
      ],
    },
    {
      title: 'App',
      items: [
        { icon: 'share-2',    label: 'Manage Access',      sub: 'Invitations & shared books' },
        { icon: 'bell',       label: 'Notifications',      sub: 'Manage alerts'              },
        { icon: 'shield',     label: 'Privacy & Security', sub: 'Privacy policy'             },
        { icon: 'cloud',      label: 'Backup & Sync',      sub: 'Requires Pro or Business'   },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: 'help-circle', label: 'Help & FAQ',  sub: null },
        { icon: 'star',        label: 'Rate the App', sub: null },
      ],
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      {/* Header */}
      <View style={{ backgroundColor: C.primary, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' }}>
        <Text style={{ fontSize: 16, fontFamily: Font.bold, color: C.onPrimary }}>Settings</Text>
      </View>

      {/* Avatar card */}
      <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, marginHorizontal: 14, marginTop: 12, marginBottom: 10, borderRadius: 16, padding: 14, alignItems: 'center' }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
          <Text style={{ fontSize: 20, fontFamily: Font.extraBold, color: '#fff' }}>AK</Text>
        </View>
        <Text style={{ fontSize: 14, fontFamily: Font.bold, color: C.text }}>Arham Khan</Text>
        <Text style={{ fontSize: 11, fontFamily: Font.regular, color: C.textMuted, marginTop: 2 }}>arham@example.com</Text>
        <View style={{ marginTop: 7, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: C.primaryLight, borderWidth: 1, borderColor: C.primary + '44' }}>
          <Text style={{ fontSize: 11, fontFamily: Font.bold, color: C.primary }}>FREE Plan</Text>
        </View>
      </View>

      {/* Sections */}
      {sections.map((sec, si) => (
        <View key={si} style={{ marginHorizontal: 14, marginBottom: 8 }}>
          <Text style={{ fontSize: 10, fontFamily: Font.bold, color: C.textMuted, letterSpacing: 0.8, marginBottom: 5, textTransform: 'uppercase', paddingLeft: 2 }}>{sec.title}</Text>
          <View style={{ backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
            {sec.items.map((item, ii) => (
              <View key={ii} style={[{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11 }, ii < sec.items.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border }]}>
                <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: (item.accent ?? C.primary) + '1A', alignItems: 'center', justifyContent: 'center', marginRight: 11 }}>
                  <Feather name={item.icon} size={14} color={item.accent ?? C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: Font.semiBold, color: C.text }}>{item.label}</Text>
                  {item.sub && <Text style={{ fontSize: 10, fontFamily: Font.regular, color: C.textMuted, marginTop: 1 }}>{item.sub}</Text>}
                </View>
                <Feather name="chevron-right" size={14} color={C.textSubtle} />
              </View>
            ))}
          </View>
        </View>
      ))}

      {/* Logout */}
      <View style={{ marginHorizontal: 14, marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border }}>
          <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: C.cashOutLight, alignItems: 'center', justifyContent: 'center', marginRight: 11 }}>
            <Feather name="log-out" size={14} color={C.danger} />
          </View>
          <Text style={{ fontSize: 13, fontFamily: Font.semiBold, color: C.danger, flex: 1 }}>Logout</Text>
        </View>
      </View>
    </View>
  );
}

// ── Slide 5: BookSettingsScreen ───────────────────────────────────────────────

function BookSettingsSlide() {
  const entryFields = [
    { icon: 'user-check',  label: 'Customers',    sub: 'Manage customers for this book',       count: 5,  active: true  },
    { icon: 'truck',       label: 'Suppliers',     sub: 'Manage suppliers for this book',       count: 3,  active: true  },
    { icon: 'tag',         label: 'Categories',    sub: 'Manage categories for this book',      count: 6,  active: true  },
    { icon: 'credit-card', label: 'Payment Mode',  sub: 'Manage payment methods for this book', count: 4,  active: true  },
    { icon: 'paperclip',   label: 'Attachments',   sub: 'Allow image or PDF on each entry',     toggle: true, toggled: false },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      {/* Header — matches s.header */}
      <View style={{ backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 }}>
        <View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="chevron-left" size={22} color="#fff" />
        </View>
        <Text style={{ fontSize: 16, fontFamily: Font.bold, color: '#fff' }}>Book Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={{ flex: 1, padding: 14 }}>

        {/* BOOK NAME section — matches s.sectionLabel + s.card + s.nameRow */}
        <Text style={{ fontSize: 10, fontFamily: Font.semiBold, color: C.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 7, marginLeft: 2 }}>Book Name</Text>
        <View style={{ backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
            <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="book-open" size={17} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: Font.semiBold, color: C.text, lineHeight: 20 }}>Grocery Shop</Text>
              <Text style={{ fontSize: 11, fontFamily: Font.regular, color: C.textMuted }}>Tap rename to change</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20, backgroundColor: C.primaryLight }}>
              <Feather name="edit-2" size={12} color={C.primary} />
              <Text style={{ fontSize: 12, fontFamily: Font.semiBold, color: C.primary }}>Rename</Text>
            </View>
          </View>
        </View>

        {/* ENTRY FIELD SETTINGS — matches s.sectionLabel + s.card + s.row */}
        <Text style={{ fontSize: 10, fontFamily: Font.semiBold, color: C.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 7, marginLeft: 2 }}>Entry Field Settings</Text>
        <View style={{ backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 14 }}>
          {entryFields.map((item, i) => (
            <View key={i}>
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 13, gap: 11 }}>
                <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name={item.icon} size={17} color={C.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: Font.semiBold, color: C.text, lineHeight: 20 }}>{item.label}</Text>
                  <Text style={{ fontSize: 11, fontFamily: Font.regular, color: C.textMuted }}>{item.sub}</Text>
                </View>
                {item.toggle ? (
                  /* Attachment — toggle only, matches Switch */
                  <View style={{ width: 40, height: 22, borderRadius: 11, backgroundColor: C.border, justifyContent: 'center', paddingHorizontal: 2 }}>
                    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff' }} />
                  </View>
                ) : (
                  /* Navigable rows — count badge + active chevron */
                  <>
                    <View style={{ minWidth: 26, height: 26, borderRadius: 13, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, marginRight: 6 }}>
                      <Text style={{ fontSize: 12, fontFamily: Font.bold, color: C.primary }}>{item.count}</Text>
                    </View>
                    <View style={{ backgroundColor: C.primaryLight, borderRadius: 7, padding: 4, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name="chevron-right" size={14} color={C.primary} />
                    </View>
                  </>
                )}
              </View>
              {i < entryFields.length - 1 && <View style={{ height: 1, backgroundColor: C.border, marginHorizontal: 14 }} />}
            </View>
          ))}
        </View>

        {/* COLLABORATION — matches canShare state */}
        <Text style={{ fontSize: 10, fontFamily: Font.semiBold, color: C.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 7, marginLeft: 2 }}>Collaboration</Text>
        <View style={{ backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 13, gap: 11 }}>
            <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="users" size={17} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: Font.semiBold, color: C.text }}>Manage Access</Text>
              <Text style={{ fontSize: 11, fontFamily: Font.regular, color: C.textMuted }}>Share this book with other users</Text>
            </View>
            <View style={{ backgroundColor: C.primaryLight, borderRadius: 7, padding: 4 }}>
              <Feather name="chevron-right" size={14} color={C.primary} />
            </View>
          </View>
        </View>

        {/* DANGER ZONE */}
        <Text style={{ fontSize: 10, fontFamily: Font.semiBold, color: C.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 7, marginLeft: 2 }}>Danger Zone</Text>
        <View style={{ backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.danger, overflow: 'hidden' }}>
          {[
            { icon: 'trash-2', label: 'Delete All Entries', sub: 'Permanently removes all entries' },
            { icon: 'book',    label: 'Delete Book',         sub: 'Permanently deletes this book'  },
          ].map((item, i) => (
            <View key={i}>
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 13, gap: 11 }}>
                <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: C.cashOutLight, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name={item.icon} size={17} color={C.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: Font.semiBold, color: C.danger }}>{item.label}</Text>
                  <Text style={{ fontSize: 11, fontFamily: Font.regular, color: C.textMuted }}>{item.sub}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={C.danger} />
              </View>
              {i === 0 && <View style={{ height: 1, backgroundColor: C.border, marginHorizontal: 14 }} />}
            </View>
          ))}
        </View>

      </View>
    </View>
  );
}

// ── Slide definitions ─────────────────────────────────────────────────────────

const SLIDES = [
  {
    key: 'books',
    title: 'Manage Multiple Books',
    subtitle: 'Keep separate cash books for every business or account — all in one app.',
    Slide: BooksSlide,
  },
  {
    key: 'detail',
    title: 'Track Every Transaction',
    subtitle: 'Search, filter, and see every entry with your full balance at a glance.',
    Slide: BookDetailSlide,
  },
  {
    key: 'addentry',
    title: 'Quick Cash In Entry',
    subtitle: 'Log any transaction in seconds — amount, category, customer, date and more.',
    Slide: AddEntrySlide,
  },
  {
    key: 'reports',
    title: 'Powerful Reports',
    subtitle: 'Visual charts for income vs expenses. Export to PDF or Excel in one tap.',
    Slide: ReportsSlide,
  },
  {
    key: 'booksettings',
    title: 'Customise Every Book',
    subtitle: 'Set categories, customers, suppliers, payment modes, and sharing per book.',
    Slide: BookSettingsSlide,
  },
  {
    key: 'settings',
    title: 'Full App Control',
    subtitle: 'Manage your profile, currency, notifications, backup, and subscription.',
    Slide: SettingsSlide,
  },
];

// ── Main screen ───────────────────────────────────────────────────────────────

export default function OnboardingScreen({ onFinish }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef(null);

  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;
  const onViewableChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) setActiveIndex(viewableItems[0].index ?? 0);
  }).current;

  function goNext() {
    if (activeIndex < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    } else {
      onFinish();
    }
  }

  const isLast = activeIndex === SLIDES.length - 1;
  const STATUS_H = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0;

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.background} />

      {/* Skip */}
      {!isLast && (
        <TouchableOpacity
          style={[s.skipBtn, { top: STATUS_H + (Platform.OS === 'ios' ? 44 : 10) }]}
          onPress={onFinish}
          activeOpacity={0.7}
        >
          <Text style={s.skipTxt}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Slide list */}
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={item => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableChanged}
        viewabilityConfig={viewConfig}
        renderItem={({ item }) => (
          <View style={s.slide}>
            <Text style={s.title}>{item.title}</Text>
            <Text style={s.subtitle}>{item.subtitle}</Text>
            {/* Illustration card */}
            <View style={s.card}>
              <item.Slide />
            </View>
          </View>
        )}
      />

      {/* Dots */}
      <View style={s.dotsRow}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[s.dot, i === activeIndex ? s.dotActive : s.dotInactive]} />
        ))}
      </View>

      {/* CTA button */}
      <TouchableOpacity style={s.btn} onPress={goNext} activeOpacity={0.85}>
        <Text style={s.btnTxt}>{isLast ? 'Get Started' : 'Next'}</Text>
        <Feather name={isLast ? 'arrow-right' : 'chevron-right'} size={18} color="#fff" style={{ marginLeft: 6 }} />
      </TouchableOpacity>
    </View>
  );
}

const STATUS_H_STATIC = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0;
const TOP_PAD = STATUS_H_STATIC + (Platform.OS === 'ios' ? 44 : 10);

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.background,
    alignItems: 'center',
    paddingTop: TOP_PAD,
    paddingBottom: 32,
  },
  skipBtn: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  skipTxt:  { fontSize: 13, fontFamily: Font.semiBold, color: C.textMuted },
  slide: {
    width,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  title: {
    fontSize: 21,
    fontFamily: Font.extraBold,
    color: C.text,
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: Font.regular,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 10,
    marginBottom: 14,
  },
  // The illustration card — fixed height, no scaling
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: C.border,
    overflow: 'hidden',
    backgroundColor: C.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
  },
  dotsRow:    { flexDirection: 'row', gap: 8, marginTop: 14, marginBottom: 12 },
  dot:        { height: 8, borderRadius: 4 },
  dotActive:  { width: 24, backgroundColor: C.primary },
  dotInactive:{ width: 8,  backgroundColor: C.border  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 40,
    width: width - 40,
    shadowColor: C.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  btnTxt: { fontSize: 16, fontFamily: Font.bold, color: '#fff' },
});
