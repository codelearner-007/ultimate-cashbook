import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import { useRouter } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { Font } from '../constants/fonts';

const BackIcon = ({ color }) => (
  <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 9, height: 9, borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderColor: color, transform: [{ rotate: '45deg' }] }} />
  </View>
);

const ChevronRight = ({ color }) => (
  <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 7, height: 7, borderRightWidth: 2, borderTopWidth: 2, borderColor: color, transform: [{ rotate: '45deg' }] }} />
  </View>
);

const BuildingIcon = ({ color, size = 20 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.75, height: size * 0.65, borderWidth: 1.5, borderColor: color, borderRadius: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 0 }}>
      <View style={{ width: size * 0.28, height: size * 0.32, borderWidth: 1.5, borderColor: color, borderRadius: 1 }} />
    </View>
    <View style={{ width: size * 0.85, height: 1.5, backgroundColor: color, borderRadius: 1 }} />
  </View>
);

const TrashIcon = ({ color, size = 20 }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: size * 0.6, height: size * 0.65, borderWidth: 1.5, borderColor: color, borderTopWidth: 0, borderRadius: 1, marginTop: 2 }} />
    <View style={{ width: size * 0.75, height: 1.5, backgroundColor: color, borderRadius: 1 }} />
    <View style={{ position: 'absolute', top: 0, width: size * 0.4, height: size * 0.22, borderWidth: 1.5, borderColor: color, borderRadius: 2, borderBottomWidth: 0 }} />
  </View>
);

const ITEMS = [
  {
    icon: BuildingIcon,
    label: 'Business Profile',
    sub: 'Name, logo, contact info',
    route: '/(app)/settings/business/profile',
    danger: false,
  },
  {
    icon: TrashIcon,
    label: 'Delete Business',
    sub: 'Permanently remove this business',
    route: '/(app)/settings/business/delete',
    danger: true,
  },
];

export default function BusinessSettingsScreen() {
  const router = useRouter();
  const { C, isDark }  = useTheme();
  const s = makeStyles(C);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? C.background : C.primary} />

      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <BackIcon color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Business Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.content}>
        <Text style={[s.sectionLabel, { color: C.textMuted }]}>MANAGE BUSINESS</Text>
        <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
          {ITEMS.map((item, idx) => (
            <View key={item.label}>
              <TouchableOpacity
                style={s.row}
                onPress={() => router.push(item.route)}
                activeOpacity={0.75}
              >
                <View style={[s.iconBox, { backgroundColor: item.danger ? C.dangerLight : C.primaryLight }]}>
                  <item.icon color={item.danger ? C.danger : C.primary} size={20} />
                </View>
                <View style={s.rowBody}>
                  <Text style={[s.rowLabel, { color: item.danger ? C.danger : C.text }]}>{item.label}</Text>
                  <Text style={[s.rowSub, { color: C.textMuted }]}>{item.sub}</Text>
                </View>
                <ChevronRight color={C.textSubtle} />
              </TouchableOpacity>
              {idx < ITEMS.length - 1 && <View style={[s.divider, { backgroundColor: C.border }]} />}
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.background },
  header: {
    backgroundColor: C.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: Font.bold, color: '#fff' },

  content:      { padding: 16, paddingTop: 24 },
  sectionLabel: {
    fontSize: 11, fontFamily: Font.semiBold, letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: 8, marginLeft: 2,
  },
  card:    { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  row:     { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  divider: { height: 1, marginHorizontal: 16 },
  iconBox: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  rowBody:  { flex: 1 },
  rowLabel: { fontSize: 15, fontFamily: Font.semiBold, marginBottom: 2 },
  rowSub:   { fontSize: 12, fontFamily: Font.regular },
});
