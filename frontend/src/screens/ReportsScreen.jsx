import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, Platform,
  StatusBar, ScrollView, ActivityIndicator, Alert, Modal, Pressable,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Feather } from '@expo/vector-icons';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import SuccessDialog from '../components/ui/SuccessDialog';
import { useTheme } from '../hooks/useTheme';
import { apiGetEntries } from '../lib/dataSource';
import { useRealtimeEntries } from '../hooks/useRealtimeSync';
import { supabase } from '../lib/supabase';
import { useCustomers, useSuppliers } from '../hooks/useContacts';
import SearchBar from '../components/ui/SearchBar';
import { useAuthStore } from '../store/authStore';
import { canAccess } from '../lib/canAccess';
import CrownBadge from '../components/ui/CrownBadge';

const PAYMENT_LABEL = { cash: 'Cash', online: 'Online', cheque: 'Cheque', other: 'Other' };
const PAYMENT_ICON  = { cash: 'dollar-sign', online: 'wifi', cheque: 'file-text', check: 'file-text', other: 'more-horizontal' };
const DATE_LABELS   = { today: 'Today', yesterday: 'Yesterday', week: 'This Week', month: 'This Month' };
const BASE_URL = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');

function matchesDatePeriod(entryDate, period) {
  const d = new Date(entryDate + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (period === 'today') return d.toDateString() === today.toDateString();
  if (period === 'yesterday') { const y = new Date(today); y.setDate(today.getDate() - 1); return d.toDateString() === y.toDateString(); }
  if (period === 'week') { const w = new Date(today); w.setDate(today.getDate() - 6); return d >= w; }
  if (period === 'month') return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  return true;
}

const fmtDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function getDateRangeForFilter(filter) {
  if (!filter) return { from: null, to: null };
  const today = new Date();
  const todayStr = fmtDate(today);
  if (filter === 'today') return { from: todayStr, to: todayStr };
  if (filter === 'yesterday') {
    const y = new Date(today); y.setDate(today.getDate() - 1);
    const yStr = fmtDate(y);
    return { from: yStr, to: yStr };
  }
  if (filter === 'week') {
    const w = new Date(today); w.setDate(today.getDate() - 6);
    return { from: fmtDate(w), to: todayStr };
  }
  if (filter === 'month') {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: fmtDate(firstDay), to: todayStr };
  }
  return { from: null, to: null };
}

function displayDateRange(from, to) {
  if (!from && !to) return 'All entries';
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  const d1 = from ? new Date(from + 'T00:00:00').toLocaleDateString('en-US', opts) : 'Beginning';
  const d2 = to   ? new Date(to   + 'T00:00:00').toLocaleDateString('en-US', opts) : 'Today';
  return `${d1} – ${d2}`;
}

