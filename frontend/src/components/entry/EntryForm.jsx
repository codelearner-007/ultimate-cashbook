import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  ScrollView, ActivityIndicator, Modal, Animated, Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import AppInput from '../ui/Input';
import DatePickerModal from '../ui/DatePickerModal';
import TimePickerModal from '../ui/TimePickerModal';
import ContactPickerModal from './ContactPickerModal';
import CategoryPickerModal from './CategoryPickerModal';
import { ChevronDownIcon, CloseIcon } from '../ui/Icons';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useQueryClient } from '@tanstack/react-query';
import { usePaymentModes } from '../../hooks/usePaymentModes';
import { uploadAttachment } from '../../lib/storage';

const MAX_FILE_MB = 6;  // max file size accepted from device (images compressed after; PDFs sent as-is)

const getErrorMessage = (err) => {
  if (err?.response?.data?.detail) return err.response.data.detail;
  if (typeof err?.response?.data === 'string') return err.response.data;
  if (err?.message) return err.message;
  return 'Something went wrong. Please try again.';
};

// Exposes { getValues(), validate() } via ref.
const EntryForm = forwardRef(function EntryForm(
  { bookId, initialValues, initialType = 'in', showTypeToggle = false, autoFocusAmount = false, onContactDeletedChange, onCategoryDeletedChange },
  ref
) {
  const { C, Font } = useTheme();
  const s = useMemo(() => makeStyles(C, Font), [C, Font]);
  const qc = useQueryClient();
  const _book = qc.getQueryData(['books'])?.find(b => b.id === bookId)
            ?? qc.getQueryData(['shared-books'])?.find(b => b.id === bookId);
  const showCustomer   = _book?.show_customer   ?? false;
  const showSupplier   = _book?.show_supplier   ?? false;
  const showCategory   = _book?.show_category   ?? false;
  const showAttachment = _book?.show_attachment ?? false;
  const showContact = showCustomer || showSupplier;
  const allowedContactTypes = [
    ...(showCustomer ? ['customer'] : []),
    ...(showSupplier ? ['supplier'] : []),
  ];

  const [entryType,     setEntryType]     = useState(initialValues?.type ?? initialType);
  const [amount,        setAmount]        = useState(initialValues?.amount?.toString() ?? '');
  const [remark,        setRemark]        = useState(initialValues?.remark ?? '');
  const [category,      setCategory]      = useState(initialValues?.category ?? '');
  const [categoryId,    setCategoryId]    = useState(initialValues?.category_id ?? null);
  const [paymentModeId, setPaymentModeId] = useState(initialValues?.payment_mode_id ?? null);
  const [paymentMode,   setPaymentMode]   = useState(initialValues?.payment_mode ?? '');
  const [contactName,   setContactName]   = useState(initialValues?.contact_name ?? '');
  const [customerId,    setCustomerId]    = useState(initialValues?.customer_id ?? null);
  const [supplierId,    setSupplierId]    = useState(initialValues?.supplier_id ?? null);

  // Attachment state
  const [attachmentUrl,       setAttachmentUrl]       = useState(initialValues?.attachment_url ?? null);
  const [attachmentPath,      setAttachmentPath]      = useState(initialValues?.attachment_path ?? null);
  const [attachmentProvider,  setAttachmentProvider]  = useState(initialValues?.attachment_provider ?? 'supabase');
  const [attachmentLocalUri,  setAttachmentLocalUri]  = useState(null);
  const [attachmentName,      setAttachmentName]      = useState(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentType, setAttachmentType] = useState(() => {
    const p = initialValues?.attachment_path;
    if (!p) return null;
    return p.endsWith('.pdf') ? 'pdf' : 'image';
  });

  const [showAttachViewer, setShowAttachViewer] = useState(false);

  // Attach picker sheet + inline error state
  const [showAttachPicker, setShowAttachPicker] = useState(false);
  const [attachError,      setAttachError]      = useState(null);
  const slideY = useRef(new Animated.Value(320)).current;

  const openAttachPicker = () => {
    setAttachError(null);
    setShowAttachPicker(true);
    Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 220 }).start();
  };

  const closeAttachPicker = (cb) => {
    Animated.timing(slideY, { toValue: 320, duration: 200, useNativeDriver: true }).start(() => {
      setShowAttachPicker(false);
      cb?.();
    });
  };

  // Payment modes from DB — always shown, required field
  const { data: paymentModes = [], isLoading: modesLoading } = usePaymentModes(bookId);

  useEffect(() => {
    if (!paymentModes.length) return;
    if (paymentModeId && paymentModes.find(m => m.id === paymentModeId)) return;
    const byName = paymentMode
      ? paymentModes.find(m => m.name.toLowerCase() === paymentMode.toLowerCase())
      : null;
    const resolved = byName || paymentModes[0];
    setPaymentModeId(resolved.id);
    setPaymentMode(resolved.name);
  }, [paymentModes, paymentModeId, paymentMode]);

  const contactDeleted = contactName !== '' && !customerId && !supplierId;
  const categoryDeleted = category !== '' && !categoryId;

  useEffect(() => { onContactDeletedChange?.(contactDeleted); }, [contactDeleted]);
  useEffect(() => { onCategoryDeletedChange?.(categoryDeleted); }, [categoryDeleted]);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showContactModal,  setShowContactModal]  = useState(false);
  const [date,           setDate]           = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    if (!initialValues?.id) return;
    const [y, m, d] = (initialValues.entry_date ?? '').split('-').map(Number);
    const [h, min]  = (initialValues.entry_time ?? '00:00').split(':').map(Number);
    if (y) setDate(new Date(y, m - 1, d, h, min));
    setEntryType(initialValues.type ?? initialType);
    setAmount(initialValues.amount?.toString() ?? '');
    setRemark(initialValues.remark ?? '');
    setCategory(initialValues.category ?? '');
    setCategoryId(initialValues.category_id ?? null);
    setPaymentMode(initialValues.payment_mode ?? '');
    setPaymentModeId(initialValues.payment_mode_id ?? null);
    setContactName(initialValues.contact_name ?? '');
    setCustomerId(initialValues.customer_id ?? null);
    setSupplierId(initialValues.supplier_id ?? null);
    setAttachmentUrl(initialValues.attachment_url ?? null);
    setAttachmentPath(initialValues.attachment_path ?? null);
    setAttachmentProvider(initialValues.attachment_provider ?? 'supabase');
    setAttachmentLocalUri(null);
    setAttachmentName(null);
    const p = initialValues.attachment_path;
    setAttachmentType(p ? (p.endsWith('.pdf') ? 'pdf' : 'image') : null);
  }, [initialValues?.id]);

  useImperativeHandle(ref, () => ({
    getValues: () => ({
      type:                entryType,
      amount:              parseFloat(amount),
      remark:              remark.trim() || undefined,
      category:            categoryDeleted ? null : (category || undefined),
      category_id:         categoryDeleted ? null : (categoryId || undefined),
      payment_mode:        paymentMode,
      payment_mode_id:     paymentModeId || undefined,
      contact_name:        contactDeleted ? null : (contactName.trim() || null),
      customer_id:         contactDeleted ? null : (customerId  || null),
      supplier_id:         contactDeleted ? null : (supplierId  || null),
      attachment_url:      attachmentUrl ?? null,
      attachment_path:     attachmentPath ?? null,
      attachment_provider: attachmentProvider ?? null,
      entry_date:          date.toISOString().split('T')[0],
      entry_time:          date.toTimeString().slice(0, 5),
    }),
    validate: () => {
      const parsed = parseFloat(amount);
      if (!amount || isNaN(parsed) || parsed <= 0) return 'amount';
      if (!paymentModeId) return 'payment_mode';
      return null;
    },
  }));

  const isIn = entryType === 'in';

  const confirmDate = (picked) => {
    setDate(prev => { const n = new Date(prev); n.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate()); return n; });
    setShowDatePicker(false);
  };

  const confirmTime = (picked) => {
    setDate(prev => { const n = new Date(prev); n.setHours(picked.getHours(), picked.getMinutes()); return n; });
    setShowTimePicker(false);
  };

  const dateStr = date.toLocaleDateString('en-GB');
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();

  // ── Attachment helpers ────────────────────────────────────────────────────────

  const compressImage = async (uri) => {
    const imageRef = await ImageManipulator.manipulate(uri)
      .resize({ width: 1200 })
      .renderAsync();
    const result = await imageRef.saveAsync({ compress: 0.72, format: SaveFormat.JPEG });
    if (!result?.uri) throw new Error('Image processing failed. Please try a different photo.');
    return { uri: result.uri, mimeType: 'image/jpeg', filename: 'attachment.jpg' };
  };

  const processAndUpload = async (uri, type, name = null) => {
    const prevLocalUri = attachmentLocalUri;
    const prevType     = attachmentType;
    const prevName     = attachmentName;

    setAttachmentUploading(true);
    setAttachmentLocalUri(uri);
    setAttachmentType(type);
    setAttachmentName(name || (type === 'pdf' ? 'Document.pdf' : null));

    try {
      let finalUri  = uri;
      let finalMime = 'image/jpeg';
      let finalName = name || 'attachment.jpg';

      if (type === 'image') {
        const compressed = await compressImage(uri);
        finalUri  = compressed.uri;
        finalMime = compressed.mimeType;
        finalName = compressed.filename;
        setAttachmentLocalUri(finalUri);
      } else {
        finalMime = 'application/pdf';
        finalName = name || 'attachment.pdf';
      }

      const { url, path, provider } = await uploadAttachment({
        entryId:  initialValues?.id || null,
        uri:      finalUri,
        mimeType: finalMime,
        filename: finalName,
      });

      setAttachmentUrl(url);
      setAttachmentPath(path);
      setAttachmentProvider(provider);
    } catch (err) {
      setAttachmentLocalUri(prevLocalUri);
      setAttachmentType(prevType);
      setAttachmentName(prevName);
      setAttachError(getErrorMessage(err));
    } finally {
      setAttachmentUploading(false);
    }
  };

  const pickCamera = () => {
    closeAttachPicker(async () => {
      const { granted } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) {
        setAttachError('Camera permission is required. Please allow it in your device settings.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 1, exif: false, base64: false });
      if (!result.canceled && result.assets?.[0]) {
        await processAndUpload(result.assets[0].uri, 'image');
      }
    });
  };

  const pickGallery = () => {
    closeAttachPicker(async () => {
      const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!granted) {
        setAttachError('Photo library permission is required. Please allow it in your device settings.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, exif: false, base64: false });
      if (!result.canceled && result.assets?.[0]) {
        await processAndUpload(result.assets[0].uri, 'image');
      }
    });
  };

  const pickPDF = () => {
    closeAttachPicker(async () => {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        if (asset.size && asset.size > MAX_FILE_MB * 1024 * 1024) {
          setAttachError(`PDF is ${(asset.size / (1024 * 1024)).toFixed(1)} MB — maximum allowed is ${MAX_FILE_MB} MB.`);
          return;
        }
        await processAndUpload(asset.uri, 'pdf', asset.name);
      }
    });
  };

  const handleRemove = () => {
    setAttachmentLocalUri(null);
    setAttachmentUrl(null);
    setAttachmentPath(null);
    setAttachmentProvider(null);
    setAttachmentType(null);
    setAttachmentName(null);
  };

  const attachDisplayUri = attachmentLocalUri || attachmentUrl;

  const handleViewAttachment = () => {
    if (attachmentType === 'image') {
      setShowAttachViewer(true);
    } else if (attachDisplayUri) {
      Linking.openURL(attachDisplayUri);
    }
  };

  const ATTACH_OPTIONS = [
    { icon: 'camera',    label: 'Camera',       sub: 'Take a new photo',         onPress: pickCamera  },
    { icon: 'image',     label: 'Gallery',       sub: 'Choose from your gallery', onPress: pickGallery  },
    { icon: 'file-text', label: 'PDF Document',  sub: 'Attach a PDF file',        onPress: pickPDF      },
  ];

  return (
    <>
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {showTypeToggle && (
          <View style={s.typeRow}>
            <TouchableOpacity
              style={[s.typeBtn, isIn && { backgroundColor: C.cashIn, borderColor: C.cashIn }]}
              onPress={() => setEntryType('in')}
              activeOpacity={0.8}
            >
              <Text style={[s.typeBtnText, isIn && { color: '#fff' }]}>Cash In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.typeBtn, !isIn && { backgroundColor: C.danger, borderColor: C.danger }]}
              onPress={() => setEntryType('out')}
              activeOpacity={0.8}
            >
              <Text style={[s.typeBtnText, !isIn && { color: '#fff' }]}>Cash Out</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={s.dateTimeRow}>
          <TouchableOpacity style={s.dateTimePicker} activeOpacity={0.7} onPress={() => setShowDatePicker(true)}>
            <Text style={s.dateTimeIcon}>📅</Text>
            <Text style={s.dateTimeText}>{dateStr}</Text>
            <ChevronDownIcon color={C.textMuted} size={11} />
          </TouchableOpacity>
          <TouchableOpacity style={s.dateTimePicker} activeOpacity={0.7} onPress={() => setShowTimePicker(true)}>
            <Text style={s.dateTimeIcon}>🕐</Text>
            <Text style={s.dateTimeText}>{timeStr}</Text>
            <ChevronDownIcon color={C.textMuted} size={11} />
          </TouchableOpacity>
        </View>

        <AppInput
          label="Amount *"
          value={amount}
          onChangeText={setAmount}
          placeholder="0"
          keyboardType="decimal-pad"
          autoFocus={autoFocusAmount}
          isLast
          style={s.fieldGap}
          labelColor={C.primary}
        />

        {showContact && (
          <View style={s.fieldGap}>
            <TouchableOpacity onPress={() => setShowContactModal(true)} activeOpacity={0.85}>
              <AppInput
                label={customerId ? 'Customer' : supplierId ? 'Supplier' : allowedContactTypes.length === 1 ? (allowedContactTypes[0] === 'customer' ? 'Customer' : 'Supplier') : 'Contact (Customer/Supplier)'}
                value={contactName}
                placeholder="Select contact"
                editable={false}
                rightElement={
                  contactName
                    ? <TouchableOpacity onPress={(e) => { e.stopPropagation(); setContactName(''); setCustomerId(null); setSupplierId(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><CloseIcon color={contactDeleted ? '#F59E0B' : C.textMuted} size={14} /></TouchableOpacity>
                    : <ChevronDownIcon color={C.textMuted} size={12} />
                }
                isLast
                labelColor={contactDeleted ? '#F59E0B' : C.primary}
              />
            </TouchableOpacity>
            {contactDeleted && (
              <Text style={s.contactDeletedHint}>Contact no longer exists — tap × to remove</Text>
            )}
          </View>
        )}

        <AppInput
          label="Remark"
          value={remark}
          onChangeText={setRemark}
          placeholder="Item, Person Name, Quantity..."
          multiline
          rightElement={<Text style={{ fontSize: 20 }}>🎤</Text>}
          isLast
          style={s.fieldGap}
          labelColor={C.primary}
        />

        {/* ── Attachment ──────────────────────────────────────────────────────── */}
        {showAttachment && (
          <View style={s.fieldGap}>
            {attachmentUploading ? (
              <View style={[s.attachBtn, { borderColor: C.primary }]}>
                <ActivityIndicator size="small" color={C.primary} />
                <Text style={[s.attachText, { color: C.textMuted, fontFamily: Font.medium }]}>
                  Uploading…
                </Text>
              </View>
            ) : attachError ? (
              <View style={[s.attachErrorCard, { backgroundColor: C.dangerLight, borderColor: C.danger }]}>
                <View style={[s.attachErrorIconBox, { backgroundColor: C.danger }]}>
                  <Feather name="alert-circle" size={18} color="#fff" />
                </View>
                <View style={s.attachErrorBody}>
                  <Text style={[s.attachErrorTitle, { color: C.danger, fontFamily: Font.semiBold }]}>
                    Upload Failed
                  </Text>
                  <Text style={[s.attachErrorMsg, { color: C.danger, fontFamily: Font.regular }]} numberOfLines={3}>
                    {attachError}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setAttachError(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="x" size={16} color={C.danger} />
                </TouchableOpacity>
              </View>
            ) : attachDisplayUri ? (
              <TouchableOpacity
                style={[s.attachPreview, { backgroundColor: C.card, borderColor: C.border }]}
                onPress={openAttachPicker}
                activeOpacity={0.85}
              >
                {attachmentType === 'image' ? (
                  <Image source={{ uri: attachDisplayUri }} style={s.attachThumb} resizeMode="cover" />
                ) : (
                  <View style={[s.attachPdfIcon, { backgroundColor: C.dangerLight }]}>
                    <Feather name="file-text" size={20} color={C.danger} />
                  </View>
                )}
                <View style={s.attachPreviewBody}>
                  <Text style={[s.attachPreviewName, { color: C.text, fontFamily: Font.semiBold }]} numberOfLines={1}>
                    {attachmentType === 'pdf'
                      ? (attachmentName || attachmentPath?.split('/').pop() || 'Document.pdf')
                      : 'Photo attached'}
                  </Text>
                  <Text style={[s.attachPreviewSub, { color: C.textMuted, fontFamily: Font.regular }]}>
                    Tap to change
                  </Text>
                </View>
                <TouchableOpacity onPress={handleViewAttachment} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginRight: 8 }}>
                  <Feather name="eye" size={18} color={C.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRemove} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Feather name="x" size={18} color={C.textMuted} />
                </TouchableOpacity>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[s.attachBtn, { borderColor: C.border }]}
                onPress={openAttachPicker}
                activeOpacity={0.7}
              >
                <Feather name="paperclip" size={16} color={C.primary} />
                <Text style={[s.attachText, { color: C.primary, fontFamily: Font.semiBold }]}>
                  Attach Image or PDF
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {showCategory && (
          <View style={s.fieldGap}>
            <TouchableOpacity onPress={() => setShowCategoryModal(true)} activeOpacity={0.85}>
              <AppInput
                label="Category"
                value={category}
                placeholder="Select category"
                editable={false}
                rightElement={
                  category
                    ? <TouchableOpacity onPress={(e) => { e.stopPropagation(); setCategory(''); setCategoryId(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <CloseIcon color={categoryDeleted ? '#F59E0B' : C.textMuted} size={14} />
                      </TouchableOpacity>
                    : <ChevronDownIcon color={C.textMuted} size={12} />
                }
                isLast
                labelColor={categoryDeleted ? '#F59E0B' : C.primary}
              />
            </TouchableOpacity>
            {categoryDeleted && (
              <Text style={s.contactDeletedHint}>Category no longer exists — tap × to remove</Text>
            )}
          </View>
        )}

        <Text style={s.sectionLabel}>Payment Mode *</Text>
        {modesLoading ? (
          <ActivityIndicator size="small" color={C.primary} style={{ marginBottom: 16 }} />
        ) : (
          <View style={s.paymentRow}>
            {paymentModes.map((mode) => (
              <TouchableOpacity
                key={mode.id}
                style={[s.paymentChip, paymentModeId === mode.id && { backgroundColor: C.primary, borderColor: C.primary }]}
                onPress={() => { setPaymentModeId(mode.id); setPaymentMode(mode.name); }}
                activeOpacity={0.8}
              >
                <Text style={[s.paymentChipText, paymentModeId === mode.id && { color: '#fff' }]}>
                  {mode.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── Attach Picker Bottom Sheet ───────────────────────────────────────── */}
      <Modal
        visible={showAttachPicker}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => closeAttachPicker()}
      >
        <View style={s.pickerOverlay}>
          {/* Dim backdrop — tapping closes the sheet */}
          <TouchableOpacity style={s.pickerBackdrop} activeOpacity={1} onPress={() => closeAttachPicker()} />

          {/* Sheet */}
          <Animated.View style={[s.pickerSheet, { backgroundColor: C.card, transform: [{ translateY: slideY }] }]}>
            {/* Handle bar */}
            <View style={[s.pickerHandle, { backgroundColor: C.border }]} />

            <Text style={[s.pickerTitle, { color: C.text, fontFamily: Font.bold }]}>Attach File</Text>

            {/* Options */}
            {ATTACH_OPTIONS.map((opt, idx) => (
              <TouchableOpacity
                key={opt.label}
                style={[s.pickerOption, idx < ATTACH_OPTIONS.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border }]}
                onPress={opt.onPress}
                activeOpacity={0.7}
              >
                <View style={[s.pickerOptionIcon, { backgroundColor: C.primaryLight }]}>
                  <Feather name={opt.icon} size={20} color={C.primary} />
                </View>
                <View style={s.pickerOptionBody}>
                  <Text style={[s.pickerOptionLabel, { color: C.text, fontFamily: Font.semiBold }]}>{opt.label}</Text>
                  <Text style={[s.pickerOptionSub, { color: C.textMuted, fontFamily: Font.regular }]}>{opt.sub}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={C.textMuted} />
              </TouchableOpacity>
            ))}

            {/* Remove option — only when attachment exists */}
            {attachDisplayUri && (
              <TouchableOpacity
                style={[s.pickerRemove, { borderTopWidth: 1, borderTopColor: C.border }]}
                onPress={() => { closeAttachPicker(handleRemove); }}
                activeOpacity={0.7}
              >
                <View style={[s.pickerOptionIcon, { backgroundColor: C.dangerLight }]}>
                  <Feather name="trash-2" size={20} color={C.danger} />
                </View>
                <Text style={[s.pickerRemoveLabel, { color: C.danger, fontFamily: Font.semiBold }]}>Remove Attachment</Text>
              </TouchableOpacity>
            )}

            {/* Cancel */}
            <TouchableOpacity
              style={[s.pickerCancel, { backgroundColor: C.inputBg }]}
              onPress={() => closeAttachPicker()}
              activeOpacity={0.8}
            >
              <Text style={[s.pickerCancelText, { color: C.text, fontFamily: Font.semiBold }]}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      {/* ── Image Viewer Modal ──────────────────────────────────────────────── */}
      {showAttachViewer && (
        <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={() => setShowAttachViewer(false)}>
          <View style={s.viewerBg}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowAttachViewer(false)} />
            <TouchableOpacity style={s.viewerClose} onPress={() => setShowAttachViewer(false)} activeOpacity={0.8}>
              <Feather name="x" size={20} color="#fff" />
            </TouchableOpacity>
            <Image
              source={{ uri: attachDisplayUri }}
              style={s.viewerImage}
              resizeMode="contain"
            />
          </View>
        </Modal>
      )}

      {/* ── Other modals ────────────────────────────────────────────────────── */}
      <CategoryPickerModal
        visible={showCategoryModal}
        bookId={bookId}
        selectedCategoryId={categoryId}
        onSelect={({ id, name }) => { setCategory(name); setCategoryId(id); setShowCategoryModal(false); }}
        onDeselect={() => { setCategory(''); setCategoryId(null); }}
        onClose={() => setShowCategoryModal(false)}
      />

      <ContactPickerModal
        visible={showContactModal}
        bookId={bookId}
        selectedContactId={customerId || supplierId}
        selectedContactType={customerId ? 'customer' : supplierId ? 'supplier' : null}
        allowedTypes={allowedContactTypes}
        onSelect={({ id, name, customer_id, supplier_id }) => {
          setContactName(name);
          setCustomerId(customer_id || null);
          setSupplierId(supplier_id || null);
          setShowContactModal(false);
        }}
        onDeselect={() => { setContactName(''); setCustomerId(null); setSupplierId(null); }}
        onClose={() => setShowContactModal(false)}
      />

      <DatePickerModal
        visible={showDatePicker}
        date={date}
        onConfirm={confirmDate}
        onCancel={() => setShowDatePicker(false)}
      />
      <TimePickerModal
        visible={showTimePicker}
        date={date}
        onConfirm={confirmTime}
        onCancel={() => setShowTimePicker(false)}
      />
    </>
  );
});

export default EntryForm;

const makeStyles = (C, Font) => StyleSheet.create({
  scroll: { flex: 1, padding: 16 },

  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  typeBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 24,
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border,
    alignItems: 'center',
  },
  typeBtnText: { fontSize: 14, fontFamily: Font.semiBold, color: C.text, lineHeight: 20 },

  dateTimeRow:    { flexDirection: 'row', gap: 10, marginBottom: 16 },
  dateTimePicker: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11,
    borderWidth: 1, borderColor: C.border,
  },
  dateTimeIcon: { fontSize: 14 },
  dateTimeText: { flex: 1, fontSize: 13, fontFamily: Font.medium, color: C.text, lineHeight: 18 },

  fieldGap: { marginBottom: 12 },
  contactDeletedHint: {
    fontSize: 12, fontFamily: Font.medium, color: '#F59E0B',
    marginTop: 5, paddingHorizontal: 2,
  },

  // Attach — empty state button
  attachBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderStyle: 'dashed',
    borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16,
  },
  attachText: { fontSize: 14, lineHeight: 20 },

  // Attach — has-file preview row
  // Attach — inline error card
  attachErrorCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  attachErrorIconBox: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  attachErrorBody:  { flex: 1 },
  attachErrorTitle: { fontSize: 13, lineHeight: 18, marginBottom: 2 },
  attachErrorMsg:   { fontSize: 12, lineHeight: 17 },

  attachPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10,
  },
  attachThumb:       { width: 48, height: 48, borderRadius: 8 },
  attachPdfIcon:     { width: 48, height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  attachPreviewBody: { flex: 1 },
  attachPreviewName: { fontSize: 13, lineHeight: 18 },
  attachPreviewSub:  { fontSize: 11, lineHeight: 16, marginTop: 2 },

  // Payment modes
  sectionLabel:    { fontSize: 13, fontFamily: Font.bold, color: C.text, marginBottom: 10, lineHeight: 18 },
  paymentRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  paymentChip:     { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 24, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border },
  paymentChipText: { fontSize: 13, fontFamily: Font.semiBold, color: C.text, lineHeight: 18 },

  // ── Attach picker sheet ──────────────────────────────────────────────────────
  pickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  pickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  pickerSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 16,
    elevation: 16,
  },
  pickerHandle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 20,
  },
  pickerTitle: {
    fontSize: 16, textAlign: 'center', marginBottom: 16,
  },
  pickerOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14,
  },
  pickerOptionIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  pickerOptionBody: { flex: 1 },
  pickerOptionLabel: { fontSize: 15, lineHeight: 20 },
  pickerOptionSub:   { fontSize: 12, lineHeight: 17, marginTop: 2 },
  pickerRemove: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, marginTop: 4,
  },
  pickerRemoveLabel: { flex: 1, fontSize: 15, lineHeight: 20 },
  pickerCancel: {
    marginTop: 16, paddingVertical: 14,
    borderRadius: 14, alignItems: 'center',
  },
  pickerCancelText: { fontSize: 15 },

  // ── Attachment full-screen viewer ────────────────────────────────────────────
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
  viewerImage: {
    width: '92%', height: '75%', borderRadius: 8,
  },
});
