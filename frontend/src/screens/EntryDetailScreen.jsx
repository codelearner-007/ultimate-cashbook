import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Pressable,
  StatusBar, ScrollView, Image, Linking,
} from 'react-native';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../hooks/useTheme';
import { useBookBasePath } from '../hooks/useBookBasePath';
import { apiGetEntries, apiDeleteEntry } from '../lib/dataSource';
import { ChevronLeftIcon, PencilIcon, DotsVerticalIcon, TrashIcon } from '../components/ui/Icons';
import { Feather } from '@expo/vector-icons';
import { useBooks } from '../hooks/useBooks';
import { useSharedBooks } from '../hooks/useSharing';
import DeleteEntrySheet from '../components/ui/DeleteEntrySheet';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const fmt12h = (time) => {
  if (!time) return '—';
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour   = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
};

const PAYMENT_LABELS = { cash: 'Cash', online: 'Online', cheque: 'Cheque', other: 'Other' };

// ── Row Component ─────────────────────────────────────────────────────────────

const DetailRow = ({ label, value, C, Font }) => (
  <View style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
    <Text style={{ fontSize: 13, fontFamily: Font.regular, color: C.textMuted, lineHeight: 18 }}>{label}</Text>
    <Text style={{ fontSize: 14, fontFamily: Font.medium, color: C.text, lineHeight: 20, textAlign: 'right', flex: 1 }} numberOfLines={2}>{value || '—'}</Text>
  </View>
);

// ── Screen ────────────────────────────────────────────────────────────────────

