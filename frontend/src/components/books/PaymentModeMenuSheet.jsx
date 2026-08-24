import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
  Modal, ActivityIndicator, Keyboard, Platform, Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppInput from '../ui/Input';

function SummaryPill({ label, value, color, Font }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 3 }}>
      <Text style={{ fontSize: 10, fontFamily: Font.medium, color: '#888', textTransform: 'uppercase', letterSpacing: 0.7 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 15, fontFamily: Font.bold, color }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
    </View>
  );
}

export default function PaymentModeMenuSheet({
  visible, mode, onClose, onViewEntries, onSaveEdit, onDelete, saving,
  canEdit = true, canDelete = true,
  C, Font,
}) {
  const insets = useSafeAreaInsets();
  const [view,     setView]     = useState('menu');
  const [name,     setName]     = useState('');
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    if (!visible) { setView('menu'); setKbHeight(0); }
    else if (mode) { setName(mode.name ?? ''); }
  }, [visible, mode?.id]);

  useEffect(() => {
    if (!visible) { setKbHeight(0); return; }
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKbHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKbHeight(0),
    );
    return () => { show.remove(); hide.remove(); };
  }, [visible]);

  if (!mode) return null;

  const balance = mode.net_balance ?? 0;

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) { Alert.alert('Name required', 'Please enter a name.'); return; }
    onSaveEdit({ name: trimmed });
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={[s.sheet, { backgroundColor: C.card, marginBottom: kbHeight, paddingBottom: 24 + insets.bottom }]} onPress={() => {}}>

          <View style={[s.handle, { backgroundColor: C.border }]} />

          {/* ── MENU VIEW ── */}
          {view === 'menu' && (
            <>
              {/* Identity */}
              <View style={s.identity}>
                <View style={[s.avatarCircle, { backgroundColor: C.primaryLight }]}>
                  <Feather name="credit-card" size={20} color={C.primary} />
                </View>
                <View style={s.identityText}>
                  <Text style={[s.modeName, { color: C.text, fontFamily: Font.bold }]} numberOfLines={1}>
                    {mode.name}
                  </Text>
                </View>
                <View style={[s.typeBadge, { backgroundColor: C.primaryLight }]}>
                  <Feather name="credit-card" size={11} color={C.primary} />
                  <Text style={[s.typeBadgeText, { color: C.primary, fontFamily: Font.semiBold }]}>Payment Mode</Text>
                </View>
              </View>

              {/* Balance */}
              <View style={[s.summaryCard, { borderColor: C.border }]}>
                <SummaryPill label="Cash In"     value={`+${(mode.total_in  ?? 0).toLocaleString()}`} color={C.cashIn}                        Font={Font} />
                <View style={[s.dividerV, { backgroundColor: C.border }]} />
                <SummaryPill label="Net Balance" value={Math.abs(balance).toLocaleString()}            color={balance >= 0 ? C.cashIn : C.danger} Font={Font} />
                <View style={[s.dividerV, { backgroundColor: C.border }]} />
                <SummaryPill label="Cash Out"    value={`-${(mode.total_out ?? 0).toLocaleString()}`} color={C.danger}                        Font={Font} />
              </View>

              {/* View Entries */}
              <TouchableOpacity
                style={[s.viewBtn, { backgroundColor: C.primaryLight, borderColor: C.primary }]}
                onPress={onViewEntries}
                activeOpacity={0.8}
              >
                <Feather name="list" size={15} color={C.primary} />
                <Text style={[s.viewBtnText, { color: C.primary, fontFamily: Font.semiBold }]}>View Entries</Text>
              </TouchableOpacity>

              {(canEdit || canDelete) && (
                <View style={[s.dividerH, { backgroundColor: C.border }]} />
              )}

              {/* Rename */}
              {canEdit && (
                <TouchableOpacity style={s.actionRow} onPress={() => setView('edit')} activeOpacity={0.75}>
                  <View style={[s.actionIcon, { backgroundColor: C.primaryLight }]}>
                    <Feather name="edit-2" size={16} color={C.primary} />
                  </View>
                  <Text style={[s.actionLabel, { color: C.text, fontFamily: Font.medium }]}>Rename Mode</Text>
                  <Feather name="chevron-right" size={16} color={C.textMuted} />
                </TouchableOpacity>
              )}

              {/* Delete */}
              {canDelete && (
                <TouchableOpacity style={[s.actionRow, { marginBottom: 4 }]} onPress={onDelete} activeOpacity={0.75}>
                  <View style={[s.actionIcon, { backgroundColor: C.dangerLight }]}>
                    <Feather name="trash-2" size={16} color={C.danger} />
                  </View>
                  <Text style={[s.actionLabel, { color: C.danger, fontFamily: Font.medium }]}>Delete Mode</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* ── EDIT VIEW ── */}
          {view === 'edit' && (
            <>
              <View style={s.editHeader}>
                <TouchableOpacity onPress={() => setView('menu')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Feather name="arrow-left" size={20} color={C.text} />
                </TouchableOpacity>
                <Text style={[s.editTitle, { color: C.text, fontFamily: Font.bold }]}>Rename Mode</Text>
                <View style={{ width: 24 }} />
              </View>

              <AppInput
                label="Name *"
                value={name}
                onChangeText={setName}
                placeholder="Payment mode name"
                autoFocus={!name}
                isLast
              />

              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: C.primary }, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Feather name="check" size={16} color="#fff" />
                    <Text style={[s.saveBtnText, { fontFamily: Font.bold }]}>Save Changes</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },

  identity:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  avatarCircle: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  identityText: { flex: 1 },
  modeName:     { fontSize: 16, lineHeight: 22 },
  typeBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  typeBadgeText:{ fontSize: 11, lineHeight: 16 },

  summaryCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 8, marginBottom: 14 },
  dividerV:    { width: 1, height: 32, marginHorizontal: 4 },

  viewBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, marginBottom: 16 },
  viewBtnText: { fontSize: 14, lineHeight: 20 },

  dividerH: { height: 1, marginBottom: 12 },

  actionRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  actionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionLabel:{ flex: 1, fontSize: 15, lineHeight: 22 },

  editHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  editTitle:  { fontSize: 16, lineHeight: 24 },
  saveBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13, marginTop: 10 },
  saveBtnText:{ color: '#fff', fontSize: 15, lineHeight: 22 },
});
