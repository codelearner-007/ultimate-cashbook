import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  StatusBar, ScrollView, Alert, Modal, Animated,
  ActivityIndicator,
} from 'react-native';
import { ProfileCardSkeleton } from '../components/ui/Shimmer';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import { useRouter } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useProfile, useUpdateProfile, useUploadAvatar } from '../hooks/useProfile';
import { Font } from '../constants/fonts';
import AppInput from '../components/ui/Input';
import AdminPillBadge from '../components/ui/AdminPillBadge';
import SuccessDialog from '../components/ui/SuccessDialog';

// ── Icons ─────────────────────────────────────────────────────────────────────

const BackIcon = ({ color }) => (
  <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 9, height: 9, borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderColor: color, transform: [{ rotate: '45deg' }] }} />
  </View>
);


const CameraIcon = ({ size = 13 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.82, height: size * 0.65, borderRadius: 2, borderWidth: 1.5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.35, height: size * 0.35, borderRadius: size * 0.175, borderWidth: 1.5, borderColor: '#fff' }} />
    </View>
    <View style={{ position: 'absolute', top: 0, left: size * 0.2, width: size * 0.25, height: size * 0.18, borderTopLeftRadius: 2, borderTopRightRadius: 2, borderWidth: 1.5, borderColor: '#fff', borderBottomWidth: 0 }} />
  </View>
);



// ── Photo Picker Sheet ────────────────────────────────────────────────────────

const ViewPhotoIcon = () => (
  <View style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>
    {/* Eye outline */}
    <View style={{ width: 22, height: 13, borderRadius: 11, borderWidth: 2, borderColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#7C3AED' }} />
    </View>
  </View>
);

const CameraSheetIcon = () => (
  <View style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 22, height: 15, borderRadius: 4, borderWidth: 2, borderColor: '#2563EB', alignItems: 'center', justifyContent: 'center', position: 'absolute', bottom: 1 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: '#2563EB' }} />
    </View>
    <View style={{ width: 8, height: 5, borderTopLeftRadius: 2, borderTopRightRadius: 2, borderWidth: 2, borderColor: '#2563EB', borderBottomWidth: 0, position: 'absolute', top: 2, left: 5 }} />
  </View>
);