export default function ReportsScreen() {
  const router = useRouter();
  const {
    id, name,
    customFrom: paramFrom, customTo: paramTo,
    initialDate,
    initialType, initialContact, initialCategory, initialPayment,
  } = useLocalSearchParams();
  const { C, Font } = useTheme();
  useRealtimeEntries(id);

  const user       = useAuthStore(s => s.user);
  const canExport  = canAccess(user, 'export_reports');

  const [filterDate,        setFilterDate]        = useState(initialDate || null);
  const [filterType,        setFilterType]        = useState(initialType     || null);
  const [filterContact,     setFilterContact]     = useState(initialContact  || null);
  const [filterContactType, setFilterContactType] = useState(null);
  const [filterCategory,    setFilterCategory]    = useState(initialCategory || null);
  const [filterPayment,     setFilterPayment]     = useState(initialPayment  || null);
  const [activePicker,   setActivePicker]   = useState(null);
  const [contactTab,     setContactTab]     = useState('customers');
  const [contactSearch,  setContactSearch]  = useState('');
  const [exportType,  setExportType]  = useState(null); // 'pdf' | 'excel' | null
  const [exportPhase, setExportPhase] = useState(null); // 'generating' | 'ready'
  const [readyUri,    setReadyUri]    = useState(null);
  const [fileName,    setFileName]    = useState('');
  const [showSaved,   setShowSaved]   = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const { from: dateFrom, to: dateTo } = useMemo(() => {
    if (filterDate) return getDateRangeForFilter(filterDate);
    return { from: paramFrom || null, to: paramTo || null };
  }, [filterDate, paramFrom, paramTo]);

  const rangeLabel = useMemo(() => displayDateRange(dateFrom, dateTo), [dateFrom, dateTo]);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['report-entries', id, dateFrom, dateTo],
    queryFn: () => apiGetEntries(id, {
      ...(dateFrom ? { date_from: dateFrom } : {}),
      ...(dateTo   ? { date_to:   dateTo   } : {}),
    }),
    staleTime: 2 * 60 * 1000,
  });

  const { data: customers = [] } = useCustomers(id);
  const { data: suppliers = [] } = useSuppliers(id);

  const bookCategories = useMemo(() =>
    [...new Set(entries.map(e => e.category).filter(Boolean))],
    [entries]);

  const bookPayments = useMemo(() =>
    [...new Set(entries.map(e => e.payment_mode).filter(Boolean))],
    [entries]);

  const clearFilter = useCallback((key) => {
    if (key === 'date')     setFilterDate(null);
    if (key === 'type')     setFilterType(null);
    if (key === 'contact')  { setFilterContact(null); setFilterContactType(null); }
    if (key === 'category') setFilterCategory(null);
    if (key === 'payment')  setFilterPayment(null);
  }, []);

  const applyFilter = useCallback((key, val) => {
    if (key === 'date')     setFilterDate(val);
    if (key === 'type')     setFilterType(val);
    if (key === 'contact')  setFilterContact(val);
    if (key === 'category') setFilterCategory(val);
    if (key === 'payment')  setFilterPayment(val);
    setActivePicker(null);
  }, []);

  const additionalFilterCount = [filterDate, filterType, filterContact, filterCategory, filterPayment]
    .filter(Boolean).length;

  useEffect(() => {
    if (activePicker === 'contact') {
      setContactTab(customers.length > 0 ? 'customers' : 'suppliers');
      setContactSearch('');
    }
  }, [activePicker, customers.length]);

  const filtered = useMemo(() => entries.filter((e) => {
    if (filterDate     && !matchesDatePeriod(e.entry_date, filterDate)) return false;
    if (filterType     && e.type         !== filterType)     return false;
    if (filterPayment  && e.payment_mode !== filterPayment)  return false;
    if (filterCategory && e.category     !== filterCategory) return false;
    if (filterContact  && e.contact_name !== filterContact)  return false;
    return true;
  }), [entries, filterDate, filterType, filterPayment, filterCategory, filterContact]);

  const summary = useMemo(() => {
    let total_in = 0, total_out = 0;
    for (const e of filtered) {
      const amt = parseFloat(e.amount) || 0;
      if (e.type === 'in') total_in  += amt;
      else                  total_out += amt;
    }
    return { total_in, total_out, net_balance: total_in - total_out };
  }, [filtered]);

  const previewEntries = useMemo(() => {
    let running = 0;
    return filtered.map(e => {
      const amt = parseFloat(e.amount) || 0;
      if (e.type === 'in') running += amt;
      else running -= amt;
      return { ...e, _running: running };
    });
  }, [filtered]);

  const maxBar = Math.max(summary.total_in, summary.total_out, 1);
  const BAR_H  = 90; // px height of full bar

  const closeExportModal = () => {
    setExportType(null);
    setExportPhase(null);
    setReadyUri(null);
    setFileName('');
    setShowPreview(false);
  };

  const handleExportGated = (type) => {
    if (!canExport) {
      router.push('/(app)/settings/subscription');
      return;
    }
    handleExport(type);
  };

  const handleExport = async (type) => {
    setExportType(type);
    setExportPhase('generating');
    try {
      // Refresh session first so the token is always valid on iOS
      let { data: sd } = await supabase.auth.getSession();
      let token = sd.session?.access_token;
      if (!token) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        token = refreshed.session?.access_token;
      }
      if (!token) throw new Error('Not authenticated');

      const params = new URLSearchParams();
      if (dateFrom)       params.append('date_from', dateFrom);
      if (dateTo)         params.append('date_to', dateTo);
      if (filterType)        params.append('entry_type', filterType);
      if (filterContact)     params.append('contact_name', filterContact);
      if (filterContactType) params.append('contact_type', filterContactType);
      if (filterCategory)    params.append('category', filterCategory);
      if (filterPayment)     params.append('payment_mode', filterPayment);
      const qs      = params.toString();
      const ext     = type === 'pdf' ? 'pdf' : 'xlsx';
      const safeName = (name || id || 'report').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename  = `cashbook-${safeName}-${Date.now()}.${ext}`;
      const localUri  = `${FileSystem.cacheDirectory}${filename}`;
      const url = `${BASE_URL}/api/v1/books/${id}/report/${type}${qs ? '?' + qs : ''}`;

      const result = await FileSystem.downloadAsync(url, localUri, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!result.uri) throw new Error('Download failed — no file received.');
      if (result.status !== undefined && result.status !== 200) {
        throw new Error(`Server returned ${result.status}. Make sure the backend is running.`);
      }

      setFileName(`cashbook-${safeName}.${ext}`);
      setReadyUri(result.uri);
      // Use setTimeout so iOS doesn't try to change modal content mid-animation
      setTimeout(() => setExportPhase('ready'), Platform.OS === 'ios' ? 50 : 0);
    } catch (err) {
      Alert.alert('Export Failed', err.message || 'Please check your connection and try again.');
      closeExportModal();
    }
  };

  const resolvedFileName = () => {
    const trimmed = fileName.trim();
    const ext = exportType === 'pdf' ? '.pdf' : '.xlsx';
    if (!trimmed) return `cashbook-report${ext}`;
    return trimmed.endsWith(ext) ? trimmed : trimmed + ext;
  };

  const getRenamedUri = async () => {
    const dest = `${FileSystem.cacheDirectory}${resolvedFileName()}`;
    await FileSystem.copyAsync({ from: readyUri, to: dest });
    return dest;
  };

  const handleDownload = async () => {
    try {
      const final    = resolvedFileName();
      const mimeType = exportType === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

      if (Platform.OS === 'android') {
        const perms = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!perms.granted) return;
        const base64 = await FileSystem.readAsStringAsync(readyUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const newUri = await FileSystem.StorageAccessFramework.createFileAsync(
          perms.directoryUri, final, mimeType,
        );
        await FileSystem.writeAsStringAsync(newUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        closeExportModal();
        setShowSaved(true);
      } else {
        // iOS: documentDirectory is private; use share sheet so user can
        // save to Files, AirDrop, email, etc.
        const uri = await getRenamedUri();
        await Sharing.shareAsync(uri, {
          mimeType,
          dialogTitle: 'Save CashBook Report',
          UTI: exportType === 'pdf'
            ? 'com.adobe.pdf'
            : 'org.openxmlformats.spreadsheetml.sheet',
        });
        closeExportModal();
      }
    } catch (err) {
      if (err.message !== 'User cancelled document picker') {
        Alert.alert('Download Failed', err.message || 'Could not save the file.');
      }
    }
  };

  const handleShare = async () => {
    try {
      const uri = await getRenamedUri();
      await Sharing.shareAsync(uri, {
        mimeType: exportType === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Share CashBook Report',
        UTI: exportType === 'pdf'
          ? 'com.adobe.pdf'
          : 'org.openxmlformats.spreadsheetml.sheet',
      });
      closeExportModal();
    } catch (err) {
      Alert.alert('Share Failed', err.message || 'Could not open share sheet.');
    }
  };

  const handleView = () => {
    // Close the export bottom-sheet first; on iOS you cannot open a new modal
    // while another is still visible — the second one is silently dropped.
    setExportPhase(null);
    setTimeout(() => setShowPreview(true), Platform.OS === 'ios' ? 350 : 0);
  };

  const handleClosePreview = () => {
    setShowPreview(false);
    // If the file was already generated, bring the ready sheet back after preview dismisses
    if (readyUri) {
      setTimeout(() => setExportPhase('ready'), Platform.OS === 'ios' ? 350 : 0);
    }
  };

  const busy = exportPhase === 'generating';
  const s = makeStyles(C, Font);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.primary} />

      {/* ── Export modal — single modal for generating + ready states ──
           iOS cannot dismiss one Modal and immediately present another in the
           same render cycle; using one modal with changing content avoids this. ── */}
      <Modal
        visible={exportPhase === 'generating' || exportPhase === 'ready'}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        {exportPhase === 'generating' ? (
          <View style={s.genOverlay}>
            <View style={s.genCard}>
              <View style={[s.genIconBadge, { backgroundColor: C.primaryLight }]}>
                <Text style={s.genIcon}>{exportType === 'pdf' ? '📄' : '📊'}</Text>
              </View>
              <Text style={s.genTitle}>
                Building {exportType === 'pdf' ? 'PDF' : 'Excel'} Report
              </Text>
              {!!name && <Text style={s.genBook} numberOfLines={1}>{name}</Text>}
              <Text style={s.genRange}>{rangeLabel}</Text>
              <ActivityIndicator
                size="large"
                color={C.primary}
                style={{ marginTop: 20, marginBottom: 8 }}
              />
              <Text style={s.genHint}>Please wait…</Text>
            </View>
          </View>
        ) : (
          <View style={s.readyOverlay}>
            <TouchableOpacity style={s.readyDismissArea} onPress={closeExportModal} activeOpacity={1} />
            <View style={s.readySheet}>

              {/* Handle */}
              <View style={s.readyHandle} />

              {/* File info row */}
              <View style={s.readyInfoRow}>
                <View style={[s.readyFileBadge, { backgroundColor: C.primaryLight }]}>
                  <Feather
                    name={exportType === 'pdf' ? 'file-text' : 'grid'}
                    size={20}
                    color={C.primary}
                  />
                </View>
                <View style={s.readyInfoText}>
                  <Text style={s.readyInfoTitle} numberOfLines={1}>
                    {exportType === 'pdf' ? 'PDF' : 'Excel'} Report — {name || 'CashBook'}
                  </Text>
                  <Text style={s.readyInfoSub}>{rangeLabel}</Text>
                </View>
                <View style={[s.readyCheckBadge, { backgroundColor: C.primaryLight }]}>
                  <Feather name="check" size={14} color={C.primary} />
                </View>
              </View>

              {/* Filename input */}
              <View style={s.fileNameRow}>
                <Feather name="edit-2" size={13} color={C.textMuted} style={{ marginTop: 1 }} />
                <TextInput
                  style={s.fileNameInput}
                  value={fileName}
                  onChangeText={setFileName}
                  placeholder="File name"
                  placeholderTextColor={C.textSubtle}
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="done"
                  selectTextOnFocus
                />
              </View>

              {/* View button */}
              <TouchableOpacity style={s.readyViewBtn} onPress={handleView} activeOpacity={0.85}>
                <Feather name="eye" size={18} color={C.primary} />
                <Text style={[s.readyViewBtnLabel, { color: C.primary }]}>View Report</Text>
              </TouchableOpacity>

              {/* Download + Share row */}
              <View style={s.readyBtnRow}>
                <TouchableOpacity style={[s.readyBtn, { backgroundColor: C.primary }]} onPress={handleDownload} activeOpacity={0.85}>
                  <Feather name="download" size={16} color="#fff" />
                  <Text style={s.readyBtnLabel}>Download</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[s.readyBtn, s.readyBtnOutline]} onPress={handleShare} activeOpacity={0.85}>
                  <Feather name="share-2" size={16} color={C.primary} />
                  <Text style={[s.readyBtnLabel, { color: C.primary }]}>Share</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={closeExportModal} style={s.readyClose}>
                <Text style={s.readyCloseText}>Close</Text>
              </TouchableOpacity>

            </View>
          </View>
        )}
      </Modal>

      {/* ── Saved success dialog ── */}
      <SuccessDialog
        visible={showSaved}
        onDismiss={() => setShowSaved(false)}
        title="File Saved"
        subtitle="Your report has been saved to your device"
      />


      {/* ── Filter Picker Modal ── */}
      <Modal visible={!!activePicker} transparent animationType="slide" onRequestClose={() => setActivePicker(null)}>
        <Pressable style={s.pickerOverlay} onPress={() => setActivePicker(null)}>
          <Pressable style={[s.pickerSheet, { backgroundColor: C.card }]} onPress={() => {}}>
            <View style={[s.pickerHandle, { backgroundColor: C.border }]} />
            <View style={s.pickerHeader}>
              <Text style={[s.pickerTitle, { color: C.text, fontFamily: Font.bold }]}>
                {activePicker === 'date' ? 'Filter by Date'
                  : activePicker === 'type' ? 'Entry Type'
                  : activePicker === 'contact' ? 'Customers & Suppliers'
                  : activePicker === 'category' ? 'Filter by Category'
                  : 'Payment Method'}
              </Text>
              <TouchableOpacity onPress={() => setActivePicker(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={20} color={C.textMuted} />
              </TouchableOpacity>
            </View>
            {activePicker === 'date' && (
              <View style={s.pickerGrid}>
                {[
                  { key: 'today',     label: 'Today',      icon: 'sun'      },
                  { key: 'yesterday', label: 'Yesterday',  icon: 'moon'     },
                  { key: 'week',      label: 'This Week',  icon: 'calendar' },
                  { key: 'month',     label: 'This Month', icon: 'clock'    },
                ].map(({ key, label, icon }) => (
                  <TouchableOpacity
                    key={key}
                    style={[s.pickerGridItem, { borderColor: filterDate === key ? C.primary : C.border, backgroundColor: filterDate === key ? C.primaryLight : C.card }]}
                    onPress={() => applyFilter('date', key)}
                    activeOpacity={0.75}
                  >
                    <Feather name={icon} size={20} color={filterDate === key ? C.primary : C.textMuted} />
                    <Text style={[s.pickerGridLabel, { color: filterDate === key ? C.primary : C.text, fontFamily: filterDate === key ? Font.bold : Font.medium }]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {activePicker === 'type' && (
              <View style={s.typePickerRow}>
                <TouchableOpacity style={[s.typePickerBtn, { borderColor: filterType === 'in' ? C.cashIn : C.border, backgroundColor: filterType === 'in' ? C.cashInLight : C.card }]} onPress={() => applyFilter('type', 'in')} activeOpacity={0.8}>
                  <Feather name="arrow-up-circle" size={28} color={filterType === 'in' ? C.cashIn : C.textMuted} />
                  <Text style={[s.typePickerLabel, { color: filterType === 'in' ? C.cashIn : C.text, fontFamily: Font.bold }]}>Cash In</Text>
                  <Text style={[s.typePickerSub, { color: C.textMuted }]}>Income entries</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.typePickerBtn, { borderColor: filterType === 'out' ? C.danger : C.border, backgroundColor: filterType === 'out' ? C.dangerLight : C.card }]} onPress={() => applyFilter('type', 'out')} activeOpacity={0.8}>
                  <Feather name="arrow-down-circle" size={28} color={filterType === 'out' ? C.danger : C.textMuted} />
                  <Text style={[s.typePickerLabel, { color: filterType === 'out' ? C.danger : C.text, fontFamily: Font.bold }]}>Cash Out</Text>
                  <Text style={[s.typePickerSub, { color: C.textMuted }]}>Expense entries</Text>
                </TouchableOpacity>
              </View>
            )}
            {activePicker === 'contact' && (() => {
              const isCustomerTab = contactTab === 'customers';
              const accentColor = isCustomerTab ? C.cashIn : C.danger;
              const accentLight = isCustomerTab ? C.cashInLight : C.dangerLight;
              const currentList = isCustomerTab ? customers : suppliers;
              const filteredList = contactSearch ? currentList.filter(c => c.name.toLowerCase().includes(contactSearch.toLowerCase()) || (c.phone && c.phone.includes(contactSearch))) : currentList;
              return (
                <>
                  <SearchBar value={contactSearch} onChangeText={setContactSearch} placeholder={`Search ${isCustomerTab ? 'customers' : 'suppliers'}…`} onClear={() => setContactSearch('')} style={s.cSearchBar} />
                  <View style={[s.cTabRow, { borderBottomColor: C.border }]}>
                    {[{ key: 'customers', label: 'Customers', count: customers.length, accent: C.cashIn, accentBg: C.cashInLight }, { key: 'suppliers', label: 'Suppliers', count: suppliers.length, accent: C.danger, accentBg: C.dangerLight }].map(tab => {
                      const active = contactTab === tab.key;
                      return (
                        <TouchableOpacity key={tab.key} style={[s.cTab, active && { borderBottomColor: tab.accent }]} onPress={() => { setContactTab(tab.key); setContactSearch(''); }} activeOpacity={0.8}>
                          <Text style={[s.cTabLabel, { color: active ? tab.accent : C.textMuted, fontFamily: active ? Font.bold : Font.medium }]}>{tab.label}</Text>
                          <View style={[s.cTabBadge, { backgroundColor: active ? tab.accentBg : C.border }]}><Text style={[s.cTabBadgeText, { color: active ? tab.accent : C.textMuted, fontFamily: Font.bold }]}>{tab.count}</Text></View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {filteredList.length === 0 ? (
                    <View style={s.pickerEmpty}>
                      <Feather name={contactSearch ? 'search' : 'users'} size={36} color={C.textSubtle} />
                      <Text style={[s.pickerEmptyTitle, { color: C.text, fontFamily: Font.semiBold }]}>{contactSearch ? 'No results' : `No ${isCustomerTab ? 'customers' : 'suppliers'} yet`}</Text>
                    </View>
                  ) : (
                    <ScrollView style={s.pickerList} showsVerticalScrollIndicator={false}>
                      {filteredList.map((item, idx) => (
                        <TouchableOpacity key={item.id} style={[s.pickerRow, { borderBottomColor: C.border }, idx === filteredList.length - 1 && { borderBottomWidth: 0 }, filterContact === item.name && { backgroundColor: C.primaryLight }]} onPress={() => { applyFilter('contact', item.name); setFilterContactType(isCustomerTab ? 'customer' : 'supplier'); }} activeOpacity={0.75}>
                          <View style={[s.contactAvatar, { backgroundColor: accentLight }]}><Text style={[s.contactAvatarText, { color: accentColor, fontFamily: Font.bold }]}>{item.name.charAt(0).toUpperCase()}</Text></View>
                          <Text style={[s.pickerRowLabel, { color: C.text, fontFamily: filterContact === item.name ? Font.semiBold : Font.regular }]}>{item.name}</Text>
                          {filterContact === item.name && <Feather name="check" size={16} color={C.primary} />}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </>
              );
            })()}
            {activePicker === 'category' && (
              bookCategories.length === 0 ? (
                <View style={s.pickerEmpty}>
                  <Feather name="tag" size={36} color={C.textSubtle} />
                  <Text style={[s.pickerEmptyTitle, { color: C.text, fontFamily: Font.semiBold }]}>No categories used</Text>
                  <Text style={[s.pickerEmptySub, { color: C.textMuted }]}>No categories in the selected period.</Text>
                </View>
              ) : (
                <ScrollView style={s.pickerList} showsVerticalScrollIndicator={false}>
                  {bookCategories.map(cat => (
                    <TouchableOpacity key={cat} style={[s.pickerRow, { borderBottomColor: C.border }, filterCategory === cat && { backgroundColor: C.primaryLight }]} onPress={() => applyFilter('category', cat)} activeOpacity={0.75}>
                      <View style={[s.catDot, { backgroundColor: C.primaryMid }]}><Feather name="tag" size={13} color={C.primary} /></View>
                      <Text style={[s.pickerRowLabel, { color: C.text, fontFamily: filterCategory === cat ? Font.semiBold : Font.regular }]}>{cat}</Text>
                      {filterCategory === cat && <Feather name="check" size={16} color={C.primary} />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )
            )}
            {activePicker === 'payment' && (() => {
              const payOpts = bookPayments.map(value => ({
                value,
                label: PAYMENT_LABEL[value] || (value.charAt(0).toUpperCase() + value.slice(1)),
                icon: PAYMENT_ICON[value?.toLowerCase()] || 'credit-card',
              }));
              if (payOpts.length === 0) return (
                <View style={s.pickerEmpty}>
                  <Feather name="credit-card" size={36} color={C.textSubtle} />
                  <Text style={[s.pickerEmptyTitle, { color: C.text, fontFamily: Font.semiBold }]}>No payment modes used</Text>
                  <Text style={[s.pickerEmptySub, { color: C.textMuted }]}>No payment modes in the selected period.</Text>
                </View>
              );
              return (
                <View style={s.pickerGrid}>
                  {payOpts.map(({ value, label, icon }) => (
                    <TouchableOpacity key={value} style={[s.pickerGridItem, { borderColor: filterPayment === value ? C.primary : C.border, backgroundColor: filterPayment === value ? C.primaryLight : C.card }]} onPress={() => applyFilter('payment', value)} activeOpacity={0.75}>
                      <Feather name={icon} size={20} color={filterPayment === value ? C.primary : C.textMuted} />
                      <Text style={[s.pickerGridLabel, { color: filterPayment === value ? C.primary : C.text, fontFamily: filterPayment === value ? Font.bold : Font.medium }]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Report Preview Modal ── */}
      <Modal visible={showPreview} animationType="slide" statusBarTranslucent onRequestClose={handleClosePreview}>
        <SafeAreaView style={[s.safe, { backgroundColor: C.background }]}>
          <StatusBar barStyle="light-content" backgroundColor={C.primary} />

          {/* Preview header */}
          <View style={s.header}>
            <TouchableOpacity onPress={handleClosePreview} style={s.backBtn}>
              <Feather name="x" size={22} color={C.onPrimary} />
            </TouchableOpacity>
            <View style={s.headerCenter}>
              <Text style={s.headerTitle}>Report Preview</Text>
              {!!name && <Text style={s.headerSub} numberOfLines={1}>{name}</Text>}
            </View>
            {readyUri && (
              <View style={s.headerBtns}>
                <TouchableOpacity style={s.headerExportBtn} onPress={handleDownload} activeOpacity={0.8}>
                  <Feather name="download" size={14} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={s.headerExportBtn} onPress={handleShare} activeOpacity={0.8}>
                  <Feather name="share-2" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
            <View style={s.pvDoc}>

              {/* Document title block */}
              <Text style={[s.pvDocTitle, { color: C.text }]} numberOfLines={2}>{name || 'CashBook Report'}</Text>
              <Text style={[s.pvDocPeriod, { color: C.textMuted }]}>{rangeLabel}</Text>
              <Text style={[s.pvDocCount, { color: C.textSubtle }]}>{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</Text>
              <View style={[s.pvDocDivider, { backgroundColor: C.border }]} />

              {/* Summary cards */}
              <View style={s.pvSummaryRow}>
                {[
                  { label: 'TOTAL INCOME',   value: summary.total_in,  color: C.cashIn,  bg: C.cashInLight  },
                  { label: 'TOTAL EXPENSES', value: summary.total_out, color: C.cashOut, bg: C.cashOutLight },
                  {
                    label: summary.net_balance >= 0 ? 'NET SURPLUS' : 'NET DEFICIT',
                    value: Math.abs(summary.net_balance),
                    color: summary.net_balance >= 0 ? C.cashIn  : C.cashOut,
                    bg:    summary.net_balance >= 0 ? C.cashInLight : C.cashOutLight,
                  },
                ].map(({ label, value, color, bg }) => (
                  <View key={label} style={[s.pvSummaryCard, { backgroundColor: bg }]}>
                    <Text style={[s.pvSummaryLabel, { color }]}>{label}</Text>
                    <Text style={[s.pvSummaryAmt, { color }]}>
                      {value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Table header */}
              {filtered.length > 0 && (
                <View style={[s.pvTableHead, { borderBottomColor: C.border }]}>
                  <Text style={[s.pvTHDate, { color: C.textMuted }]}>Date</Text>
                  <Text style={[s.pvTHRemark, { color: C.textMuted }]}>Remark</Text>
                  <Text style={[s.pvTHAmt, { color: C.textMuted }]}>Amount</Text>
                  <Text style={[s.pvTHBal, { color: C.textMuted }]}>Balance</Text>
                </View>
              )}

              {/* Entries or empty state */}
              {filtered.length === 0 ? (
                <View style={s.pvEmpty}>
                  <View style={[s.pvEmptyIcon, { backgroundColor: C.primaryLight }]}>
                    <Feather name="file-text" size={26} color={C.primary} />
                  </View>
                  <Text style={[s.pvEmptyText, { color: C.text }]}>No entries</Text>
                  <Text style={[s.pvEmptySub, { color: C.textMuted }]}>Adjust your filters to see data</Text>
                </View>
              ) : (
                <>
                  {previewEntries.map((e, idx) => {
                    const isIn = e.type === 'in';
                    const amt  = parseFloat(e.amount) || 0;
                    return (
                      <View
                        key={e.id}
                        style={[s.pvRow, {
                          backgroundColor: idx % 2 === 0 ? 'transparent' : C.cardAlt,
                          borderBottomColor: C.border,
                        }]}
                      >
                        <View style={s.pvRowLeft}>
                          <Text style={[s.pvRowDate, { color: C.textSubtle }]}>{e.entry_date}</Text>
                          <Text style={[s.pvRowRemark, { color: C.text }]} numberOfLines={1}>{e.remark || '—'}</Text>
                          {(e.category || e.contact_name || e.payment_mode) && (
                            <Text style={[s.pvRowMeta, { color: C.textSubtle }]} numberOfLines={1}>
                              {[e.category, e.contact_name, e.payment_mode].filter(Boolean).join(' · ')}
                            </Text>
                          )}
                        </View>
                        <View style={s.pvRowRight}>
                          <Text style={[s.pvRowAmt, { color: isIn ? C.cashIn : C.cashOut }]}>
                            {isIn ? '+' : '−'}{amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                          <Text style={[s.pvRowBal, { color: e._running >= 0 ? C.cashIn : C.cashOut }]}>
                            {e._running.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                        </View>
                      </View>
                    );
                  })}

                  {/* Totals row */}
                  <View style={[s.pvTotals, { borderTopColor: C.border }]}>
                    <Text style={[s.pvTotalsLabel, { color: C.text }]}>Total</Text>
                    <View style={s.pvTotalsRight}>
                      <Text style={[s.pvTotalsIn, { color: C.cashIn }]}>
                        +{summary.total_in.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                      {summary.total_out > 0 && (
                        <Text style={[s.pvTotalsOut, { color: C.cashOut }]}>
                          −{summary.total_out.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                      )}
                    </View>
                  </View>
                </>
              )}
            </View>
            <View style={{ height: 100 }} />
          </ScrollView>

          {/* Bottom action bar */}
          <View style={[s.pvBottomBar, { backgroundColor: C.card, borderTopColor: C.border }]}>
            {readyUri ? (
              <>
                <TouchableOpacity style={[s.pvBottomBtn, { backgroundColor: C.primary }]} onPress={handleDownload} activeOpacity={0.85}>
                  <Feather name="download" size={16} color="#fff" />
                  <Text style={[s.pvBottomBtnLabel, { color: '#fff' }]}>Download</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.pvBottomBtn, { borderWidth: 1.5, borderColor: C.primary }]} onPress={handleShare} activeOpacity={0.85}>
                  <Feather name="share-2" size={16} color={C.primary} />
                  <Text style={[s.pvBottomBtnLabel, { color: C.primary }]}>Share</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[s.pvBottomBtn, { borderWidth: 1.5, borderColor: canExport ? C.cashOut : '#F59E0B' }, busy && { opacity: 0.5 }]}
                  onPress={() => {
                    setShowPreview(false);
                    if (!canExport) { setTimeout(() => router.push('/(app)/settings/subscription'), Platform.OS === 'ios' ? 350 : 0); return; }
                    setTimeout(() => handleExport('pdf'), Platform.OS === 'ios' ? 350 : 0);
                  }}
                  disabled={busy}
                  activeOpacity={0.75}
                >
                  <Text style={{ fontSize: 15 }}>{canExport ? '📄' : '👑'}</Text>
                  <Text style={[s.pvBottomBtnLabel, { color: canExport ? C.cashOut : '#F59E0B' }]}>Export PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.pvBottomBtn, { borderWidth: 1.5, borderColor: canExport ? C.cashIn : '#F59E0B' }, busy && { opacity: 0.5 }]}
                  onPress={() => {
                    setShowPreview(false);
                    if (!canExport) { setTimeout(() => router.push('/(app)/settings/subscription'), Platform.OS === 'ios' ? 350 : 0); return; }
                    setTimeout(() => handleExport('excel'), Platform.OS === 'ios' ? 350 : 0);
                  }}
                  disabled={busy}
                  activeOpacity={0.75}
                >
                  <Text style={{ fontSize: 15 }}>{canExport ? '📊' : '👑'}</Text>
                  <Text style={[s.pvBottomBtnLabel, { color: canExport ? C.cashIn : '#F59E0B' }]}>Export Excel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Reports</Text>
          {!!name && <Text style={s.headerSub} numberOfLines={1}>{name}</Text>}
        </View>
        <View style={s.headerBtns}>
          <TouchableOpacity
            style={[s.headerExportBtn, busy && { opacity: 0.5 }]}
            onPress={() => handleExportGated('pdf')}
            disabled={busy}
          >
            {!canExport && <Text style={{ fontSize: 10, marginRight: 1 }}>👑</Text>}
            <Text style={s.headerExportText}>PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.headerExportBtn, busy && { opacity: 0.5 }]}
            onPress={() => handleExportGated('excel')}
            disabled={busy}
          >
            {!canExport && <Text style={{ fontSize: 10, marginRight: 1 }}>👑</Text>}
            <Text style={s.headerExportText}>XLS</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Filter chips ── */}
        <View style={s.filterBar}>
          <TouchableOpacity
            style={[s.fChip, additionalFilterCount === 0 && s.fChipActive]}
            onPress={() => { setFilterDate(null); setFilterType(null); setFilterContact(null); setFilterContactType(null); setFilterCategory(null); setFilterPayment(null); }}
            activeOpacity={0.8}
          >
            <Feather name="layers" size={12} color={additionalFilterCount === 0 ? '#fff' : C.textMuted} />
            <Text style={[s.fChipLabel, { color: additionalFilterCount === 0 ? '#fff' : C.textMuted }]}>All</Text>
          </TouchableOpacity>
          <View style={s.filterDivider} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterScroll}>
            {[
              { key: 'date',     label: 'Date',          icon: 'calendar',    display: filterDate ? DATE_LABELS[filterDate] : null },
              { key: 'type',     label: 'Entry Type',    icon: 'repeat',      display: filterType === 'in' ? 'Cash In' : filterType === 'out' ? 'Cash Out' : null },
              { key: 'contact',  label: 'Cust. & Supp.', icon: 'users',       display: filterContact },
              { key: 'category', label: 'Category',      icon: 'tag',         display: filterCategory },
              { key: 'payment',  label: 'Payment',       icon: 'credit-card', display: filterPayment ? (PAYMENT_LABEL[filterPayment] || filterPayment) : null },
            ].map(({ key, label, icon, display }) => {
              const active = !!display;
              return (
                <TouchableOpacity key={key} style={[s.fChip, active && s.fChipActive]} onPress={() => setActivePicker(key)} activeOpacity={0.8}>
                  <Feather name={icon} size={12} color={active ? '#fff' : C.textMuted} />
                  <Text style={[s.fChipLabel, { color: active ? '#fff' : C.textMuted }]} numberOfLines={1}>{display || label}</Text>
                  {active ? (
                    <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); clearFilter(key); }} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                      <Feather name="x" size={12} color="rgba(255,255,255,0.85)" />
                    </TouchableOpacity>
                  ) : (
                    <Feather name="chevron-down" size={10} color={C.textSubtle} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Date range label ── */}
        <View style={s.rangeRow}>
          <Text style={s.rangeIcon}>📅</Text>
          <Text style={s.rangeText}>{rangeLabel}</Text>
          {additionalFilterCount > 0 && (
            <Text style={[s.rangeFilterNote, { color: C.primary }]}> · {filtered.length} of {entries.length}</Text>
          )}
          {isLoading && <ActivityIndicator size="small" color={C.primary} style={{ marginLeft: 8 }} />}
        </View>

        {/* ── Combined summary + chart ── */}
        <View style={s.chartCard}>
          <View style={s.chartHeader}>
            <Text style={s.chartTitle}>Financial Summary</Text>
            <Text style={s.chartSub}>{filtered.length} transactions</Text>
          </View>

          <View style={s.chartBars}>
            {[
              { label: 'Income',   value: summary.total_in,  color: C.cashIn  },
              { label: 'Expenses', value: summary.total_out, color: C.cashOut },
              { label: 'Net',      value: Math.abs(summary.net_balance),
                color: summary.net_balance >= 0 ? C.cashIn : C.cashOut },
            ].map(({ label, value, color }, i) => (
              <React.Fragment key={label}>
                {i > 0 && <View style={s.barSep} />}
                <View style={s.barGroup}>
                  <Text style={[s.barAmount, { color }]}>
                    {value > 0 ? value.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
                  </Text>
                  <Text style={s.barLabel}>{label}</Text>
                  <View style={s.barTrack}>
                    <View style={[s.barFill, { height: (value / maxBar) * BAR_H, backgroundColor: color }]} />
                  </View>
                </View>
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* ── Recent entries ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Recent Entries</Text>

          {!isLoading && entries.length === 0 && (
            <Text style={s.emptyText}>No entries for this period</Text>
          )}

          {filtered.slice(0, 8).map((e) => {
            const isIn = e.type === 'in';
            return (
              <View key={e.id} style={s.entryRow}>
                <View style={[s.entryDot, {
                  backgroundColor: isIn ? C.cashInLight : C.cashOutLight,
                }]}>
                  <Text style={{ fontSize: 11, color: isIn ? C.cashIn : C.cashOut, fontFamily: Font.bold }}>
                    {isIn ? '↑' : '↓'}
                  </Text>
                </View>
                <View style={s.entryInfo}>
                  <Text style={s.entryRemark} numberOfLines={1}>{e.remark || 'No remark'}</Text>
                  <Text style={s.entryMeta} numberOfLines={1}>
                    {e.entry_date}
                    {e.category      ? `  ·  ${e.category}`      : ''}
                    {e.payment_mode  ? `  ·  ${e.payment_mode}`  : ''}
                    {e.contact_name  ? `  ·  ${e.contact_name}`  : ''}
                  </Text>
                </View>
                <Text style={[s.entryAmt, { color: isIn ? C.cashIn : C.cashOut }]}>
                  {isIn ? '+' : '-'}{parseFloat(e.amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </Text>
              </View>
            );
          })}

          {filtered.length > 8 && (
            <Text style={s.moreText}>+{filtered.length - 8} more entries included in export</Text>
          )}
        </View>

        {/* ── Export section ── */}
        <View style={s.exportSection}>
          <Text style={s.exportTitle}>Export Report</Text>
          <Text style={s.exportSub}>
            {filtered.length} entries  ·  {rangeLabel}
          </Text>

          {/* Preview button */}
          <TouchableOpacity
            style={s.previewBtn}
            onPress={() => setShowPreview(true)}
            activeOpacity={0.75}
          >
            <View style={[s.exportIconWrap, { backgroundColor: C.primaryLight }]}>
              <Feather name="eye" size={22} color={C.primary} />
            </View>
            <View style={s.exportBtnBody}>
              <Text style={[s.exportBtnTitle, { color: C.primary }]}>Preview Report</Text>
              <Text style={s.exportBtnSub}>See all entries & summary in-app</Text>
            </View>
            <Feather name="chevron-right" size={18} color={C.primary} />
          </TouchableOpacity>

          {/* PDF button */}
          <TouchableOpacity
            style={[s.exportBtn, busy && s.exportBtnDisabled]}
            onPress={() => handleExportGated('pdf')}
            disabled={busy}
            activeOpacity={0.75}
          >
            <View style={s.exportIconWrap}>
              <Text style={s.exportEmoji}>📄</Text>
            </View>
            <View style={s.exportBtnBody}>
              <Text style={s.exportBtnTitle}>Export as PDF</Text>
              <Text style={s.exportBtnSub}>A4 formatted report · Print · Share</Text>
            </View>
            {canExport
              ? <Feather name="chevron-right" size={18} color={C.textMuted} />
              : <CrownBadge tier="pro" size={11} />
            }
          </TouchableOpacity>

          {/* Excel button */}
          <TouchableOpacity
            style={[s.exportBtn, busy && s.exportBtnDisabled]}
            onPress={() => handleExportGated('excel')}
            disabled={busy}
            activeOpacity={0.75}
          >
            <View style={s.exportIconWrap}>
              <Text style={s.exportEmoji}>📊</Text>
            </View>
            <View style={s.exportBtnBody}>
              <Text style={s.exportBtnTitle}>Export as Excel</Text>
              <Text style={s.exportBtnSub}>Spreadsheet · Filter · Analyse · Edit</Text>
            </View>
            {canExport
              ? <Feather name="chevron-right" size={18} color={C.textMuted} />
              : <CrownBadge tier="pro" size={11} />
            }
          </TouchableOpacity>

          {/* Share hint */}
          {!canExport && (
            <View style={[s.shareHint, { backgroundColor: '#F59E0B1A', borderRadius: 10, padding: 10, marginTop: 4 }]}>
              <Text style={[s.shareHintText, { color: '#F59E0B' }]}>
                👑 PDF & Excel export requires Pro or Enterprise. Tap any export button to upgrade.
              </Text>
            </View>
          )}
          {canExport && (
            <View style={s.shareHint}>
              <Text style={s.shareHintText}>
                Share to WhatsApp, Email, Google Drive, or save to Files after export.
              </Text>
            </View>
          )}
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (C, Font) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn:     { padding: 6, marginRight: 6 },
  backIcon:    { fontSize: 28, color: C.onPrimary, lineHeight: 30 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 17, color: C.onPrimary, fontFamily: Font.bold },
  headerSub:   { fontSize: 12, color: C.onPrimaryMuted, fontFamily: Font.regular, marginTop: 1 },
  headerBtns:  { flexDirection: 'row', gap: 8 },
  headerExportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.30)',
  },
  headerExportText: { fontSize: 12, fontFamily: Font.bold, color: '#fff', letterSpacing: 0.4 },

  // ── Filters ───────────────────────────────────────────────────────────────
  scroll: { flex: 1 },

  // ── Range label ───────────────────────────────────────────────────────────
  rangeRow:  { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 14, marginBottom: 14 },
  rangeIcon: { fontSize: 13, marginRight: 6 },
  rangeText: { fontSize: 12, color: C.textMuted, fontFamily: Font.medium, flex: 1 },

  // ── Combined summary + chart ──────────────────────────────────────────────
  chartCard: {
    backgroundColor: C.card, marginHorizontal: 16, borderRadius: 16,
    padding: 20, marginBottom: 14,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  chartTitle:  { fontSize: 14, fontFamily: Font.bold, color: C.text },
  chartSub:    { fontSize: 11, color: C.textMuted, fontFamily: Font.regular },
  chartBars:   { flexDirection: 'row', alignItems: 'flex-end' },
  barGroup:    { flex: 1, alignItems: 'center' },
  barAmount:   { fontSize: 13, fontFamily: Font.extraBold, textAlign: 'center', marginBottom: 4 },
  barLabel:    { fontSize: 10, color: C.textMuted, fontFamily: Font.medium, marginBottom: 10 },
  barTrack: {
    width: 40, height: 90, backgroundColor: C.cardAlt,
    borderRadius: 10, overflow: 'hidden', justifyContent: 'flex-end',
  },
  barFill:    { width: '100%', borderRadius: 10, minHeight: 4 },
  barSep:     { width: 1, height: 90, backgroundColor: C.border, marginHorizontal: 4, alignSelf: 'flex-end' },

  // ── Entries preview ───────────────────────────────────────────────────────
  section: {
    backgroundColor: C.card, marginHorizontal: 16, borderRadius: 16,
    padding: 16, marginBottom: 14,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  sectionTitle: { fontSize: 14, fontFamily: Font.bold, color: C.text, marginBottom: 12 },
  emptyText: {
    fontSize: 13, color: C.textMuted, fontFamily: Font.regular,
    textAlign: 'center', paddingVertical: 20,
  },
  entryRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  entryDot: {
    width: 30, height: 30, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  entryInfo:   { flex: 1, marginRight: 8 },
  entryRemark: { fontSize: 13, fontFamily: Font.semiBold, color: C.text },
  entryMeta:   { fontSize: 10, color: C.textMuted, fontFamily: Font.regular, marginTop: 2 },
  entryAmt:    { fontSize: 14, fontFamily: Font.extraBold },
  moreText:    { fontSize: 11, color: C.textMuted, fontFamily: Font.regular, textAlign: 'center', marginTop: 10 },

  // ── Export ────────────────────────────────────────────────────────────────
  exportSection: { marginHorizontal: 16 },
  exportTitle:   { fontSize: 16, fontFamily: Font.bold, color: C.text, marginBottom: 4 },
  exportSub:     { fontSize: 12, color: C.textMuted, fontFamily: Font.regular, marginBottom: 16 },

  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.card, borderRadius: 16, padding: 14,
    marginBottom: 10, borderWidth: 1.5, borderColor: C.border,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  exportBtnDisabled: { opacity: 0.6 },
  exportIconWrap: {
    width: 46, height: 46, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.cardAlt,
  },
  exportEmoji:   { fontSize: 24 },
  exportBtnBody: { flex: 1 },
  exportBtnTitle: { fontSize: 14, fontFamily: Font.bold, marginBottom: 2, color: C.text },
  exportBtnSub:   { fontSize: 11, color: C.textMuted, fontFamily: Font.regular },

  shareHint: {
    borderRadius: 12, padding: 12, marginTop: 6,
    borderWidth: 1, backgroundColor: C.cardAlt, borderColor: C.border,
  },
  shareHintText: { fontSize: 11, fontFamily: Font.regular, lineHeight: 17, color: C.textMuted },

  // ── Generating modal ─────────────────────────────────────────────────────
  genOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 36,
  },
  genCard: {
    width: '100%', backgroundColor: C.card, borderRadius: 24,
    paddingVertical: 32, paddingHorizontal: 28, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3, shadowRadius: 28, elevation: 24,
  },
  genIconBadge: {
    width: 76, height: 76, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  genIcon:  { fontSize: 38 },
  genTitle: { fontSize: 17, fontFamily: Font.bold, color: C.text, textAlign: 'center', marginBottom: 10 },
  genBook:  { fontSize: 13, fontFamily: Font.semiBold, color: C.primary, textAlign: 'center', marginBottom: 2 },
  genRange: { fontSize: 11, color: C.textMuted, fontFamily: Font.regular, textAlign: 'center' },
  genHint:  { fontSize: 12, color: C.textSubtle, fontFamily: Font.regular },

  // ── Ready modal (compact bottom sheet) ──────────────────────────────────
  readyOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  readyDismissArea: { flex: 1 },
  readySheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.14, shadowRadius: 16, elevation: 20,
  },
  readyHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: C.border, alignSelf: 'center', marginTop: 12, marginBottom: 20,
  },

  // File info row
  readyInfoRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  readyFileBadge: {
    width: 46, height: 46, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  readyInfoText: { flex: 1 },
  readyInfoTitle: { fontSize: 14, fontFamily: Font.bold, color: C.text, marginBottom: 2 },
  readyInfoSub:   { fontSize: 12, color: C.textMuted, fontFamily: Font.regular },
  readyCheckBadge: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },

  // Filename input
  fileNameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.cardAlt, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 12, paddingVertical: 2,
    marginBottom: 12,
  },
  fileNameInput: {
    flex: 1, fontSize: 13, fontFamily: Font.medium,
    color: C.text, paddingVertical: 9,
  },

  // View button
  readyViewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 14,
    borderWidth: 1.5, borderColor: C.primary,
    backgroundColor: C.primaryLight, marginBottom: 10,
  },
  readyViewBtnLabel: { fontSize: 15, fontFamily: Font.bold },

  // Side-by-side buttons
  readyBtnRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  readyBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 12,
  },
  readyBtnOutline: { backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border },
  readyBtnLabel:   { fontSize: 13, fontFamily: Font.bold, color: '#fff' },

  readyClose:     { alignItems: 'center', paddingVertical: 14 },
  readyCloseText: { fontSize: 13, color: C.textMuted, fontFamily: Font.medium },
  filterBar: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 0, marginTop: 10, marginBottom: 2, height: 34 },
  filterDivider: { width: 1, height: 16, backgroundColor: C.border, marginHorizontal: 8 },
  filterScroll: { paddingRight: 16, gap: 6, alignItems: 'center' },
  fChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 28, borderRadius: 100, borderWidth: 1.5, backgroundColor: C.card, borderColor: C.border },
  fChipActive: { height: 28, paddingHorizontal: 10, borderRadius: 100, borderWidth: 1.5, backgroundColor: C.primary, borderColor: C.primary },
  fChipLabel: { fontSize: 11, fontFamily: Font.semiBold, lineHeight: 15 },
  rangeFilterNote: { fontSize: 12, fontFamily: Font.semiBold },
  pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  pickerSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12, paddingBottom: 24, paddingHorizontal: 20, maxHeight: '70%' },
  pickerHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  pickerTitle: { fontSize: 17, lineHeight: 24 },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  pickerGridItem: { width: '47%', borderRadius: 16, borderWidth: 1.5, paddingVertical: 18, alignItems: 'center', gap: 8 },
  pickerGridLabel: { fontSize: 13, lineHeight: 18 },
  typePickerRow: { flexDirection: 'row', gap: 12 },
  typePickerBtn: { flex: 1, borderRadius: 16, borderWidth: 1.5, paddingVertical: 20, alignItems: 'center', gap: 6 },
  typePickerLabel: { fontSize: 15, lineHeight: 22 },
  typePickerSub: { fontSize: 11, fontFamily: Font.regular, lineHeight: 16 },
  pickerList: { maxHeight: 300 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1 },
  pickerRowLabel: { flex: 1, fontSize: 15, lineHeight: 22 },
  contactAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  contactAvatarText: { fontSize: 15 },
  catDot: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cSearchBar: { marginHorizontal: 0, marginBottom: 14 },
  cTabRow: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 4 },
  cTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  cTabLabel: { fontSize: 13, lineHeight: 19 },
  cTabBadge: { minWidth: 20, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  cTabBadgeText: { fontSize: 10, lineHeight: 14 },
  pickerEmpty: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  pickerEmptyTitle: { fontSize: 15, lineHeight: 22 },
  pickerEmptySub: { fontSize: 13, fontFamily: Font.regular, lineHeight: 20, textAlign: 'center', paddingHorizontal: 20 },

  // ── Preview button (in export section) ───────────────────────────────────
  previewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.primaryLight, borderRadius: 16, padding: 14,
    marginBottom: 10, borderWidth: 1.5, borderColor: C.primaryMid,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },

  // ── Report Preview Modal styles ───────────────────────────────────────────
  pvDoc: {
    backgroundColor: C.card, margin: 12, borderRadius: 16, padding: 16,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  pvDocTitle:   { fontSize: 18, fontFamily: Font.extraBold, marginBottom: 4 },
  pvDocPeriod:  { fontSize: 11, fontFamily: Font.medium, marginBottom: 2 },
  pvDocCount:   { fontSize: 10, fontFamily: Font.regular, marginBottom: 14 },
  pvDocDivider: { height: 1.5, marginBottom: 14 },

  pvSummaryRow:   { flexDirection: 'row', gap: 6, marginBottom: 16 },
  pvSummaryCard:  { flex: 1, borderRadius: 10, padding: 9, alignItems: 'center' },
  pvSummaryLabel: { fontSize: 7.5, fontFamily: Font.bold, textAlign: 'center', letterSpacing: 0.3, marginBottom: 5 },
  pvSummaryAmt:   { fontSize: 10.5, fontFamily: Font.extraBold, textAlign: 'center' },

  pvTableHead: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1.5, marginBottom: 0 },
  pvTHDate:    { width: 72, fontSize: 9, fontFamily: Font.bold },
  pvTHRemark:  { flex: 1, fontSize: 9, fontFamily: Font.bold },
  pvTHAmt:     { width: 82, fontSize: 9, fontFamily: Font.bold, textAlign: 'right' },
  pvTHBal:     { width: 74, fontSize: 9, fontFamily: Font.bold, textAlign: 'right' },

  pvRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pvRowLeft:   { flex: 1, marginRight: 8 },
  pvRowDate:   { fontSize: 10, fontFamily: Font.regular, marginBottom: 1 },
  pvRowRemark: { fontSize: 12, fontFamily: Font.semiBold },
  pvRowMeta:   { fontSize: 9, fontFamily: Font.regular, marginTop: 2 },
  pvRowRight:  { alignItems: 'flex-end', gap: 3, minWidth: 82 },
  pvRowAmt:    { fontSize: 13, fontFamily: Font.extraBold },
  pvRowBal:    { fontSize: 10, fontFamily: Font.medium },

  pvEmpty:     { alignItems: 'center', paddingVertical: 32, gap: 8 },
  pvEmptyIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pvEmptyText: { fontSize: 14, fontFamily: Font.semiBold },
  pvEmptySub:  { fontSize: 12, fontFamily: Font.regular },

  pvTotals: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 12, borderTopWidth: 2, marginTop: 2,
  },
  pvTotalsLabel: { fontSize: 12, fontFamily: Font.bold },
  pvTotalsRight: { alignItems: 'flex-end', gap: 3 },
  pvTotalsIn:    { fontSize: 12, fontFamily: Font.bold },
  pvTotalsOut:   { fontSize: 12, fontFamily: Font.bold },

  pvBottomBar: {
    flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1,
  },
  pvBottomBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 13,
  },
  pvBottomBtnLabel: { fontSize: 13, fontFamily: Font.bold },


});
