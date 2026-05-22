import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Switch, ActivityIndicator, Modal, Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useUpdateShare } from '../../hooks/useSharing';
import { RIGHTS, SCREENS, RIGHTS_MAP, getInitials } from '../../constants/sharing';
import { shadow } from '../../constants/shadows';
import SuccessDialog from '../ui/SuccessDialog';

// ── EditShareSheet ────────────────────────────────────────────────────────────
//
// Slide-up sheet for editing an existing share's screens and rights.
// Props:
//   visible  — bool
//   share    — ShareResponse | null
//   bookId   — string
//   onClose  — fn()
//

export default function EditShareSheet({ visible, share, bookId, onClose }) {
  const { C, Font, isDark } = useTheme();
  const updateShare = useUpdateShare(bookId);

  const [localScreens, setLocalScreens] = useState({});
  const [localRights,  setLocalRights]  = useState('view');
  const [showSuccess,  setShowSuccess]  = useState(false);

  // Sync local state when a new share is opened
  useEffect(() => {
    if (visible && share) {
      setLocalScreens({ ...share.screens });
      setLocalRights(share.rights);
    }
  }, [visible, share]);

  const toggleScreen = useCallback((key) => {
    if (key === 'entries' || key === 'settings') return; // always on
    setLocalScreens(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleSave = useCallback(() => {
    if (!share) return;
    updateShare.mutate(
      { shareId: share.id, payload: { screens: localScreens, rights: localRights } },
      {
        onSuccess: () => setShowSuccess(true),
        onError:   () => {
          // Keep the sheet open so the user can retry — no Alert needed
        },
      },
    );
  }, [share, localScreens, localRights, updateShare]);

  const handleSuccessDismiss = useCallback(() => {
    setShowSuccess(false);
    onClose();
  }, [onClose]);

  if (!share) return null;

  const initials   = getInitials(share.shared_with?.full_name || share.shared_with?.email || '');
  const rightsObj  = RIGHTS_MAP[localRights] ?? RIGHTS_MAP.view;

  const hasChanges =
    localRights !== share.rights ||
    SCREENS.some(sc => !sc.required && (localScreens[sc.key] ?? false) !== (share.screens[sc.key] ?? false));

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
        statusBarTranslucent
      >
        <Pressable
          style={[ss.backdrop, { backgroundColor: C.overlay }]}
          onPress={onClose}
        >
          <Pressable style={[ss.sheet, { backgroundColor: C.card }]} onPress={() => {}}>
            {/* Handle */}
            <View style={[ss.handle, { backgroundColor: C.border }]} />

            {/* Collaborator card */}
            <View style={[ss.who, { backgroundColor: C.background, borderColor: C.border }]}>
              <View style={[ss.whoAvatar, { backgroundColor: C.primaryLight }]}>
                <Text style={[ss.whoInitials, { color: C.primary, fontFamily: Font.bold }]}>
                  {initials}
                </Text>
              </View>
              <View style={ss.whoBody}>
                <Text style={[ss.whoName, { color: C.text, fontFamily: Font.bold }]} numberOfLines={1}>
                  {share.shared_with?.full_name || 'Unknown'}
                </Text>
                <Text style={[ss.whoEmail, { color: C.textMuted, fontFamily: Font.regular }]} numberOfLines={1}>
                  {share.shared_with?.email}
                </Text>
              </View>
              {/* Current rights badge */}
              <View style={[ss.rightsBadge, { backgroundColor: isDark ? rightsObj.darkLight : rightsObj.light }]}>
                <Feather name={rightsObj.icon} size={11} color={rightsObj.color} />
                <Text style={[ss.rightsText, { color: rightsObj.color, fontFamily: Font.semiBold }]}>
                  {rightsObj.title}
                </Text>
              </View>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={ss.scroll}
              keyboardShouldPersistTaps="handled"
            >
              {/* ── Sections ───────────────────────────────────────── */}
              <Text style={[ss.sectionLabel, { color: C.textMuted, fontFamily: Font.semiBold }]}>
                SECTIONS TO SHARE
              </Text>
              <View style={[ss.card, { backgroundColor: C.background, borderColor: C.border }]}>
                {SCREENS.map((sc, idx) => {
                  const on = sc.required || !!localScreens[sc.key];
                  return (
                    <View key={sc.key}>
                      <TouchableOpacity
                        style={ss.screenRow}
                        onPress={() => toggleScreen(sc.key)}
                        activeOpacity={sc.required ? 1 : 0.75}
                      >
                        <View style={[ss.screenIcon, { backgroundColor: on ? C.primaryLight : C.cardAlt }]}>
                          <Feather name={sc.icon} size={16} color={on ? C.primary : C.textSubtle} />
                        </View>
                        <Text style={[ss.screenLabel, {
                          color: on ? C.text : C.textMuted,
                          fontFamily: on ? Font.medium : Font.regular,
                          flex: 1,
                        }]}>
                          {sc.label}{sc.required ? '  ·  Required' : ''}
                        </Text>
                        <Switch
                          value={on}
                          onValueChange={() => toggleScreen(sc.key)}
                          disabled={sc.required}
                          trackColor={{ false: C.border, true: C.primary }}
                          thumbColor="#fff"
                        />
                      </TouchableOpacity>
                      {idx < SCREENS.length - 1 && (
                        <View style={[ss.divider, { backgroundColor: C.border }]} />
                      )}
                    </View>
                  );
                })}
              </View>

              {/* ── Rights ─────────────────────────────────────────── */}
              <Text style={[ss.sectionLabel, { color: C.textMuted, fontFamily: Font.semiBold, marginTop: 20 }]}>
                ACCESS LEVEL
              </Text>
              <View style={ss.rightsGroup}>
                {RIGHTS.map((r) => {
                  const active = localRights === r.key;
                  return (
                    <TouchableOpacity
                      key={r.key}
                      style={[ss.rightsCard, {
                        backgroundColor: active ? (isDark ? r.darkLight : r.light) : C.background,
                        borderColor:     active ? r.color : C.border,
                      }]}
                      onPress={() => setLocalRights(r.key)}
                      activeOpacity={0.8}
                    >
                      <View style={[ss.rightsIcon, { backgroundColor: active ? r.color : C.cardAlt }]}>
                        <Feather name={r.icon} size={17} color={active ? '#fff' : C.textSubtle} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[ss.rightsTitle, {
                          color: active ? r.color : C.text,
                          fontFamily: active ? Font.bold : Font.semiBold,
                        }]}>
                          {r.title}
                        </Text>
                        <Text style={[ss.rightsDesc, { color: C.textMuted, fontFamily: Font.regular }]}>
                          {r.desc}
                        </Text>
                      </View>
                      {active && (
                        <View style={[ss.checkCircle, { backgroundColor: r.color }]}>
                          <Feather name="check" size={11} color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* ── Save button ─────────────────────────────────────── */}
              <TouchableOpacity
                style={[
                  ss.saveBtn,
                  { backgroundColor: (hasChanges && !updateShare.isPending) ? C.primary : C.border },
                  (hasChanges && !updateShare.isPending) && shadow(C.primary, 2, 8, 0.28),
                ]}
                onPress={handleSave}
                disabled={!hasChanges || updateShare.isPending}
                activeOpacity={0.85}
              >
                {updateShare.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Feather name="save" size={17} color="#fff" />
                    <Text style={[ss.saveBtnText, { fontFamily: Font.extraBold }]}>Save Changes</Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={{ height: 24 }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <SuccessDialog
        visible={showSuccess}
        onDismiss={handleSuccessDismiss}
        title="Access Updated!"
        subtitle={`Changes saved for ${share.shared_with?.full_name || share.shared_with?.email}`}
      />
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 10, maxHeight: '92%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },

  who: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginBottom: 4,
    borderRadius: 16, borderWidth: 1.5,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  whoAvatar:   { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  whoInitials: { fontSize: 15 },
  whoBody:     { flex: 1 },
  whoName:     { fontSize: 15, lineHeight: 22 },
  whoEmail:    { fontSize: 12, lineHeight: 18, marginTop: 1 },
  rightsBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5,
  },
  rightsText: { fontSize: 11, lineHeight: 16 },

  scroll: { paddingHorizontal: 16, paddingTop: 16 },

  sectionLabel: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, marginLeft: 2 },

  card:       { borderRadius: 16, borderWidth: 1.5, overflow: 'hidden' },
  screenRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  screenIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  screenLabel:{ fontSize: 14, lineHeight: 20 },
  divider:    { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },

  rightsGroup: { gap: 10 },
  rightsCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, borderWidth: 1.5,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  rightsIcon:  { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rightsTitle: { fontSize: 14, lineHeight: 22, marginBottom: 2 },
  rightsDesc:  { fontSize: 12, lineHeight: 17 },
  checkCircle: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, borderRadius: 32,
    marginTop: 24, paddingVertical: 16, minHeight: 54,
  },
  saveBtnText: { fontSize: 15, color: '#fff', lineHeight: 22 },
});
