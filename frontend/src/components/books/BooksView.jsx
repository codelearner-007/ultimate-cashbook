import React, { useState, useMemo, useCallback, memo, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  StatusBar, TextInput, Modal, Alert, ActivityIndicator, Pressable, Image, Dimensions, Animated,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import SafeAreaView from '../ui/AppSafeAreaView';
import { useRouter } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';
import { useBooks, useCreateBook, useRenameBook, useDeleteBook } from '../../hooks/useBooks';
import { useBookSort } from '../../hooks/useBookSort';
import { useAuthStore } from '../../store/authStore';
import { useProfile, useUpdateProfile } from '../../hooks/useProfile';
import { useSharedBooks, useLeaveSharedBook, useReceivedInvitations } from '../../hooks/useSharing';
import { useRealtimeInvitations, useRealtimeBooks } from '../../hooks/useRealtimeSync';
import { useWorkspaceStore } from '../../store/workspaceStore';
import Toast from '../../lib/toast';
import { getLimit } from '../../lib/canAccess';
import { shadow } from '../../constants/shadows';
import { CARD_ACCENTS } from '../../constants/colors';
import SortSheet from './SortSheet';
import DraggableList from './DraggableList';
import BookMenu from './BookMenu';
import SearchBar from '../ui/SearchBar';
import DeleteBookSheet from '../ui/DeleteBookSheet';
import LeaveBookSheet from '../ui/LeaveBookSheet';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n) => (n < 0 ? '-' : '+') + Math.abs(n).toLocaleString();

const getInitials = (str = '') =>
  str.split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || '?';

