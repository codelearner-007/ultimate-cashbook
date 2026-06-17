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

// ── Terms of Service / EULA content ─────────────────────────────────────────────

const SECTIONS = [
  {
    title: 'Acceptance of Terms',
    body: 'By creating an account or using Ultimate CashBook ("the App"), you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree, do not use the App.\n\nThese Terms form a binding agreement between you and Ultimate CashBook. You must be at least 13 years old (or the minimum age of digital consent in your country) to use the App.',
  },
  {
    title: 'License to Use the App',
    body: 'We grant you a personal, limited, non-exclusive, non-transferable, revocable license to use the App for your own personal or business bookkeeping.\n\nYou may not:\n\n• Copy, modify, reverse-engineer, or decompile the App\n• Resell, sublicense, or redistribute the App\n• Use the App for any unlawful purpose or in violation of these Terms',
  },
  {
    title: 'Your Account',
    body: 'You are responsible for safeguarding access to your account and for all activity that occurs under it. Sign-in is handled through Google or a one-time email code.\n\nKeep your device and email secure. Notify us immediately if you suspect unauthorized access to your account.',
  },
  {
    title: 'Subscriptions, Billing & Renewal',
    body: 'Ultimate CashBook offers free and paid (Pro, Business) plans. Paid plans are sold as auto-renewing subscriptions through the Apple App Store or Google Play.\n\n• Payment is charged to your App Store or Google Play account at confirmation of purchase.\n• Subscriptions renew automatically for the same period and price unless auto-renew is turned off at least 24 hours before the end of the current period.\n• Your account is charged for renewal within 24 hours before the end of the current period.\n• You can manage or cancel your subscription anytime in your App Store or Google Play account settings. Deleting the App does not cancel a subscription.\n• Prices are shown in the App before purchase and may vary by region and over time.\n• Except where required by law, payments are non-refundable; partial-period refunds are handled by Apple or Google under their policies.',
  },
  {
    title: 'Your Data & Content',
    body: 'You own the financial records and content you enter. The App is local-first: your data lives on your device, and paid plans additionally sync it to secure cloud storage.\n\nYou are responsible for the accuracy of the data you enter and for keeping your own backups. You grant us the limited right to store and process your content solely to provide the service to you.',
  },
  {
    title: 'Acceptable Use',
    body: 'You agree not to use the App to:\n\n• Store or transmit unlawful, infringing, or fraudulent content\n• Attempt to gain unauthorized access to our systems or other users\' data\n• Interfere with or disrupt the integrity or performance of the service\n• Abuse, harass, or harm other users in shared books',
  },
  {
    title: 'Not Financial Advice',
    body: 'Ultimate CashBook is a record-keeping tool. It does not provide accounting, tax, legal, or financial advice. You are solely responsible for the financial decisions you make and for complying with your local tax and accounting obligations. Consult a qualified professional where appropriate.',
  },
  {
    title: 'Disclaimer of Warranties',
    body: 'The App is provided "as is" and "as available" without warranties of any kind, whether express or implied, including fitness for a particular purpose and non-infringement. We do not warrant that the App will be uninterrupted, error-free, or that data will never be lost.',
  },
  {
    title: 'Limitation of Liability',
    body: 'To the maximum extent permitted by law, Ultimate CashBook and its developers shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of data, profits, or revenue, arising from your use of the App.\n\nOur total liability for any claim relating to the App shall not exceed the amount you paid us in the 12 months before the claim.',
  },
  {
    title: 'Termination',
    body: 'You may stop using the App and delete your account at any time from Settings → Delete Account, which permanently erases your account and associated data.\n\nWe may suspend or terminate access if you violate these Terms or use the App in a way that harms other users or our systems.',
  },
  {
    title: 'Changes to These Terms',
    body: 'We may update these Terms from time to time. We will post the updated Terms in the App and revise the "Last Updated" date. Your continued use of the App after changes take effect constitutes acceptance of the revised Terms.',
  },
  {
    title: 'Contact Us',
    body: 'If you have questions about these Terms, contact us at:\n\nEmail: support@ultimatecashbook.com\n\nWe aim to respond within 5 business days.',
  },
];

// ── Terms Section ────────────────────────────────────────────────────────────

function TermsSection({ title, body, isLast, C }) {
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

export default function TermsScreen() {
  const router = useRouter();
  const { C, isDark } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

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
        <Text style={s.headerTitle}>Terms of Service</Text>
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
            Terms of Service & EULA
          </Text>
          <Text style={[s.introText, { color: C.textMuted, fontFamily: Font.regular }]}>
            These terms govern your use of Ultimate CashBook, including subscriptions
            and the data you store. Please read them carefully.
          </Text>
          <Text style={[s.lastUpdated, { color: C.textSubtle, fontFamily: Font.medium }]}>
            Last updated: June 13, 2026
          </Text>
        </View>

        {/* Sections */}
        <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
          {SECTIONS.map((section, idx) => (
            <View key={section.title}>
              <TermsSection
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