export default function EntryDetailScreen() {
  const router    = useRouter();
  const basePath  = useBookBasePath();
  const { id, eid } = useLocalSearchParams();
  const { C, Font, isDark } = useTheme();
  const s = useMemo(() => makeStyles(C, Font), [C, Font]);
  const qc = useQueryClient();

  const [showMenu,         setShowMenu]         = useState(false);
  const [showAttachViewer, setShowAttachViewer] = useState(false);
  const [showDeleteSheet,  setShowDeleteSheet]  = useState(false);

  const { data: books = [] } = useBooks();
  const { data: sharedBooks = [] } = useSharedBooks();
  const isOwner = books.some(b => b.id === id);
  const sharedBook = !isOwner ? sharedBooks.find(b => b.id === id) : null;
  const rights = isOwner ? 'view_create_edit_delete' : (sharedBook?.rights ?? 'view');
  const canEdit   = rights === 'view_create_edit' || rights === 'view_create_edit_delete';
  const canDelete = rights === 'view_create_edit_delete';

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['entries', id],
    queryFn: () => apiGetEntries(id),
    staleTime: 1000 * 60 * 2,
    enabled: !!id,
  });

  const entry = entries.find(e => e.id === eid);

  const deleteEntry = useMutation({
    mutationFn: () => apiDeleteEntry(id, eid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries', id] });
      qc.invalidateQueries({ queryKey: ['summary', id] });
      qc.invalidateQueries({ queryKey: ['books'] });
      qc.invalidateQueries({ queryKey: ['categories', id] });
      qc.invalidateQueries({ queryKey: ['category-entries', id] });
      router.replace({ pathname: `${basePath}/[id]`, params: { id } });
    },
  });

  const handleDelete = () => {
    setShowMenu(false);
    setShowDeleteSheet(true);
  };

  const isIn           = entry?.type === 'in';
  const typeColor      = isIn ? C.cashIn : C.danger;
  const typeBg         = isIn ? C.cashInLight : C.dangerLight;
  const categoryDeleted = !!(entry?.category && !entry?.category_id);
  const attachType = entry?.attachment_path?.endsWith('.pdf') ? 'pdf' : (entry?.attachment_url ? 'image' : null);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.replace({ pathname: `${basePath}/[id]`, params: { id } })} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <ChevronLeftIcon color="#fff" size={22} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Entry Detail</Text>
        {(canEdit || canDelete) ? (
          <TouchableOpacity onPress={() => setShowMenu(true)} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <DotsVerticalIcon color="#fff" size={22} />
          </TouchableOpacity>
        ) : (
          <View style={s.headerBtn} />
        )}
      </View>

      {isLoading || !entry ? (
        <View style={s.loadingBox}>
          <Text style={s.loadingText}>{isLoading ? 'Loading…' : 'Entry not found.'}</Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

            <View style={[s.amountCard, { backgroundColor: typeBg }]}>
              <View style={[s.typePill, { backgroundColor: typeColor }]}>
                <Text style={s.typePillText}>{isIn ? 'Cash In' : 'Cash Out'}</Text>
              </View>
              <Text style={[s.amountText, { color: typeColor }]}>
                {isIn ? '+' : '-'}{entry.amount.toLocaleString()}
              </Text>
              <Text style={s.amountDate}>{formatDate(entry.entry_date)}  ·  {fmt12h(entry.entry_time)}</Text>
            </View>

            <View style={s.detailCard}>
              <DetailRow label="Remark"       value={entry.remark}                       C={C} Font={Font} />
              <DetailRow label="Category" value={categoryDeleted ? null : entry.category} C={C} Font={Font} />
              <DetailRow label="Payment Mode" value={PAYMENT_LABELS[entry.payment_mode] ?? entry.payment_mode} C={C} Font={Font} />
              {entry.customer_id && (
                <DetailRow label="Customer" value={entry.contact_name} C={C} Font={Font} />
              )}
              {entry.supplier_id && (
                <DetailRow label="Supplier" value={entry.contact_name} C={C} Font={Font} />
              )}
              <DetailRow label="Date"         value={formatDate(entry.entry_date)}       C={C} Font={Font} />
              <DetailRow label="Time"         value={fmt12h(entry.entry_time)}                   C={C} Font={Font} />
              <View style={{ paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, fontFamily: Font.regular, color: C.textMuted }}>Entry by</Text>
                <Text style={{ fontSize: 14, fontFamily: Font.medium, color: C.text }}>You</Text>
              </View>
            </View>

            {/* Attachment card */}
            {attachType && (
              <View style={[s.attachCard, { backgroundColor: C.card, borderColor: C.border }]}>
                {attachType === 'image' ? (
                  <Image source={{ uri: entry.attachment_url }} style={s.attachThumb} resizeMode="cover" />
                ) : (
                  <View style={[s.attachPdfIcon, { backgroundColor: C.dangerLight }]}>
                    <Feather name="file-text" size={20} color={C.danger} />
                  </View>
                )}
                <View style={s.attachBody}>
                  <Text style={[s.attachName, { color: C.text, fontFamily: Font.semiBold }]} numberOfLines={1}>
                    {attachType === 'pdf'
                      ? (entry.attachment_path?.split('/').pop() || 'Document.pdf')
                      : 'Attached Photo'}
                  </Text>
                  <Text style={[s.attachSub, { color: C.textMuted, fontFamily: Font.regular }]}>
                    {attachType === 'pdf' ? 'PDF Document' : 'Image'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[s.viewBtn, { backgroundColor: C.primaryLight }]}
                  onPress={() => {
                    if (attachType === 'image') {
                      setShowAttachViewer(true);
                    } else {
                      Linking.openURL(entry.attachment_url);
                    }
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={[s.viewBtnText, { color: C.primary, fontFamily: Font.semiBold }]}>View</Text>
                </TouchableOpacity>
              </View>
            )}

          </ScrollView>

          {/* Image viewer modal */}
          {showAttachViewer && (
            <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={() => setShowAttachViewer(false)}>
              <View style={s.viewerBg}>
                <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowAttachViewer(false)} />
                <TouchableOpacity style={s.viewerClose} onPress={() => setShowAttachViewer(false)} activeOpacity={0.8}>
                  <Feather name="x" size={20} color="#fff" />
                </TouchableOpacity>
                <Image
                  source={{ uri: entry?.attachment_url }}
                  style={s.viewerImage}
                  resizeMode="contain"
                />
              </View>
            </Modal>
          )}

          {/* Bottom bar — Edit only (hidden for view-only collaborators) */}
          {canEdit && (
            <View style={s.bottomBar}>
              <TouchableOpacity
                style={[s.editBtn, { borderColor: typeColor }]}
                onPress={() => router.push({ pathname: `${basePath}/[id]/edit-entry`, params: { id, eid } })}
                activeOpacity={0.8}
              >
                <PencilIcon color={typeColor} size={16} />
                <Text style={[s.actionBtnText, { color: typeColor }]}>Edit Entry</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* 3-dot dropdown menu */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <Pressable style={s.menuOverlay} onPress={() => setShowMenu(false)}>
          <Pressable style={[s.menuBox, { backgroundColor: C.card, borderColor: C.border }]} onPress={() => {}}>

            {canDelete && (
              <TouchableOpacity style={s.menuItem} activeOpacity={0.7} onPress={handleDelete}>
                <TrashIcon color={C.danger} size={18} />
                <Text style={[s.menuItemText, { color: C.danger, fontFamily: Font.medium }]}>Delete Entry</Text>
              </TouchableOpacity>
            )}

          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete entry confirmation sheet */}
      <DeleteEntrySheet
        visible={showDeleteSheet}
        entry={entry}
        isLoading={deleteEntry.isPending}
        onDismiss={() => setShowDeleteSheet(false)}
        onConfirm={() => deleteEntry.mutate()}
        C={C}
        Font={Font}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeStyles = (C, Font) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },

  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 14,
  },
  headerBtn:   { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontFamily: Font.bold, color: '#fff', lineHeight: 24, textAlign: 'center' },

  loadingBox:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 14, fontFamily: Font.regular, color: C.textMuted },

  content: { padding: 16, gap: 12 },

  amountCard: {
    borderRadius: 16, padding: 24,
    alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: C.border,
  },
  typePill:     { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5 },
  typePillText: { fontSize: 12, fontFamily: Font.semiBold, color: '#fff', lineHeight: 18 },
  amountText:   { fontSize: 36, fontFamily: Font.extraBold, lineHeight: 44, letterSpacing: -0.5 },
  amountDate:   { fontSize: 13, fontFamily: Font.regular, color: C.textMuted, lineHeight: 20 },

  detailCard: {
    backgroundColor: C.card, borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1, borderColor: C.border,
  },

  bottomBar: {
    padding: 16, backgroundColor: C.card,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, minHeight: 52,
  },
  actionBtnText: { fontSize: 14, fontFamily: Font.bold, lineHeight: 20 },

  menuOverlay: { flex: 1 },
  menuBox: {
    position: 'absolute', top: 60, right: 12,
    borderRadius: 14, borderWidth: 1,
    minWidth: 190,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 8,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 15, minHeight: 50,
  },
  menuItemText: { fontSize: 14, lineHeight: 20 },
  menuDivider:  { height: 1, marginHorizontal: 0 },

  // Attachment card
  attachCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, borderWidth: 1,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  attachThumb:   { width: 52, height: 52, borderRadius: 10 },
  attachPdfIcon: { width: 52, height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  attachBody:    { flex: 1 },
  attachName:    { fontSize: 14, lineHeight: 20 },
  attachSub:     { fontSize: 12, lineHeight: 17, marginTop: 2 },
  viewBtn:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  viewBtnText:   { fontSize: 13, lineHeight: 18 },

  // Full-screen image viewer
  viewerBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center', justifyContent: 'center',
  },
  viewerClose: {
    position: 'absolute', top: 56, right: 20, zIndex: 20,
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  viewerImage: { width: '92%', height: '75%', borderRadius: 8 },
});