const GallerySheetIcon = () => (
  <View style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 22, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#16A34A', overflow: 'hidden' }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#16A34A', position: 'absolute', top: 3, right: 3 }} />
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-end' }}>
        <View style={{ width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#16A34A' }} />
        <View style={{ width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 7, borderBottomWidth: 9, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#16A34A', marginLeft: -3 }} />
      </View>
    </View>
  </View>
);

const ChevronRight = ({ color }) => (
  <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 6, height: 6, borderRightWidth: 2, borderTopWidth: 2, borderColor: color, transform: [{ rotate: '45deg' }] }} />
  </View>
);

function PhotoPickerSheet({ visible, onDismiss, onCamera, onGallery, onViewPhoto, currentUri, userName, userInitials, isSuperAdmin, C }) {
  const slideY    = useRef(new Animated.Value(420)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    slideY.setValue(420);
    bgOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(slideY, { toValue: 0, tension: 170, friction: 22, useNativeDriver: true }),
    ]).start();
  }, [visible]);

  const close = (then) => {
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideY,    { toValue: 420, duration: 220, useNativeDriver: true }),
    ]).start(() => { onDismiss(); then?.(); });
  };

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={() => close()} statusBarTranslucent>
      <Animated.View style={[ps.overlay, { opacity: bgOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => close()} />

        <Animated.View style={[ps.sheet, { backgroundColor: C.card, transform: [{ translateY: slideY }] }]}>

          {/* Handle */}
          <View style={[ps.handle, { backgroundColor: C.border }]} />

          {/* Avatar preview */}
          <View style={ps.previewWrap}>
            <View style={[ps.previewCircle, { borderColor: C.border,
              backgroundColor: currentUri ? C.card : C.primary }]}>
              {currentUri
                ? <ExpoImage source={{ uri: currentUri }} style={{ width: '100%', height: '100%', borderRadius: 42 }} contentFit="cover" />
                : <Text style={[ps.previewInitials, { color: '#fff' }]}>{userInitials}</Text>
              }
            </View>
            <Text style={[ps.previewName, { color: C.text }]}>{userName || 'Profile Photo'}</Text>
            {isSuperAdmin && <AdminPillBadge />}
            <Text style={[ps.previewSub,  { color: C.textMuted, marginTop: 6 }]}>Change your profile picture</Text>
          </View>

          {/* Options */}
          <View style={[ps.optionsCard, { backgroundColor: C.background, borderColor: C.border }]}>

            {/* View Photo — only when a photo exists */}
            {currentUri && (
              <>
                <TouchableOpacity
                  style={ps.optionRow}
                  activeOpacity={0.65}
                  onPress={() => close(() => setTimeout(onViewPhoto, 300))}
                >
                  <View style={[ps.optionIcon, { backgroundColor: '#F5F3FF' }]}>
                    <ViewPhotoIcon />
                  </View>
                  <View style={ps.optionBody}>
                    <Text style={[ps.optionTitle, { color: C.text }]}>View Photo</Text>
                    <Text style={[ps.optionDesc,  { color: C.textMuted }]}>See your current photo</Text>
                  </View>
                  <ChevronRight color={C.textMuted} />
                </TouchableOpacity>
                <View style={[ps.rowDivider, { backgroundColor: C.border }]} />
              </>
            )}

            <TouchableOpacity
              style={ps.optionRow}
              activeOpacity={0.65}
              onPress={() => close(() => setTimeout(onCamera, 380))}
            >
              <View style={[ps.optionIcon, { backgroundColor: '#EFF6FF' }]}>
                <CameraSheetIcon />
              </View>
              <View style={ps.optionBody}>
                <Text style={[ps.optionTitle, { color: C.text }]}>Take Photo</Text>
                <Text style={[ps.optionDesc,  { color: C.textMuted }]}>Open camera to capture</Text>
              </View>
              <ChevronRight color={C.textMuted} />
            </TouchableOpacity>

            <View style={[ps.rowDivider, { backgroundColor: C.border }]} />

            <TouchableOpacity
              style={ps.optionRow}
              activeOpacity={0.65}
              onPress={() => close(() => setTimeout(onGallery, 380))}
            >
              <View style={[ps.optionIcon, { backgroundColor: '#F0FDF4' }]}>
                <GallerySheetIcon />
              </View>
              <View style={ps.optionBody}>
                <Text style={[ps.optionTitle, { color: C.text }]}>Choose from Gallery</Text>
                <Text style={[ps.optionDesc,  { color: C.textMuted }]}>Pick from your photos</Text>
              </View>
              <ChevronRight color={C.textMuted} />
            </TouchableOpacity>

          </View>

          {/* Cancel */}
          <TouchableOpacity
            style={[ps.cancelBtn, { backgroundColor: C.background, borderColor: C.border }]}
            activeOpacity={0.7}
            onPress={() => close()}
          >
            <Text style={[ps.cancelText, { color: C.textMuted }]}>Cancel</Text>
          </TouchableOpacity>

        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const ps = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingBottom: 40, paddingTop: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.14, shadowRadius: 24, elevation: 22,
  },
  handle: {
    width: 38, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 18,
  },

  previewWrap: { alignItems: 'center', paddingBottom: 20, paddingHorizontal: 24 },
  previewCircle: {
    width: 90, height: 90, borderRadius: 45, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 10, elevation: 6,
  },
  previewInitials: { fontSize: 34, fontFamily: Font.extraBold },
  previewName:     { fontSize: 16, fontFamily: Font.bold,    marginBottom: 3 },
  previewSub:      { fontSize: 12, fontFamily: Font.regular },

  optionsCard: {
    marginHorizontal: 16, borderRadius: 16,
    borderWidth: 1, overflow: 'hidden', marginBottom: 12,
  },
  optionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 15,
  },
  optionIcon: {
    width: 46, height: 46, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  optionBody:  { flex: 1 },
  optionTitle: { fontSize: 15, fontFamily: Font.semiBold, marginBottom: 2 },
  optionDesc:  { fontSize: 12, fontFamily: Font.regular },
  rowDivider:  { height: 1, marginLeft: 76 },

  cancelBtn: {
    marginHorizontal: 16, borderRadius: 14, borderWidth: 1,
    paddingVertical: 15, alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontFamily: Font.semiBold },
});

// ── Image Viewer ─────────────────────────────────────────────────────────────

