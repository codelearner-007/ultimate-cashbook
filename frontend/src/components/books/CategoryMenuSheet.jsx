import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
  Modal, ActivityIndicator, Keyboard, Platform, TextInput,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


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

export default function CategoryMenuSheet({
  visible,
  category,
  onClose,
  onViewEntries,
  onRename,    // (newName) => void  — caller handles the mutation
  onDelete,    // () => void         — caller handles confirmation + mutation
  renaming,    // bool — mutation pending flag
  canEdit  = true,
  canDelete = true,
  C,
  Font,
}) {
  const insets = useSafeAreaInsets();
  const [view,     setView]     = useState('menu');   // 'menu' | 'rename'
  const [newName,  setNewName]  = useState('');
  const [kbHeight, setKbHeight] = useState(0);

  // Reset to menu view whenever sheet opens/closes
  useEffect(() => {
    if (!visible) { setView('menu'); setNewName(''); setKbHeight(0); }
  }, [visible]);

  useEffect(() => {
    if (!visible) { setKbHeight(0); return; }
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKbHeight(e.endCoordinates.height)
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKbHeight(0)
    );
    return () => { show.remove(); hide.remove(); };
  }, [visible]);

  if (!category) return null;

  const balance = category.net_balance ?? 0;

  const handleSaveRename = () => {
    const name = newName.trim();
    if (!name || name === category.name) { setView('menu'); return; }
    onRename(name);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={[s.sheet, { backgroundColor: C.card, marginBottom: kbHeight, paddingBottom: 24 + insets.bottom }]} onPress={() => {}}>

          {/* Handle */}
          <View style={[s.handle, { backgroundColor: C.border }]} />

          {/* ── MENU VIEW ── */}
          {view === 'menu' && (
            <>
              {/* Category identity */}
              <View style={s.identity}>
                <View style={[s.avatar, { backgroundColor: C.primaryLight }]}>
                  <Feather name="tag" size={22} color={C.primary} />
                </View>
                <Text style={[s.catName, { color: C.text, fontFamily: Font.bold }]} numberOfLines={1}>
                  {category.name}
                </Text>
              </View>

              {/* Balance summary */}
              <View style={[s.summaryCard, { borderColor: C.border }]}>
                <SummaryPill label="Cash In"  value={`+${(category.total_in ?? 0).toLocaleString()}`}       color={C.cashIn} Font={Font} />
                <View style={[s.dividerV, { backgroundColor: C.border }]} />
                <SummaryPill
                  label="Net Balance"
                  value={Math.abs(balance).toLocaleString()}
                  color={balance >= 0 ? C.cashIn : C.danger}
                  Font={Font}
                />
                <View style={[s.dividerV, { backgroundColor: C.border }]} />
                <SummaryPill label="Cash Out" value={`-${(category.total_out ?? 0).toLocaleString()}`}      color={C.danger} Font={Font} />
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
                <TouchableOpacity
                  style={s.actionRow}
                  onPress={() => { setNewName(category.name); setView('rename'); }}
                  activeOpacity={0.75}
                >
                  <View style={[s.actionIcon, { backgroundColor: C.primaryLight }]}>
                    <Feather name="edit-2" size={16} color={C.primary} />
                  </View>
                  <Text style={[s.actionLabel, { color: C.text, fontFamily: Font.medium }]}>Rename Category</Text>
                  <Feather name="chevron-right" size={16} color={C.textMuted} />
                </TouchableOpacity>
              )}

              {/* Delete */}
              {canDelete && (
                <TouchableOpacity
                  style={[s.actionRow, { marginBottom: 4 }]}
                  onPress={onDelete}
                  activeOpacity={0.75}
                >
                  <View style={[s.actionIcon, { backgroundColor: C.dangerLight }]}>
                    <Feather name="trash-2" size={16} color={C.danger} />
                  </View>
                  <Text style={[s.actionLabel, { color: C.danger, fontFamily: Font.medium }]}>Delete Category</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* ── RENAME VIEW ── */}
          {view === 'rename' && (
            <>
              <View style={s.renameHeader}>
                <TouchableOpacity onPress={() => setView('menu')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Feather name="arrow-left" size={20} color={C.text} />
                </TouchableOpacity>
                <Text style={[s.renameTitle, { color: C.text, fontFamily: Font.bold }]}>Rename Category</Text>
                <View style={{ width: 24 }} />
              </View>

              <TextInput
                style={[s.renameInput, { borderColor: C.border, color: C.text, backgroundColor: C.background, fontFamily: Font.regular }]}
                value={newName}
                onChangeText={setNewName}
                placeholder="Category name"
                placeholderTextColor={C.textMuted}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSaveRename}
                selectTextOnFocus
              />

              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: C.primary }, renaming && { opacity: 0.6 }]}
                onPress={handleSaveRename}
                disabled={renaming}
                activeOpacity={0.85}
              >
                {renaming ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Feather name="check" size={16} color="#fff" />
                    <Text style={[s.saveBtnText, { fontFamily: Font.bold }]}>Save</Text>
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

  // Identity row
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  avatar:   { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  catName:  { flex: 1, fontSize: 17, lineHeight: 24 },

  // Balance
  summaryCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 8, marginBottom: 14 },
  dividerV:    { width: 1, height: 32, marginHorizontal: 4 },

  // View entries button
  viewBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, marginBottom: 16 },
  viewBtnText: { fontSize: 14, lineHeight: 20 },

  dividerH: { height: 1, marginBottom: 12 },

  // Action rows
  actionRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  actionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionLabel:{ flex: 1, fontSize: 15, lineHeight: 22 },

  // Rename view
  renameHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  renameTitle:  { fontSize: 16, lineHeight: 24 },
  renameInput:  { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, lineHeight: 22, marginBottom: 16 },
  saveBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13 },
  saveBtnText:  { color: '#fff', fontSize: 15, lineHeight: 22 },
});
