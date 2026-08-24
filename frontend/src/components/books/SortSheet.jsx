import React, { useMemo, memo } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';

// ── Sort options ──────────────────────────────────────────────────────────────

export const SORT_OPTIONS = [
  {
    key:   'updated',
    label: 'Last Updated',
    sub:   'Most recently added first',
  },
  {
    key:   'high',
    label: 'Highest to Lowest Balance',
    sub:   'Largest net balance first',
  },
  {
    key:   'low',
    label: 'Lowest to Highest Balance',
    sub:   'Smallest net balance first',
  },
  {
    key:   'custom',
    label: 'Custom Order',
    sub:   'Drag and drop to arrange',
  },
];

// ── Icons ─────────────────────────────────────────────────────────────────────

const ClockIcon = ({ color, size = 16 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: 1.5, height: size * 0.35, backgroundColor: color, borderRadius: 1, bottom: size * 0.5, left: size * 0.5 - 0.75 }} />
      <View style={{ position: 'absolute', width: 1.5, height: size * 0.28, backgroundColor: color, borderRadius: 1, bottom: size * 0.5, left: size * 0.5 - 0.75, transform: [{ rotate: '60deg' }], transformOrigin: 'bottom' }} />
    </View>
  </View>
);

const ArrowDownIcon = ({ color, size = 16 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 1.8, height: size * 0.65, backgroundColor: color, borderRadius: 1 }} />
    <View style={{ position: 'absolute', bottom: 1, width: size * 0.5, height: size * 0.5, borderRightWidth: 2, borderBottomWidth: 2, borderColor: color, transform: [{ rotate: '45deg' }], borderRadius: 1 }} />
  </View>
);

const ArrowUpIcon = ({ color, size = 16 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 1.8, height: size * 0.65, backgroundColor: color, borderRadius: 1 }} />
    <View style={{ position: 'absolute', top: 1, width: size * 0.5, height: size * 0.5, borderLeftWidth: 2, borderTopWidth: 2, borderColor: color, transform: [{ rotate: '45deg' }], borderRadius: 1 }} />
  </View>
);

const GripIcon = ({ color, size = 16 }) => (
  <View style={{ width: size, height: size, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
    {[0, 1].map(col => (
      <View key={col} style={{ gap: 3 }}>
        {[0, 1, 2].map(row => (
          <View key={row} style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: color }} />
        ))}
      </View>
    ))}
  </View>
);

const ICONS = {
  updated: ClockIcon,
  high:    ArrowDownIcon,
  low:     ArrowUpIcon,
  custom:  GripIcon,
};

// ── Single option row ─────────────────────────────────────────────────────────

const OptionRow = memo(({ option, active, onSelect, C, s }) => {
  const Icon = ICONS[option.key];
  return (
    <TouchableOpacity
      style={[s.row, active && s.rowActive]}
      onPress={() => onSelect(option.key)}
      activeOpacity={0.8}
    >
      <View style={[s.iconBox, active && s.iconBoxActive]}>
        <Icon color={active ? C.primary : C.textMuted} size={16} />
      </View>
      <View style={s.rowText}>
        <Text style={[s.rowLabel, active && s.rowLabelActive]}>{option.label}</Text>
        <Text style={s.rowSub}>{option.sub}</Text>
      </View>
      <View style={[s.radio, active && s.radioActive]}>
        {active && <View style={s.radioDot} />}
      </View>
    </TouchableOpacity>
  );
});

// ── Sheet ─────────────────────────────────────────────────────────────────────

export default function SortSheet({ visible, current, onSelect, onClose }) {
  const { C, Font } = useTheme();
  const s = useMemo(() => makeStyles(C, Font), [C, Font]);
  const insets = useSafeAreaInsets();

  const handleSelect = (key) => {
    onSelect(key);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={s.overlay}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: 32 + insets.bottom }]}>
          <View style={s.handle} />

          <View style={s.titleRow}>
            <Text style={s.title}>Sort Books</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <View style={s.closeX}>
                <View style={[s.closeLine, { transform: [{ rotate: '45deg' }] }]} />
                <View style={[s.closeLine, { transform: [{ rotate: '-45deg' }] }]} />
              </View>
            </TouchableOpacity>
          </View>

          <Text style={s.sub}>Choose how your books are ordered</Text>

          <View style={s.options}>
            {SORT_OPTIONS.map(opt => (
              <OptionRow
                key={opt.key}
                option={opt}
                active={current === opt.key}
                onSelect={handleSelect}
                C={C}
                s={s}
              />
            ))}
          </View>

          <TouchableOpacity style={s.doneBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={s.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeStyles = (C, Font) => StyleSheet.create({
  overlay:  { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: C.overlay },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 20 },

  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title:    { fontSize: 18, fontFamily: Font.extraBold, color: C.text, lineHeight: 26 },
  sub:      { fontSize: 13, fontFamily: Font.regular, color: C.textMuted, lineHeight: 20, marginBottom: 20 },

  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeX:   { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  closeLine:{ position: 'absolute', width: 14, height: 2, backgroundColor: C.textSubtle, borderRadius: 1 },

  options: { gap: 8, marginBottom: 16 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14, borderRadius: 14,
    backgroundColor: C.background,
    borderWidth: 1.5, borderColor: C.border,
  },
  rowActive: { borderColor: C.primary, backgroundColor: C.primaryLight },

  iconBox:       { width: 36, height: 36, borderRadius: 10, backgroundColor: C.cardAlt, alignItems: 'center', justifyContent: 'center' },
  iconBoxActive: { backgroundColor: C.primaryMid },

  rowText:       { flex: 1 },
  rowLabel:      { fontSize: 14, fontFamily: Font.semiBold, color: C.text,    lineHeight: 20, marginBottom: 1 },
  rowLabelActive:{ color: C.primary },
  rowSub:        { fontSize: 11, fontFamily: Font.regular,  color: C.textMuted, lineHeight: 16 },

  radio:       { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: C.primary },
  radioDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary },

  customHint: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.primaryLight, borderRadius: 10,
    padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: C.primaryMid,
  },
  customHintText: { flex: 1, fontSize: 12, fontFamily: Font.regular, color: C.primary, lineHeight: 18 },

  doneBtn:     { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', minHeight: 52 },
  doneBtnText: { fontSize: 15, fontFamily: Font.bold, color: C.onPrimary, lineHeight: 22 },
});