function ImageViewerModal({ visible, uri, name, initials, C, onClose }) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    if (!visible) return;
    fadeAnim.setValue(0);
    scaleAnim.setValue(0.88);
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 180, friction: 12, useNativeDriver: true }),
    ]).start();
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[iv.bg, { opacity: fadeAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />

        {/* Close button */}
        <TouchableOpacity style={iv.closeBtn} onPress={onClose} activeOpacity={0.8}>
          <View style={{ width: 16, height: 2.5, backgroundColor: '#fff', borderRadius: 2, position: 'absolute', transform: [{ rotate: '45deg'  }] }} />
          <View style={{ width: 16, height: 2.5, backgroundColor: '#fff', borderRadius: 2, position: 'absolute', transform: [{ rotate: '-45deg' }] }} />
        </TouchableOpacity>

        {/* Avatar */}
        <Animated.View style={[iv.imgWrap, { transform: [{ scale: scaleAnim }] }]}>
          {uri ? (
            <ExpoImage source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary }}>
              <Text style={{ fontSize: 72, fontFamily: Font.extraBold, color: '#fff' }}>{initials}</Text>
            </View>
          )}
        </Animated.View>

        {/* Name */}
        <Animated.View style={[iv.nameWrap, { opacity: fadeAnim }]}>
          <Text style={iv.nameTxt}>{name || 'Profile Photo'}</Text>
          <Text style={iv.subTxt}>Profile Photo</Text>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const iv = StyleSheet.create({
  bg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute', top: 56, right: 20, zIndex: 20,
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  imgWrap: {
    width: 260, height: 260, borderRadius: 130,
    overflow: 'hidden',
    borderWidth: 4, borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.6, shadowRadius: 40, elevation: 20,
  },
  nameWrap: { alignItems: 'center', marginTop: 28 },
  nameTxt:  { fontSize: 22, fontFamily: Font.bold, color: '#fff', marginBottom: 6 },
  subTxt:   { fontSize: 13, fontFamily: Font.regular, color: 'rgba(255,255,255,0.5)' },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const { C, isDark }  = useTheme();

  const { data: profile, isLoading, isError } = useProfile();
  const updateProfile = useUpdateProfile();

  const [name,           setName]          = useState('');
  const [phone,          setPhone]         = useState('');
  const [age,            setAge]           = useState('');
  const [showSuccess,    setShowSuccess]   = useState(false);
  const [localAvatarUri, setLocalAvatarUri] = useState(null);
  const [showPhotoSheet,  setShowPhotoSheet]  = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);

  const uploadAvatar = useUploadAvatar();

  // Sync form when data loads
  useEffect(() => {
    if (profile) {
      setName(profile.full_name ?? '');
      setPhone(profile.phone ?? '');
      setAge(profile.age != null ? String(profile.age) : '');
    }
  }, [profile]);

  const isSuperAdmin = profile?.role === 'superadmin';

  const initials = (profile?.full_name ?? '?')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const isDirty = profile
    ? name.trim() !== (profile.full_name ?? '')
      || phone !== (profile.phone ?? '')
      || age !== (profile.age != null ? String(profile.age) : '')
    : false;

  const handlePickImage = async (source) => {
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera access is required to take a photo.');
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Photo library access is required.');
        return;
      }
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setLocalAvatarUri(asset.uri);
      uploadAvatar.mutate(
        { uri: asset.uri, mimeType: asset.mimeType || 'image/jpeg' },
        {
          onSuccess: () => setLocalAvatarUri(null),
          onError:   () => { setLocalAvatarUri(null); Alert.alert('Upload failed', 'Could not upload photo. Please try again.'); },
        }
      );
    }
  };

  const handleUpdate = () => {
    if (!name.trim()) return;
    const parsedAge = age.trim() ? parseInt(age.trim(), 10) : null;
    updateProfile.mutate(
      { full_name: name.trim(), phone: phone.trim() || null, age: parsedAge },
      {
        onSuccess: () => setShowSuccess(true),
        onError:   () => Alert.alert('Error', 'Could not save changes. Please try again.'),
      }
    );
  };

  const s = makeStyles(C);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? C.background : C.primary} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <BackIcon color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>

        {isLoading ? (
          <ProfileCardSkeleton />
        ) : isError ? (
          <View style={s.errorBox}>
            <Text style={[s.errorText, { color: C.textMuted }]}>Could not load profile. Pull down to retry.</Text>
          </View>
        ) : (
          <>
            {/* Avatar card — overlaps hero */}
            <View style={[s.avatarCard, { backgroundColor: C.card, borderColor: C.border }]}>
              <View style={s.avatarWrap}>
                {(localAvatarUri || profile?.avatar_url) ? (
                  <View style={[s.avatar, { borderColor: C.card }]}>
                    <ExpoImage
                      source={{ uri: localAvatarUri || profile.avatar_url }}
                      style={{ width: '100%', height: '100%', borderRadius: 36 }}
                      contentFit="cover"
                    />
                  </View>
                ) : (
                  <View style={[s.avatar, { backgroundColor: C.primary, borderColor: C.card }]}>
                    <Text style={s.avatarInitials}>{initials}</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[s.cameraBtn, { backgroundColor: C.primaryDark, borderColor: C.card }]}
                  activeOpacity={0.8}
                  disabled={uploadAvatar.isPending}
                  onPress={() => setShowPhotoSheet(true)}
                >
                  {uploadAvatar.isPending
                    ? <ActivityIndicator size={12} color="#fff" />
                    : <CameraIcon size={13} />
                  }
                </TouchableOpacity>
              </View>
              <Text style={[s.avatarName,  { color: C.text }]}>{profile?.full_name ?? '—'}</Text>
              <Text style={[s.avatarEmail, { color: C.textMuted }]}>{profile?.email ?? '—'}</Text>
              {isSuperAdmin && <AdminPillBadge />}
            </View>

            {/* Editable fields */}
            <View style={s.sectionWrap}>
              <Text style={[s.sectionLabel, { color: C.textMuted }]}>ACCOUNT DETAILS</Text>
              <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
                <AppInput
                  label="Full Name"
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter your name"
                />
                <AppInput
                  label="Email Address"
                  value={profile?.email}
                  editable={false}
                  rightElement={
                    profile?.email_verified ? (
                      <View style={s.verifiedBadge}>
                        <View style={s.verifiedDot} />
                        <Text style={s.verifiedText}>Verified</Text>
                      </View>
                    ) : null
                  }
                />
                <AppInput
                  label="Phone Number"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="+92 300 0000000"
                />
                <AppInput
                  label="Age"
                  value={age}
                  onChangeText={(v) => setAge(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="e.g. 25"
                  isLast
                />
              </View>
            </View>

            {/* Update button */}
            <View style={s.btnWrap}>
              <TouchableOpacity
                style={[s.updateBtn, { backgroundColor: C.primary, opacity: isDirty && !updateProfile.isPending ? 1 : 0.4 }]}
                onPress={handleUpdate}
                disabled={!isDirty || updateProfile.isPending}
                activeOpacity={0.85}
              >
                <Text style={s.updateBtnText}>
                  {updateProfile.isPending ? 'Saving…' : 'Update Profile'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

      </ScrollView>
      <SuccessDialog
        visible={showSuccess}
        onDismiss={() => setShowSuccess(false)}
        title="Profile Updated"
        subtitle="Your changes have been saved"
      />
      <PhotoPickerSheet
        visible={showPhotoSheet}
        onDismiss={() => setShowPhotoSheet(false)}
        onCamera={() => handlePickImage('camera')}
        onGallery={() => handlePickImage('gallery')}
        onViewPhoto={() => setShowImageViewer(true)}
        currentUri={localAvatarUri || profile?.avatar_url || null}
        userName={profile?.full_name ?? ''}
        userInitials={initials}
        isSuperAdmin={isSuperAdmin}
        C={C}
      />
      <ImageViewerModal
        visible={showImageViewer}
        uri={localAvatarUri || profile?.avatar_url || null}
        name={profile?.full_name ?? ''}
        initials={initials}
        C={C}
        onClose={() => setShowImageViewer(false)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeStyles = (C) => StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.background },
  scroll:        { flex: 1 },
  scrollContent: { paddingBottom: 48 },

  header: {
    backgroundColor: C.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: Font.bold, color: '#fff' },

  avatarCard: {
    alignItems: 'center', marginHorizontal: 16, borderRadius: 20,
    paddingVertical: 24, marginTop: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 6,
    borderWidth: 1,
  },
  avatarWrap: { marginBottom: 12 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  avatarInitials: { fontSize: 28, fontFamily: Font.extraBold, color: '#fff' },
  cameraBtn: {
    position: 'absolute', bottom: 0, right: -2,
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  avatarName:  { fontSize: 18, fontFamily: Font.bold,    marginBottom: 3 },
  avatarEmail: { fontSize: 13, fontFamily: Font.regular, marginBottom: 6 },

  sectionWrap:  { marginHorizontal: 16, marginTop: 24, marginBottom: 16 },
  sectionLabel: {
    fontSize: 11, fontFamily: Font.semiBold, letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: 8, marginLeft: 2,
  },
  card: { borderRadius: 16, overflow: 'hidden', borderWidth: 1 },

  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#F0FDF4', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#BBF7D0', marginLeft: 8,
  },
  verifiedDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: '#16A34A' },
  verifiedText: { fontSize: 11, fontFamily: Font.semiBold, color: '#15803D' },

  btnWrap:   { marginHorizontal: 16, marginTop: 8 },
  updateBtn: {
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 4,
  },
  updateBtnText: { fontSize: 15, fontFamily: Font.bold, color: '#fff' },

  errorBox:  { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  errorText: { fontSize: 14, fontFamily: Font.regular, textAlign: 'center', lineHeight: 22 },
});
