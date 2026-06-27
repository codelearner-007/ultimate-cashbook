import React, { memo } from 'react';
import { Text, TouchableOpacity, Modal, Pressable, Dimensions, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const POPUP_W = 220;

// ── Popup menu ────────────────────────────────────────────────────────────────

const BookMenu = memo(({ book, anchor, onClose, onSelect, canSync, isSyncing, syncedBookId, C, Font }) => {
  if (!book) return null;

  const isSynced = syncedBookId === book.id;

  const ITEMS = [
    { key: 'rename',   label: 'Rename',        icon: 'edit-2',   danger: false },
    ...(canSync ? [{ key: 'sync', label: isSyncing ? 'Syncing…' : isSynced ? 'Synced' : 'Sync', icon: isSynced ? 'check-circle' : 'upload-cloud', danger: false, synced: isSynced }] : []),
    { key: 'settings', label: 'Book Settings', icon: 'settings', danger: false },
    { key: 'delete',   label: 'Delete Book',   icon: 'trash-2',  danger: true  },
  ];

  const ITEM_H  = 48;
  const PAD_V   = 6;
  const POPUP_H = ITEMS.length * ITEM_H + PAD_V * 2 + 8;

  const anchorX = anchor?.pageX ?? SCREEN_W - POPUP_W - 16;
  const anchorY = anchor?.pageY ?? SCREEN_H / 2;
  const btnW    = anchor?.width  ?? 32;
  const btnH    = anchor?.height ?? 32;

  let left = anchorX - POPUP_W + btnW;
  let top  = anchorY + btnH + 6;

  if (top + POPUP_H > SCREEN_H - 60) top  = anchorY - POPUP_H - 6;
  if (left < 8)                       left = 8;
  if (left + POPUP_W > SCREEN_W - 8)  left = SCREEN_W - POPUP_W - 8;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={{ flex: 1 }} onPress={onClose}>
        <Pressable
          style={{
            position: 'absolute', top, left,
            width: POPUP_W,
            backgroundColor: C.card,
            borderRadius: 14,
            paddingVertical: PAD_V,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.18,
            shadowRadius: 16,
            elevation: 16,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: C.border,
          }}
          onPress={() => {}}
        >
          {ITEMS.map((item) => (
            <TouchableOpacity
              key={item.key}
              onPress={() => onSelect(item.key, book)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 14,
                ...((item.key === 'settings' || item.key === 'delete') ? {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: C.border,
                } : {}),
              }}
              activeOpacity={0.7}
            >
              <Feather name={item.icon} size={16} color={item.danger ? C.danger : item.synced ? C.cashIn : C.textMuted} />
              <Text style={{ fontSize: 14, fontFamily: Font.medium, color: item.danger ? C.danger : item.synced ? C.cashIn : C.text, lineHeight: 20 }}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
});

export default BookMenu;
