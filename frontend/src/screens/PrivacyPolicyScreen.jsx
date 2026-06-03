import { useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar,
} from 'react-native';
import SafeAreaView from '../components/ui/AppSafeAreaView';
import { useRouter } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { Font } from '../constants/fonts';

// ── Icons ─────────────────────────────────────────────────────────────────────

const BackIcon = ({ color }) => (
  <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 9, height: 9, borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderColor: color, transform: [{ rotate: '45deg' }] }} />
  </View>
);

// ── Privacy policy content ────────────────────────────────────────────────────

const SECTIONS = [
  {
    title: 'Information We Collect',
    body: 'We collect information you provide directly to us, such as when you create an account, add financial entries, or contact us for support. This includes:\n\n• Account information (name, email address)\n• Financial records you enter (income, expense transactions)\n• Device information and usage data\n• Business details you optionally provide',
  },
  {
    title: 'How We Use Your Information',
    body: 'We use the information we collect to:\n\n• Provide, maintain, and improve our services\n• Sync your data across devices (Pro and Business plans)\n• Send you important account and service notifications\n• Respond to your comments and questions\n• Monitor and analyze trends and usage\n• Detect and prevent fraudulent transactions',
  },
  {
    title: 'Data Storage & Security',
    body: 'Your data is stored securely using industry-standard encryption. Financial records are stored in our secure cloud database (Supabase) protected by row-level security policies.\n\nFree plan users\' data is stored locally on their device. Pro and Business plan users benefit from encrypted cloud backup and sync.\n\nWe implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.',
  },
  {
    title: 'Data Sharing',
    body: 'We do not sell, trade, or rent your personal information to third parties. We may share your information only in the following limited circumstances:\n\n• With your explicit consent\n• To comply with legal obligations\n• To protect the rights and safety of our users\n• With service providers who assist us in operating our platform (under strict confidentiality agreements)',
  },
  {
    title: 'Book Sharing & Collaboration',
    body: 'When you invite collaborators to your cashbook (Pro and Business plans), those collaborators can view and edit entries within the shared book according to the permissions you grant.\n\nYou control who has access to your books and can revoke access at any time from the Manage Access settings.',
  },
  {
    title: 'Data Retention',
    body: 'We retain your account and financial data for as long as your account is active or as needed to provide services.\n\nIf you cancel your subscription, your data remains accessible until your billing period ends. Your data is never deleted automatically — you remain in full control.\n\nYou may request deletion of your account and all associated data by contacting our support team.',
  },
  {
    title: 'Your Rights',
    body: 'You have the right to:\n\n• Access the personal data we hold about you\n• Correct inaccurate or incomplete data\n• Request deletion of your personal data\n• Export your data in a portable format\n• Withdraw consent at any time\n\nTo exercise any of these rights, please contact us using the information below.',
  },
  {
    title: 'Cookies & Tracking',
    body: 'The Ultimate CashBook mobile app does not use cookies. We may collect anonymized usage analytics to improve app performance and user experience. These analytics do not identify you personally.',
  },
  {
    title: 'Children\'s Privacy',
    body: 'Our services are not directed to children under the age of 13. We do not knowingly collect personal information from children under 13. If you become aware that a child has provided us with personal information, please contact us immediately.',
  },
  {
    title: 'Changes to This Policy',
    body: 'We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date.\n\nYour continued use of the app after any changes constitutes your acceptance of the new Privacy Policy.',
  },
  {
    title: 'Contact Us',
    body: 'If you have any questions about this Privacy Policy or our data practices, please contact us at:\n\nEmail: support@ultimatecashbook.com\n\nWe will respond to your inquiry within 5 business days.',
  },
];

// ── Policy Section ────────────────────────────────────────────────────────────

function PolicySection({ title, body, isLast, C }) {
  return (
    <View style={{ marginBottom: isLast ? 0 : 20 }}>
      <Text style={[sectionStyles.title, { color: C.text, fontFamily: Font.bold }]}>{title}</Text>
      <Text style={[sectionStyles.body, { color: C.textMuted, fontFamily: Font.regular }]}>{body}</Text>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  title: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  body:  { fontSize: 13, lineHeight: 21 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const { C, isDark }  = useTheme();
  const s      = useMemo(() => makeStyles(C), [C]);

  return (
    <SafeAreaView applyTop style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={isDark ? C.background : C.primary} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)/settings')}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <BackIcon color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.content}
      >
        {/* Intro card */}
        <View style={[s.introCard, { backgroundColor: C.primaryLight, borderColor: C.primaryMid }]}>
          <Text style={[s.introTitle, { color: C.primary, fontFamily: Font.bold }]}>
            Your Privacy Matters
          </Text>
          <Text style={[s.introText, { color: C.textMuted, fontFamily: Font.regular }]}>
            Ultimate CashBook is committed to protecting your personal and financial data.
            This policy explains what we collect, how we use it, and the choices you have.
          </Text>
          <Text style={[s.lastUpdated, { color: C.textSubtle, fontFamily: Font.medium }]}>
            Last updated: May 23, 2025
          </Text>
        </View>

        {/* Policy sections */}
        <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
          {SECTIONS.map((section, idx) => (
            <View key={section.title}>
              <PolicySection
                title={section.title}
                body={section.body}
                isLast={idx === SECTIONS.length - 1}
                C={C}
              />
              {idx < SECTIONS.length - 1 && (
                <View style={[s.divider, { backgroundColor: C.border }]} />
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeStyles = (C) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },

  header: {
    backgroundColor: C.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: Font.bold, color: '#fff' },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 48 },

  introCard: {
    borderRadius: 16, borderWidth: 1,
    paddingHorizontal: 18, paddingVertical: 18,
    marginBottom: 16,
  },
  introTitle:   { fontSize: 15, marginBottom: 8 },
  introText:    { fontSize: 13, lineHeight: 20, marginBottom: 10 },
  lastUpdated:  { fontSize: 11 },

  card: {
    borderRadius: 16, borderWidth: 1,
    paddingHorizontal: 18, paddingVertical: 20,
  },
  divider: { height: 1, marginVertical: 18 },
});