const fmtLastEntry = (iso) => {
  if (!iso) return null;
  const d = new Date(iso.replace(/:(\d{2})$/, ''));
  if (isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date}  ·  ${time}`;
};

// ── Icons ─────────────────────────────────────────────────────────────────────

const SunIcon = ({ color, size = 18 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.4, height: size * 0.4, borderRadius: size * 0.2, backgroundColor: color }} />
    {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (
      <View key={i} style={{
        position: 'absolute', width: 2, height: size * 0.22,
        backgroundColor: color, borderRadius: 1,
        top: size * 0.04, left: size / 2 - 1,
        transformOrigin: `1px ${size * 0.46}px`,
        transform: [{ rotate: `${deg}deg` }, { translateY: -size * 0.28 }],
      }} />
    ))}
  </View>
);

const MoonIcon = ({ color, size = 18 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.75, height: size * 0.75, borderRadius: size * 0.375, backgroundColor: color }} />
    <View style={{ position: 'absolute', right: 0, top: 0, width: size * 0.6, height: size * 0.6, borderRadius: size * 0.3, backgroundColor: 'transparent', borderWidth: size * 0.3, borderColor: 'transparent' }} />
  </View>
);

const BookIcon = ({ color, size = 20 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.72, height: size * 0.88, borderRadius: 2, borderWidth: 1.5, borderColor: color, justifyContent: 'center', alignItems: 'center', gap: 3 }}>
      {[0, 1, 2].map(i => (
        <View key={i} style={{ width: size * 0.4, height: 1.5, backgroundColor: color, borderRadius: 1 }} />
      ))}
    </View>
  </View>
);

const GearIcon = ({ color, size = 20 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.45, height: size * 0.45, borderRadius: size * 0.225, borderWidth: 2, borderColor: color }} />
    <View style={{ position: 'absolute', width: size * 0.8, height: 2.5, backgroundColor: color, borderRadius: 1 }} />
    <View style={{ position: 'absolute', width: size * 0.8, height: 2.5, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '60deg' }] }} />
    <View style={{ position: 'absolute', width: size * 0.8, height: 2.5, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '120deg' }] }} />
  </View>
);

const HelpIcon = ({ color, size = 20 }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ fontSize: size * 0.55, color, fontWeight: '700', lineHeight: size * 0.65 }}>?</Text>
  </View>
);

const DotsIcon = ({ color, size = 16 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
    {[0, 1, 2].map(i => (
      <View key={i} style={{ width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: color }} />
    ))}
  </View>
);

const SharedIcon = ({ color, size = 18 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.5, height: size * 0.5, borderRadius: size * 0.25, borderWidth: 1.5, borderColor: color, position: 'absolute', left: size * 0.05, top: size * 0.12 }} />
    <View style={{ width: size * 0.5, height: size * 0.5, borderRadius: size * 0.25, borderWidth: 1.5, borderColor: color, position: 'absolute', right: size * 0.05, top: size * 0.12 }} />
    <View style={{ position: 'absolute', bottom: size * 0.05, left: size * 0.04, right: size * 0.04, height: size * 0.32, borderRadius: 3, borderWidth: 1.5, borderColor: color }} />
  </View>
);

const CheckIcon = ({ color, size = 16 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.55, height: 2, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '-45deg' }, { translateX: -size * 0.08 }, { translateY: size * 0.06 }] }} />
    <View style={{ width: size * 0.9, height: 2, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '45deg' }, { translateX: size * 0.08 }] }} />
  </View>
);

const PlusIcon = ({ color, size = 16 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ position: 'absolute', width: size, height: 2, backgroundColor: color, borderRadius: 1 }} />
    <View style={{ position: 'absolute', width: 2, height: size, backgroundColor: color, borderRadius: 1 }} />
  </View>
);

const XIcon = ({ color, size = 16 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ position: 'absolute', width: size, height: 2, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '45deg' }] }} />
    <View style={{ position: 'absolute', width: size, height: 2, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '-45deg' }] }} />
  </View>
);

const AnimatedChevron = memo(({ color }) => {
  const bounce = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: 3, duration: 600, useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [bounce]);
  return (
    <Animated.View style={{ transform: [{ translateY: bounce }] }}>
      <Feather name="chevron-down" size={12} color={color} />
    </Animated.View>
  );
});

// ── Sub-components ────────────────────────────────────────────────────────────

const StatItem = memo(({ label, value, dotColor, s }) => (
  <View style={s.statItem}>
    <Text style={s.statValue}>{value}</Text>
    <View style={s.statLabelRow}>
      <View style={[s.statDot, { backgroundColor: dotColor }]} />
      <Text style={s.statLabel}>{label}</Text>
    </View>
  </View>
));

const BookCard = memo(({ item, index, onPress, onMenuOpen, C, s }) => {
  const balance      = item.net_balance ?? 0;
  const accent       = CARD_ACCENTS[index % CARD_ACCENTS.length];
  const bookInitials = getInitials(item.name);
  const moreRef      = useRef(null);
  const lastEntry    = fmtLastEntry(item.last_entry_at);

  const handleMorePress = () => {
    moreRef.current?.measureInWindow((x, y, width, height) => {
      onMenuOpen({ pageX: x, pageY: y, width, height });
    });
  };

  return (
    <TouchableOpacity style={s.bookCard} onPress={onPress} activeOpacity={0.85}>
      <View style={[s.bookIconBox, { backgroundColor: accent + '18' }]}>
        <Text style={[s.bookInitials, { color: accent }]}>{bookInitials}</Text>
      </View>
      <View style={s.bookInfo}>
        <Text style={s.bookName} numberOfLines={1}>{item.name}</Text>
        <Text style={s.bookDate} numberOfLines={1}>
          {lastEntry ?? 'No entries yet'}
        </Text>
      </View>
      <View style={s.bookRight}>
        <View style={[s.balancePill, { backgroundColor: C.cardAlt }]}>
          <Text style={[s.balanceText, { color: C.text }]}>{fmt(balance)}</Text>
        </View>
        <TouchableOpacity
          ref={moreRef}
          onPress={handleMorePress}
          style={s.moreBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <DotsIcon color={C.textSubtle} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});

const SharedBookCard = memo(({ item, index, onPress, onLeave, C, s }) => {
  const balance  = item.net_balance ?? 0;
  const accent   = CARD_ACCENTS[index % CARD_ACCENTS.length];
  const initials = (item.owner_name || item.owner_email || '?')
    .split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase();
  const moreRef  = useRef(null);

  const handleMorePress = () => {
    moreRef.current?.measureInWindow((x, y, width, height) => {
      onLeave({ pageX: x, pageY: y, width, height });
    });
  };

  return (
    <TouchableOpacity style={s.bookCard} onPress={onPress} activeOpacity={0.85}>
      <View style={[s.bookIconBox, { backgroundColor: accent + '18' }]}>
        <Text style={[s.bookInitials, { color: accent }]}>{initials}</Text>
      </View>
      <View style={s.bookInfo}>
        <Text style={s.bookName} numberOfLines={1}>{item.name}</Text>
        <Text style={[s.bookDate, { color: C.primary }]} numberOfLines={1}>
          by {item.owner_name || item.owner_email}
        </Text>
      </View>
      <View style={s.bookRight}>
        <View style={[s.balancePill, { backgroundColor: C.cardAlt }]}>
          <Text style={[s.balanceText, { color: C.text }]}>{fmt(balance)}</Text>
        </View>
        <TouchableOpacity
          ref={moreRef}
          onPress={handleMorePress}
          style={s.moreBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <DotsIcon color={C.textSubtle} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});

// ── Workspace Switcher Sheet ──────────────────────────────────────────────────

const WsOption = memo(({ icon, title, subtitle, count, active, onPress, C, Font, IconComponent }) => (
  <TouchableOpacity
    style={[
      wss.option,
      {
        backgroundColor: active ? C.primaryLight : C.background,
        borderColor:     active ? C.primary      : C.border,
      },
    ]}
    onPress={onPress}
    activeOpacity={0.8}
  >
    {/* Left accent bar */}
    <View style={[wss.accentBar, { backgroundColor: active ? C.primary : 'transparent' }]} />

    {/* Icon */}
    <View style={[wss.optIcon, { backgroundColor: active ? C.primary : C.cardAlt }]}>
      <IconComponent color={active ? '#fff' : C.textSubtle} size={18} />
    </View>

    {/* Text */}
    <View style={wss.optBody}>
      <Text style={[wss.optTitle, { color: C.text, fontFamily: active ? Font.bold : Font.semiBold }]}>
        {title}
      </Text>
      <Text style={[wss.optSub, { color: C.textMuted, fontFamily: Font.regular }]}>
        {subtitle}
      </Text>
    </View>

    {/* Count pill */}
    <View style={[wss.countPill, { backgroundColor: active ? C.primary : C.cardAlt }]}>
      <Text style={[wss.countText, { color: active ? '#fff' : C.textMuted, fontFamily: Font.bold }]}>
        {count}
      </Text>
    </View>

    {/* Active check */}
    {active && (
      <View style={[wss.checkCircle, { backgroundColor: C.primary }]}>
        <Feather name="check" size={11} color="#fff" />
      </View>
    )}
  </TouchableOpacity>
));

const WorkspaceSwitcherSheet = memo(({
  visible, onClose, activeWorkspace, onSelect, personalCount, sharedCount, C, Font,
}) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <Pressable
      style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
      onPress={onClose}
    >
      <Pressable style={[wss.sheet, { backgroundColor: C.card }]} onPress={() => {}}>

        {/* Handle */}
        <View style={[wss.handle, { backgroundColor: C.border }]} />

        {/* Header */}
        <View style={wss.headerRow}>
          <View>
            <Text style={[wss.title, { color: C.text, fontFamily: Font.extraBold }]}>
              Switch Workspace
            </Text>
            <Text style={[wss.titleSub, { color: C.textMuted, fontFamily: Font.regular }]}>
              {sharedCount > 0 ? 'Tap a workspace to switch' : 'Your personal space'}
            </Text>
          </View>
          <TouchableOpacity
            style={[wss.closeBtn, { backgroundColor: C.cardAlt }]}
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="x" size={16} color={C.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View style={[wss.divider, { backgroundColor: C.border }]} />

        {/* Personal */}
        <WsOption
          icon="book-open"
          IconComponent={BookIcon}
          title="Personal Workspace"
          subtitle="Your own books"
          count={personalCount}
          active={activeWorkspace === 'personal'}
          onPress={() => { onSelect('personal'); onClose(); }}
          C={C}
          Font={Font}
        />

        {/* Shared — only rendered when the user actually has shared books */}
        {sharedCount > 0 && (
          <WsOption
            icon="users"
            IconComponent={SharedIcon}
            title="Shared with Me"
            subtitle="Access granted by others"
            count={sharedCount}
            active={activeWorkspace === 'shared'}
            onPress={() => { onSelect('shared'); onClose(); }}
            C={C}
            Font={Font}
          />
        )}

        <View style={{ height: 32 }} />
      </Pressable>
    </Pressable>
  </Modal>
));

const wss = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 10, paddingHorizontal: 20, overflow: 'hidden',
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },

  headerRow:  { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  title:      { fontSize: 20, lineHeight: 28 },
  titleSub:   { fontSize: 13, lineHeight: 19, marginTop: 2 },
  closeBtn:   { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 2 },

  divider: { height: 1, marginBottom: 14 },

  option: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 18, borderWidth: 1.5,
    marginBottom: 10, overflow: 'hidden',
    paddingVertical: 14, paddingRight: 14,
    gap: 0,
  },
  accentBar: { width: 4, alignSelf: 'stretch', marginRight: 14, borderRadius: 2 },
  optIcon:   { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  optBody:   { flex: 1 },
  optTitle:  { fontSize: 15, lineHeight: 22 },
  optSub:    { fontSize: 12, lineHeight: 18, marginTop: 1 },

  countPill: {
    minWidth: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 8, marginRight: 8,
  },
  countText: { fontSize: 13 },

  checkCircle: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
});

// ── BooksView ─────────────────────────────────────────────────────────────────

export default function BooksView({
  workspaceLabel    = 'Personal Workspace ▾',
  fabBottom         = 80,
  listPaddingBottom = 130,
  showBottomNav     = false,
  applyTopSafeArea  = true,
  bookBasePath      = '/(app)/books',
}) {
  const router = useRouter();
  const { C, Font, isDark, toggleTheme } = useTheme();
  const s = useMemo(() => makeStyles(C, Font), [C, Font]);

  const user = useAuthStore((st) => st.user);

  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();

  const { data: books = [], isLoading, isError, refetch } = useBooks();
  const createBook = useCreateBook();
  const renameBook = useRenameBook();
  const deleteBook = useDeleteBook();

  const isSuperAdmin = user?.role === 'superadmin';
  const tier         = user?.subscription_tier ?? 'free';
  const bookLimit    = getLimit(user, 'books');   // superadmin: Infinity | free: 3 | pro: 15 | business: Infinity
  const canAddBook   = books.length < bookLimit;

  const { data: sharedBooks = [], isLoading: sharedLoading } = useSharedBooks();
  const leaveSharedBook = useLeaveSharedBook();
  const { data: receivedInvitations = [] } = useReceivedInvitations();
  useRealtimeInvitations(user?.id);
  useRealtimeBooks();
  const pendingInviteCount = useMemo(
    () => receivedInvitations.filter(i => i.status === 'pending').length,
    [receivedInvitations]
  );
  const activeWorkspace    = useWorkspaceStore((s) => s.activeWorkspace);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const [showWorkspaceSwitcher, setShowWorkspaceSwitcher] = useState(false);

  const {
    sortMode, sortedBooks, showSort, setShowSort,
    handleSortSelect, setCustomBooks, sortLabel,
  } = useBookSort(books);

  const [hasArranged, setHasArranged] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSortSelectFull = useCallback((key) => {
    setHasArranged(false);
    handleSortSelect(key);
  }, [handleSortSelect]);

  // Add-book modal
  const [showModal,   setShowModal]   = useState(false);
  const [newBookName, setNewBookName] = useState('');

  // Popup menu state: { book, anchor } or null
  const [menuState, setMenuState] = useState(null);

  // Dialog states
  const [renameDialog,      setRenameDialog]      = useState(null); // book | null
  const [renameText,        setRenameText]        = useState('');
  const [deleteDialog,      setDeleteDialog]      = useState(null); // book | null
  const deleteBookSheetCloseRef = useRef(null);
  const [leaveDialog,       setLeaveDialog]       = useState(null); // book | null

  const currency = profile?.currency ?? 'PKR';

  const stats = useMemo(() => {
    if (activeWorkspace === 'shared') {
      return {
        total:    sharedBooks.reduce((acc, b) => acc + (b.net_balance ?? 0), 0),
        personal: books.length,
      };
    }
    return {
      total:    books.reduce((acc, b) => acc + (b.net_balance ?? 0), 0),
      personal: books.length,
    };
  }, [books, sharedBooks, activeWorkspace]);

  const filteredBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sortedBooks;
    return sortedBooks.filter(b => b.name?.toLowerCase().includes(q));
  }, [sortedBooks, searchQuery]);

  const filteredSharedBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sharedBooks;
    return sharedBooks.filter(b => b.name?.toLowerCase().includes(q));
  }, [sharedBooks, searchQuery]);

  const handleLeaveBook = useCallback((book) => {
    setLeaveDialog(book);
  }, []);

  const handleConfirmLeave = useCallback(() => {
    if (!leaveDialog) return;
    leaveSharedBook.mutate(leaveDialog.id, {
      onSuccess: () => setLeaveDialog(null),
      onError: () => {
        setLeaveDialog(null);
        Toast.error('Could not leave this book. Please try again.');
      },
    });
  }, [leaveDialog, leaveSharedBook]);

  // Auto-reset to personal when the last shared book disappears
  useEffect(() => {
    if (sharedBooks.length === 0 && activeWorkspace === 'shared') {
      setActiveWorkspace('personal');
    }
  }, [sharedBooks.length, activeWorkspace]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleThemeToggle = useCallback(() => {
    const next = !isDark;
    toggleTheme();
    updateProfile.mutate(
      { is_dark_mode: next },
      {
        onError: () => {
          toggleTheme(); // roll back
          Toast.show({ type: 'error', text1: 'Could not save theme preference.' });
        },
      },
    );
  }, [isDark, toggleTheme, updateProfile]);

  const handleCreate = useCallback(() => {
    if (!newBookName.trim()) return;
    const currency = profile?.currency ?? 'PKR';
    createBook.mutate(
      { name: newBookName.trim(), currency },
      {
        onSuccess: () => {
          setNewBookName('');
          setShowModal(false);
        },
        onError: (err) => {
          const detail = err?.response?.data?.detail ?? err?.message ?? 'Network error';
          Alert.alert('Could not create book', detail);
        },
      },
    );
  }, [newBookName, createBook]);

  const handleMenuSelect = useCallback((key, book) => {
    setMenuState(null);
    if (!book) return;
    switch (key) {
      case 'rename':
        setRenameDialog(book);
        setRenameText(book.name);
        break;
      case 'settings':
        router.push({ pathname: `${bookBasePath}/[id]/book-settings`, params: { id: book.id, name: book.name } });
        break;
      case 'delete':
        setDeleteDialog(book);
        break;
    }
  }, [router, bookBasePath]);

  const handleRenameSubmit = useCallback(() => {
    if (!renameText.trim() || !renameDialog) return;
    renameBook.mutate(
      { bookId: renameDialog.id, name: renameText.trim() },
      { onError: () => Alert.alert('Error', 'Could not rename book. Please try again.') },
    );
    setRenameDialog(null);
    setRenameText('');
  }, [renameText, renameDialog, renameBook]);

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteDialog) return;
    const bookId = deleteDialog.id;
    deleteBook.mutate(bookId, {
      onSuccess: () => {
        deleteBookSheetCloseRef.current?.(() => setDeleteDialog(null));
      },
      onError: () => Alert.alert('Error', 'Could not delete book. Please try again.'),
    });
  }, [deleteDialog, deleteBook]);

  const userInitials = useMemo(() => getInitials(user?.full_name ?? ''), [user]);
  const userName     = user?.full_name ?? '';

  const handleBookPress = useCallback((book) => {
    router.push({ pathname: `${bookBasePath}/[id]`, params: { id: book.id, name: book.name } });
  }, [router, bookBasePath]);

  const renderBook = useCallback(({ item, index }) => (
    <BookCard
      item={item} index={index} C={C} s={s}
      onPress={() => handleBookPress(item)}
      onMenuOpen={(anchor) => setMenuState({ book: item, anchor, isShared: false })}
    />
  ), [C, s, handleBookPress]);

  const closeModal = useCallback(() => { setShowModal(false); setNewBookName(''); }, []);

  const ListHeader = useMemo(() => (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{activeWorkspace === 'shared' ? 'Shared Books' : 'Your Books'}</Text>
      {sortMode === 'custom' && !hasArranged ? (
        <TouchableOpacity
          style={s.doneArrangeBtn}
          onPress={() => setHasArranged(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.8}
        >
          <Text style={s.doneArrangeBtnText}>Done ✓</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[s.sortBtn, sortMode !== 'updated' && s.sortBtnActive]}
          onPress={() => setShowSort(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[s.sortBtnText, sortMode !== 'updated' && s.sortBtnTextActive]}>
            {sortMode === 'updated' ? 'Sort  ≡' : `${sortLabel}  ≡`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  ), [s, sortMode, sortLabel, hasArranged, setShowSort]);

  const ListEmpty = useMemo(() => (
    <View style={s.empty}>
      <View style={s.emptyIconBox}>
        {activeWorkspace === 'shared'
          ? <SharedIcon color={C.primary} size={36} />
          : <BookIcon   color={C.primary} size={36} />}
      </View>
      {searchQuery.trim() ? (
        <>
          <Text style={s.emptyTitle}>No results found</Text>
          <Text style={s.emptySub}>No books match "{searchQuery.trim()}"</Text>
        </>
      ) : activeWorkspace === 'shared' ? (
        <>
          <Text style={s.emptyTitle}>No shared books</Text>
          <Text style={s.emptySub}>When someone shares a book{'\n'}with you, it'll appear here</Text>
        </>
      ) : (
        <>
          <Text style={s.emptyTitle}>No books yet</Text>
          <Text style={s.emptySub}>Tap "Add New Book" to start{'\n'}tracking your cash flow</Text>
        </>
      )}
    </View>
  ), [s, C, searchQuery, activeWorkspace]);

  return (
    <SafeAreaView applyTop={applyTopSafeArea} style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <View style={s.headerLeft}>
            <TouchableOpacity
              onPress={() => router.push('/(app)/settings/profile')}
              activeOpacity={0.8}
              style={s.avatarCircle}
            >
              {profile?.avatar_url
                ? <Image source={{ uri: profile.avatar_url }} style={s.avatarImg} />
                : <Text style={s.avatarText}>{userInitials}</Text>
              }
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Text style={[s.bizName, { flexShrink: 1 }]} numberOfLines={1}>{userName || 'My Account'}</Text>
                <TouchableOpacity
                  onPress={() => router.push('/(app)/settings/subscription')}
                  style={[s.tierChip, { backgroundColor: 'rgba(255,255,255,0.22)' }]}
                  activeOpacity={0.75}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Text style={[s.tierChipText, {
                    color: isSuperAdmin ? '#10B981' : tier === 'pro' ? '#F59E0B' : tier === 'business' ? '#8B5CF6' : C.onPrimary,
                  }]}>
                    {isSuperAdmin ? 'ADMIN' : tier === 'free' ? 'FREE' : tier === 'pro' ? 'PRO' : 'BUSINESS'}
                  </Text>
                </TouchableOpacity>
              </View>
              {sharedBooks.length > 0 ? (
                <TouchableOpacity onPress={() => setShowWorkspaceSwitcher(true)} activeOpacity={0.7}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Text style={s.bizSub}>
                      {activeWorkspace === 'shared' ? 'Shared Books' : 'Personal Workspace'}
                    </Text>
                    <AnimatedChevron color={C.onPrimaryMuted} />
                  </View>
                </TouchableOpacity>
              ) : (
                <Text style={s.bizSub}>Personal Workspace</Text>
              )}
            </View>
          </View>
          <View style={s.headerActions}>
            <TouchableOpacity onPress={handleThemeToggle} style={s.iconBtn} activeOpacity={0.8}>
              {isDark
                ? <SunIcon  color={C.onPrimary} size={18} />
                : <MoonIcon color={C.onPrimary} size={18} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* Balance */}
        <View style={s.balanceSection}>
          <Text style={s.balanceLabel}>TOTAL NET BALANCE</Text>
          <View style={s.balanceAmountRow}>
            {currency ? <Text style={s.balanceCurrency}>{currency}</Text> : null}
            <Text style={s.balanceAmount}>
              {isLoading ? '—' : stats.total.toLocaleString()}
            </Text>
          </View>
          <View style={s.balanceUnderline} />
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <StatItem label="My Books"     value={isLoading ? '—' : stats.personal}  dotColor={C.onPrimary}      s={s} />
          <View style={s.statDivider} />
          <StatItem label="Shared Books" value={sharedLoading ? '—' : sharedBooks.length} dotColor={C.onPrimaryMuted} s={s} />
        </View>
      </View>

      {/* ── Section header ──────────────────────────────────────────────── */}
      {ListHeader}

      {/* ── Free tier banner ────────────────────────────────────────────── */}
      {!isSuperAdmin && tier === 'free' && (
        <TouchableOpacity
          style={[s.freeBanner, { backgroundColor: C.cashInLight, borderColor: C.cashIn }]}
          onPress={() => router.push('/(app)/settings/subscription')}
          activeOpacity={0.8}
        >
          <Feather name="smartphone" size={13} color={C.cashIn} />
          <Text style={[s.freeBannerText, { color: C.cashIn, fontFamily: Font.medium }]}>
            Free plan · Data stored on this device only. Tap to upgrade.
          </Text>
          <Feather name="chevron-right" size={13} color={C.cashIn} />
        </TouchableOpacity>
      )}

      {/* ── Pending invitations banner ──────────────────────────────────── */}
      {pendingInviteCount > 0 && (
        <TouchableOpacity
          style={[s.inviteBanner, { backgroundColor: C.primaryLight, borderColor: C.primaryMid }]}
          onPress={() => router.push('/(app)/settings/manage-access')}
          activeOpacity={0.8}
        >
          <Feather name="bell" size={14} color={C.primary} />
          <Text style={[s.inviteBannerText, { color: C.primary, fontFamily: Font.medium }]}>
            {pendingInviteCount} pending book {pendingInviteCount === 1 ? 'invitation' : 'invitations'} — tap to respond
          </Text>
          <Feather name="chevron-right" size={14} color={C.primary} />
        </TouchableOpacity>
      )}

      {/* ── Search bar ──────────────────────────────────────────────────── */}
      <SearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search books…"
      />

      {/* ── Book list ───────────────────────────────────────────────────── */}
      {activeWorkspace === 'shared' ? (
        sharedLoading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={s.loadingText}>Loading shared books…</Text>
          </View>
        ) : (
          <FlatList
            data={filteredSharedBooks}
            keyExtractor={item => item.id}
            renderItem={({ item, index }) => (
              <SharedBookCard
                item={item} index={index} C={C} s={s}
                onPress={() => router.push({ pathname: `${bookBasePath}/[id]`, params: { id: item.id, name: item.name } })}
                onLeave={(anchor) => setMenuState({ book: item, anchor, isShared: true })}
              />
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: listPaddingBottom }}
            ListEmptyComponent={ListEmpty}
          />
        )
      ) : isLoading ? (
        <View style={s.loadingBox}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={s.loadingText}>Loading your books…</Text>
        </View>
      ) : isError ? (
        <View style={s.errorBox}>
          <Text style={s.errorTitle}>Couldn't load books</Text>
          <TouchableOpacity style={s.retryBtn} onPress={refetch}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : sortMode === 'custom' && !hasArranged && filteredBooks.length > 0 ? (
        <DraggableList
          books={filteredBooks}
          onReorder={setCustomBooks}
          onBookPress={handleBookPress}
          onBookMenu={(book, anchor) => setMenuState({ book, anchor, isShared: false })}
          listPaddingBottom={listPaddingBottom}
          C={C}
          Font={Font}
        />
      ) : (
        <FlatList
          data={filteredBooks}
          keyExtractor={item => item.id}
          renderItem={renderBook}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: listPaddingBottom }}
          ListEmptyComponent={ListEmpty}
        />
      )}

      {/* ── FAB (personal workspace only) ───────────────────────────────── */}
      {activeWorkspace === 'personal' && (
        <TouchableOpacity
          style={[s.fab, { bottom: fabBottom }]}
          onPress={() => {
            if (!canAddBook) {
              router.push('/(app)/settings/subscription');
              return;
            }
            setShowModal(true);
          }}
          activeOpacity={0.85}
        >
          {canAddBook
            ? <PlusIcon color={C.onPrimary} size={16} />
            : <Text style={{ fontSize: 15 }}>👑</Text>
          }
          <Text style={s.fabText}>
            {canAddBook
              ? 'ADD NEW BOOK'
              : bookLimit === 3 ? 'UPGRADE — FREE LIMIT (3)' : `UPGRADE — PRO LIMIT (${bookLimit})`
            }
          </Text>
        </TouchableOpacity>
      )}

      {/* ── Bottom nav (regular user only) ──────────────────────────────── */}
      {showBottomNav && (
        <View style={s.bottomNav}>
          {[
            { label: 'My Books', Icon: BookIcon, active: true,  onPress: () => {} },
            { label: 'Help',      Icon: HelpIcon, active: false, onPress: () => {} },
            { label: 'Settings',  Icon: GearIcon, active: false, onPress: () => router.push('/(app)/settings') },
          ].map(tab => (
            <TouchableOpacity key={tab.label} style={s.navItem} onPress={tab.onPress}>
              <tab.Icon color={tab.active ? C.primary : C.textMuted} size={22} />
              <Text style={tab.active ? s.navLabelActive : s.navLabel}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Popup book menu ─────────────────────────────────────────────── */}
      {!menuState?.isShared && (
        <BookMenu
          book={menuState?.book}
          anchor={menuState?.anchor}
          C={C}
          Font={Font}
          onClose={() => setMenuState(null)}
          onSelect={handleMenuSelect}
        />
      )}

      {/* ── Shared-book action popup ─────────────────────────────────────── */}
      {menuState?.isShared && (
        <Modal visible transparent animationType="none" onRequestClose={() => setMenuState(null)}>
          <Pressable style={{ flex: 1 }} onPress={() => setMenuState(null)}>
            <Pressable
              style={[s.leavePopup, {
                position: 'absolute',
                top:  (menuState.anchor?.pageY ?? 200) + (menuState.anchor?.height ?? 28) + 6,
                left: Math.min(
                  (menuState.anchor?.pageX ?? 300) - 180 + (menuState.anchor?.width ?? 28),
                  Dimensions.get('window').width - 208,
                ),
                backgroundColor: C.card,
                borderColor: C.border,
              }]}
              onPress={() => {}}
            >
              <TouchableOpacity
                style={s.leaveBtn}
                onPress={() => { setMenuState(null); handleLeaveBook(menuState.book); }}
                activeOpacity={0.75}
              >
                <Feather name="log-out" size={15} color={C.danger} />
                <Text style={[s.leaveBtnText, { color: C.danger, fontFamily: Font.medium }]}>
                  Leave Book
                </Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* ── Workspace switcher sheet ─────────────────────────────────────── */}
      <WorkspaceSwitcherSheet
        visible={showWorkspaceSwitcher}
        onClose={() => setShowWorkspaceSwitcher(false)}
        activeWorkspace={activeWorkspace}
        onSelect={setActiveWorkspace}
        personalCount={books.length}
        sharedCount={sharedBooks.length}
        C={C}
        Font={Font}
      />

      {/* ── Sort sheet ──────────────────────────────────────────────────── */}
      <SortSheet
        visible={showSort}
        current={sortMode}
        onSelect={handleSortSelectFull}
        onClose={() => setShowSort(false)}
      />

      {/* ── Rename dialog ───────────────────────────────────────────────── */}
      <Modal visible={!!renameDialog} transparent animationType="fade" onRequestClose={() => setRenameDialog(null)}>
        <Pressable style={s.dialogOverlay} onPress={() => setRenameDialog(null)}>
          <Pressable style={s.dialogCard} onPress={() => {}}>
            <Text style={s.dialogTitle}>Rename</Text>
            <Text style={s.dialogSub}>Enter a new name for this book</Text>
            <TextInput
              style={s.dialogInput}
              placeholder="Book name"
              placeholderTextColor={C.textSubtle}
              value={renameText}
              onChangeText={setRenameText}
              autoFocus
              maxLength={40}
            />
            <Text style={s.charCount}>{renameText.length}/40</Text>
            <View style={s.dialogBtns}>
              <TouchableOpacity style={s.dlgCancel} onPress={() => setRenameDialog(null)}>
                <Text style={s.dlgCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.dlgAction, !renameText.trim() && s.dlgActionDisabled]}
                onPress={handleRenameSubmit}
                disabled={!renameText.trim() || renameBook.isPending}
              >
                <Text style={s.dlgActionText}>{renameBook.isPending ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Delete book sheet ───────────────────────────────────────────── */}
      <DeleteBookSheet
        visible={!!deleteDialog}
        onDismiss={() => setDeleteDialog(null)}
        onConfirm={handleDeleteConfirm}
        bookName={deleteDialog?.name ?? ''}
        isLoading={deleteBook.isPending}
        C={C}
        Font={Font}
        closeRef={deleteBookSheetCloseRef}
      />

      <LeaveBookSheet
        visible={!!leaveDialog}
        onDismiss={() => setLeaveDialog(null)}
        onConfirm={handleConfirmLeave}
        bookName={leaveDialog?.name ?? ''}
        isLoading={leaveSharedBook.isPending}
        C={C}
        Font={Font}
      />

      {/* ── Add book modal (slide-up) ────────────────────────────────────── */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={closeModal}>
        <Pressable style={s.modalOverlay} onPress={closeModal}>
          <Pressable style={s.modalBox} onPress={() => {}}>
            <View style={s.modalHandle} />
            <View style={s.modalTitleRow}>
              <Text style={s.modalTitle}>New Book</Text>
              <TouchableOpacity
                style={s.modalCloseBtn}
                onPress={closeModal}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <XIcon color={C.textMuted} size={16} />
              </TouchableOpacity>
            </View>
            <Text style={s.modalSub}>Give it a clear, recognisable name</Text>
            <TextInput
              style={s.modalInput}
              placeholder="e.g. Business Expenses, Personal"
              placeholderTextColor={C.textSubtle}
              value={newBookName}
              onChangeText={setNewBookName}
              autoFocus
              maxLength={40}
            />
            <Text style={s.charCount}>{newBookName.length}/40</Text>
            <View style={s.modalActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={closeModal}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.createBtn, !newBookName.trim() && s.createBtnDisabled]}
                onPress={handleCreate}
                disabled={!newBookName.trim() || createBook.isPending}
              >
                <Text style={s.createBtnText}>{createBook.isPending ? 'Creating…' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeStyles = (C, Font) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },

  // Header
  header:        { backgroundColor: C.primary, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16 },
  headerTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headerLeft:    { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  bizIconBox:  { width: 44, height: 44, borderRadius: 12, backgroundColor: C.onPrimaryIconBg, alignItems: 'center', justifyContent: 'center' },
  bizIconText: { fontSize: 17, fontFamily: Font.extraBold, color: C.onPrimary },
  bizName:     { fontSize: 15, fontFamily: Font.bold,      color: C.onPrimary,      lineHeight: 22 },
  bizSub:      { fontSize: 12, fontFamily: Font.regular,   color: C.onPrimaryMuted, lineHeight: 18, marginTop: 1 },

  tierChip:     { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tierChipText: { fontSize: 10, fontFamily: Font.bold, letterSpacing: 0.8, lineHeight: 14 },

  iconBtn:      { width: 44, height: 44, borderRadius: 22, backgroundColor: C.onPrimaryIconBg, alignItems: 'center', justifyContent: 'center' },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.onPrimaryIconBg, borderWidth: 2, borderColor: C.onPrimarySubtle, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg:    { width: 44, height: 44, borderRadius: 22 },
  avatarText:   { fontSize: 14, fontFamily: Font.bold, color: C.onPrimary },

  // Balance
  balanceSection:  { alignItems: 'center', marginBottom: 14 },
  balanceLabel:    { fontSize: 10, fontFamily: Font.semiBold, color: C.onPrimaryMuted, letterSpacing: 1.4, marginBottom: 6 },
  balanceAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  balanceCurrency: { fontSize: 15, fontFamily: Font.medium,   color: C.onPrimaryMuted },
  balanceAmount:   { fontSize: 32, fontFamily: Font.extraBold, color: C.onPrimary, letterSpacing: -1, lineHeight: 38 },
  balanceUnderline:{ width: 48, height: 3, borderRadius: 2, backgroundColor: C.onPrimarySubtle },

  // Stats
  statsRow:     { flexDirection: 'row', alignItems: 'center' },
  statItem:     { flex: 1, alignItems: 'center' },
  statValue:    { fontSize: 15, fontFamily: Font.bold,   color: C.onPrimary,      marginBottom: 2, lineHeight: 20 },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statDot:      { width: 6, height: 6, borderRadius: 3 },
  statLabel:    { fontSize: 11, fontFamily: Font.medium, color: C.onPrimaryMuted, lineHeight: 16 },
  statDivider:  { width: 1, height: 32, backgroundColor: C.onPrimaryIconBg },

  // Section header
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10,
  },
  sectionTitle:     { fontSize: 15, fontFamily: Font.bold, color: C.text, lineHeight: 22 },
  sortBtn:          { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: C.primaryLight },
  sortBtnActive:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 24, backgroundColor: C.primary, ...shadow(C.primary, 2, 8, 0.28) },
  sortBtnText:      { fontSize: 12, fontFamily: Font.semiBold, color: C.primary, lineHeight: 18 },
  sortBtnTextActive:{ fontSize: 12, fontFamily: Font.extraBold, color: C.onPrimary, lineHeight: 18, letterSpacing: 0.6 },
  doneArrangeBtn:   { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 24, backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', ...shadow(C.primary, 2, 8, 0.28) },
  doneArrangeBtnText: { fontSize: 12, fontFamily: Font.extraBold, color: C.onPrimary, lineHeight: 18, letterSpacing: 0.6 },

  // Pending invitations banner
  inviteBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 4,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  inviteBannerText: { flex: 1, fontSize: 12, lineHeight: 18 },

  freeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 4,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  freeBannerText: { flex: 1, fontSize: 12, lineHeight: 18 },

  // Loading / error
  loadingBox:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingText: { fontSize: 14, fontFamily: Font.regular, color: C.textMuted, lineHeight: 20 },
  errorBox:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 40 },
  errorTitle:  { fontSize: 15, fontFamily: Font.medium, color: C.textMuted, textAlign: 'center' },
  retryBtn:    { backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  retryText:   { color: C.onPrimary, fontFamily: Font.semiBold, fontSize: 14 },

  // Book card
  bookCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, marginHorizontal: 16, marginBottom: 10, borderRadius: 50, paddingVertical: 6, paddingLeft: 6, paddingRight: 14, borderWidth: 1.5, borderColor: C.border },
  bookIconBox:  { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  bookInitials: { fontSize: 15, fontFamily: Font.extraBold },
  bookInfo:     { flex: 1, marginRight: 8 },
  bookName:     { fontSize: 14, fontFamily: Font.semiBold, color: C.text,      lineHeight: 20 },
  bookDate:     { fontSize: 12, fontFamily: Font.regular,  color: C.textMuted, lineHeight: 18, marginTop: 2 },
  bookRight:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  balancePill:  { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, minWidth: 56, alignItems: 'center' },
  balanceText:  { fontSize: 13, fontFamily: Font.bold, lineHeight: 18 },
  moreBtn:      { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

  // Empty state
  empty:        { alignItems: 'center', paddingTop: 70, paddingHorizontal: 40 },
  emptyIconBox: { width: 80, height: 80, borderRadius: 24, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle:   { fontSize: 17, fontFamily: Font.bold,    color: C.text,     lineHeight: 26, marginBottom: 8 },
  emptySub:     { fontSize: 13, fontFamily: Font.regular, color: C.textMuted, lineHeight: 20, textAlign: 'center' },

  // FAB
  fab: {
    position: 'absolute', alignSelf: 'center',
    backgroundColor: C.primary, borderRadius: 32,
    paddingHorizontal: 28, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52,
    ...shadow(C.primary, 2, 8, 0.25),
  },
  fabText: { color: C.onPrimary, fontFamily: Font.extraBold, fontSize: 13, letterSpacing: 0.8, lineHeight: 18 },

  // Bottom nav
  bottomNav:      { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 40, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, paddingBottom: 16, zIndex: 10, elevation: 10 },
  navItem:        { alignItems: 'center', gap: 4, minWidth: 56, minHeight: 44, justifyContent: 'center' },
  navLabel:       { fontSize: 11, fontFamily: Font.medium, color: C.textMuted, lineHeight: 16 },
  navLabelActive: { fontSize: 11, fontFamily: Font.bold,   color: C.primary,   lineHeight: 16 },

  // Centered dialog (rename / duplicate / delete / placeholder)
  dialogOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  dialogCard:    { width: '100%', backgroundColor: C.card, borderRadius: 20, padding: 24 },
  dialogTitle:   { fontSize: 18, fontFamily: Font.extraBold, color: C.text, lineHeight: 26, marginBottom: 8 },
  dialogSub:     { fontSize: 13, fontFamily: Font.regular, color: C.textMuted, lineHeight: 20, marginBottom: 20 },
  dialogInput:   { borderWidth: 1.5, borderColor: C.border, borderRadius: 12, padding: 14, fontSize: 15, fontFamily: Font.regular, color: C.text, backgroundColor: C.background, marginBottom: 6, lineHeight: 22 },
  charCount:     { fontSize: 11, fontFamily: Font.regular, color: C.textSubtle, textAlign: 'right', marginBottom: 20, lineHeight: 16 },
  dialogBtns:    { flexDirection: 'row', gap: 12 },
  dlgCancel:     { flex: 1, borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  dlgCancelText: { fontFamily: Font.semiBold, fontSize: 14, color: C.textMuted },
  dlgAction:     { flex: 1, backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  dlgActionDisabled: { backgroundColor: C.border },
  dlgActionText: { fontFamily: Font.bold, fontSize: 14, color: C.onPrimary },
  dlgDanger:     { flex: 1, backgroundColor: '#E53935', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  dlgDangerText: { fontFamily: Font.bold, fontSize: 14, color: '#fff' },

  // Shared book leave popup
  leavePopup: {
    width: 200, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18, shadowRadius: 16, elevation: 16,
  },
  leaveBtn:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13 },
  leaveBtnText: { fontSize: 14, lineHeight: 20 },

  // Slide-up modal (add new book)
  modalOverlay:    { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' },
  modalBox:        { backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingTop: 12 },
  modalHandle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 20 },
  modalTitleRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  modalTitle:      { fontSize: 20, fontFamily: Font.extraBold, color: C.text, lineHeight: 28 },
  modalCloseBtn:   { width: 32, height: 32, borderRadius: 16, backgroundColor: C.cardAlt, alignItems: 'center', justifyContent: 'center' },
  modalSub:        { fontSize: 13, fontFamily: Font.regular, color: C.textMuted, lineHeight: 20, marginBottom: 20 },
  modalInput:      { borderWidth: 1.5, borderColor: C.border, borderRadius: 14, padding: 16, fontSize: 15, fontFamily: Font.regular, color: C.text, backgroundColor: C.background, marginBottom: 6, lineHeight: 22 },
  modalActions:    { flexDirection: 'row', gap: 12 },
  cancelBtn:       { flex: 1, borderWidth: 1.5, borderColor: C.border, borderRadius: 14, paddingVertical: 15, alignItems: 'center', minHeight: 52 },
  cancelBtnText:   { fontFamily: Font.semiBold, fontSize: 15, color: C.textMuted, lineHeight: 22 },
  createBtn:       { flex: 1, backgroundColor: C.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center', minHeight: 52 },
  createBtnDisabled: { backgroundColor: C.border },
  createBtnText:   { fontFamily: Font.bold, fontSize: 15, color: C.onPrimary, lineHeight: 22 },
});
