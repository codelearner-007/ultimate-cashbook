import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../hooks/useTheme';

// Single shimmer bar — the building block for all skeleton screens
export function ShimmerBox({ width, height, borderRadius = 8, style }) {
  const { C, isDark } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 1100,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-300, 300],
  });

  const base = isDark ? '#2a2a2a' : '#E8EDF2';
  const shine = isDark
    ? ['#2a2a2a', '#3a3a3a', '#444', '#3a3a3a', '#2a2a2a']
    : ['#E8EDF2', '#F5F7FA', '#FFFFFF', '#F5F7FA', '#E8EDF2'];

  return (
    <View
      style={[
        { width, height, borderRadius, backgroundColor: base, overflow: 'hidden' },
        style,
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateX }] },
        ]}
      >
        <LinearGradient
          colors={shine}
          locations={[0, 0.3, 0.5, 0.7, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

// ─── Composed skeletons per screen ───────────────────────────────────────────

// Book card row (used in BooksView)
export function BookCardSkeleton() {
  const { C } = useTheme();
  return (
    <View style={[skeletonStyles.bookCard, { backgroundColor: C.card, borderColor: C.border }]}>
      <ShimmerBox width={46} height={46} borderRadius={23} />
      <View style={{ flex: 1, gap: 8 }}>
        <ShimmerBox width="70%" height={14} borderRadius={6} />
        <ShimmerBox width="45%" height={11} borderRadius={5} />
      </View>
      <ShimmerBox width={56} height={28} borderRadius={8} />
    </View>
  );
}

// Entry card row (used in BookDetailScreen & CategoryDetailScreen)
export function EntryCardSkeleton() {
  const { C } = useTheme();
  return (
    <View style={[skeletonStyles.entryCard, { borderBottomColor: C.border }]}>
      <ShimmerBox width={50} height={28} borderRadius={7} style={{ marginRight: 10 }} />
      <View style={{ flex: 1, gap: 7 }}>
        <ShimmerBox width="65%" height={13} borderRadius={5} />
        <ShimmerBox width="40%" height={10} borderRadius={4} />
      </View>
      <ShimmerBox width={62} height={13} borderRadius={5} />
    </View>
  );
}

// Date group header + 2 entry cards (used in BookDetailScreen)
export function EntryGroupSkeleton() {
  const { C } = useTheme();
  return (
    <View style={[skeletonStyles.group, { backgroundColor: C.card, borderColor: C.border }]}>
      <ShimmerBox width={90} height={11} borderRadius={4} style={{ marginBottom: 10, marginLeft: 14 }} />
      <EntryCardSkeleton />
      <EntryCardSkeleton />
    </View>
  );
}

// Balance card (used in BookDetailScreen)
export function BalanceCardSkeleton() {
  const { C } = useTheme();
  return (
    <View style={[skeletonStyles.balanceCard, { backgroundColor: C.card, borderColor: C.border }]}>
      <ShimmerBox width="40%" height={11} borderRadius={4} style={{ alignSelf: 'center' }} />
      <ShimmerBox width="60%" height={26} borderRadius={6} style={{ alignSelf: 'center', marginTop: 6 }} />
      <View style={[skeletonStyles.balanceDivider, { backgroundColor: C.border }]} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ alignItems: 'center', gap: 6 }}>
            <ShimmerBox width={44} height={10} borderRadius={4} />
            <ShimmerBox width={60} height={13} borderRadius={5} />
          </View>
        ))}
      </View>
    </View>
  );
}

// User row (used in AdminUsersScreen)
export function UserRowSkeleton() {
  const { C } = useTheme();
  return (
    <View style={[skeletonStyles.userRow, { backgroundColor: C.card, borderColor: C.border }]}>
      <ShimmerBox width={42} height={42} borderRadius={21} />
      <View style={{ flex: 1, gap: 8 }}>
        <ShimmerBox width="55%" height={14} borderRadius={5} />
        <ShimmerBox width="75%" height={11} borderRadius={4} />
      </View>
      <ShimmerBox width={44} height={24} borderRadius={12} />
    </View>
  );
}

// Profile card (used in ProfileScreen)
export function ProfileCardSkeleton() {
  const { C } = useTheme();
  return (
    <View style={{ gap: 16 }}>
      {/* Avatar card */}
      <View style={[skeletonStyles.profileCard, { backgroundColor: C.card, borderColor: C.border }]}>
        <ShimmerBox width={80} height={80} borderRadius={40} style={{ alignSelf: 'center', marginBottom: 12 }} />
        <ShimmerBox width={140} height={18} borderRadius={6} style={{ alignSelf: 'center', marginBottom: 8 }} />
        <ShimmerBox width={180} height={13} borderRadius={5} style={{ alignSelf: 'center' }} />
      </View>
      {/* Fields card */}
      <View style={[skeletonStyles.profileFields, { backgroundColor: C.card, borderColor: C.border }]}>
        {[0, 1, 2].map((i) => (
          <View key={i}>
            <View style={skeletonStyles.profileFieldRow}>
              <ShimmerBox width={70} height={10} borderRadius={4} />
              <ShimmerBox width={160} height={15} borderRadius={5} />
            </View>
            {i < 2 && <View style={[skeletonStyles.fieldDivider, { backgroundColor: C.border }]} />}
          </View>
        ))}
      </View>
    </View>
  );
}

// Entry detail (used in EntryDetailScreen)
export function EntryDetailSkeleton() {
  const { C } = useTheme();
  return (
    <View style={{ gap: 12, padding: 16 }}>
      {/* Amount card */}
      <View style={[skeletonStyles.detailAmountCard, { backgroundColor: C.card, borderColor: C.border }]}>
        <ShimmerBox width={80} height={26} borderRadius={13} style={{ alignSelf: 'center' }} />
        <ShimmerBox width="60%" height={40} borderRadius={8} style={{ alignSelf: 'center', marginTop: 8 }} />
        <ShimmerBox width="45%" height={13} borderRadius={5} style={{ alignSelf: 'center', marginTop: 8 }} />
      </View>
      {/* Detail rows card */}
      <View style={[skeletonStyles.detailRowsCard, { backgroundColor: C.card, borderColor: C.border }]}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i}>
            <View style={skeletonStyles.detailRow}>
              <ShimmerBox width={70} height={13} borderRadius={5} />
              <ShimmerBox width={130} height={14} borderRadius={5} />
            </View>
            {i < 3 && <View style={[skeletonStyles.fieldDivider, { backgroundColor: C.border }]} />}
          </View>
        ))}
      </View>
    </View>
  );
}

// Category summary + entry list (used in CategoryDetailScreen)
export function CategoryDetailSkeleton() {
  const { C } = useTheme();
  return (
    <View style={{ gap: 12, padding: 16 }}>
      {/* Summary card */}
      <View style={[skeletonStyles.summaryCard, { backgroundColor: C.card, borderColor: C.border }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ alignItems: 'center', gap: 6 }}>
              <ShimmerBox width={44} height={10} borderRadius={4} />
              <ShimmerBox width={60} height={15} borderRadius={5} />
            </View>
          ))}
        </View>
      </View>
      {/* Entry rows */}
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={[skeletonStyles.catEntryCard, { backgroundColor: C.card, borderColor: C.border }]}>
          <ShimmerBox width={3} height="100%" borderRadius={0} style={{ alignSelf: 'stretch' }} />
          <ShimmerBox width={48} height={28} borderRadius={7} style={{ marginHorizontal: 10 }} />
          <View style={{ flex: 1, gap: 7 }}>
            <ShimmerBox width="60%" height={13} borderRadius={5} />
            <ShimmerBox width="38%" height={10} borderRadius={4} />
          </View>
          <ShimmerBox width={60} height={13} borderRadius={5} style={{ marginRight: 12 }} />
        </View>
      ))}
    </View>
  );
}

// Reports screen (chart + entry rows)
export function ReportsSkeleton() {
  const { C } = useTheme();
  return (
    <View style={{ gap: 14 }}>
      {/* Chart card */}
      <View style={[skeletonStyles.chartCard, { backgroundColor: C.card, borderColor: C.border }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
          <ShimmerBox width={100} height={14} borderRadius={5} />
          <ShimmerBox width={60} height={11} borderRadius={4} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
          {[70, 45, 90, 55, 80, 35, 65].map((h, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <ShimmerBox width={36} height={h} borderRadius={8} />
              <ShimmerBox width={24} height={10} borderRadius={4} />
            </View>
          ))}
        </View>
      </View>
      {/* Entry rows */}
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={[skeletonStyles.reportEntryRow, { borderBottomColor: C.border }]}>
          <ShimmerBox width={30} height={30} borderRadius={8} />
          <View style={{ flex: 1, gap: 7, marginLeft: 10 }}>
            <ShimmerBox width="58%" height={13} borderRadius={5} />
            <ShimmerBox width="38%" height={10} borderRadius={4} />
          </View>
          <ShimmerBox width={64} height={14} borderRadius={5} />
        </View>
      ))}
    </View>
  );
}

// ─── Shared style values ──────────────────────────────────────────────────────

const skeletonStyles = StyleSheet.create({
  bookCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 50,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 14,
    borderWidth: 1.5,
    gap: 12,
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  group: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    paddingTop: 10,
  },
  balanceCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
    marginBottom: 12,
  },
  balanceDivider: {
    height: 1,
    marginVertical: 4,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 50,
    paddingVertical: 6,
    paddingRight: 10,
    paddingLeft: 6,
    borderWidth: 1.5,
    gap: 12,
  },
  profileCard: {
    marginHorizontal: 16,
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderWidth: 1,
    marginTop: 20,
  },
  profileFields: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  profileFieldRow: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 8,
  },
  fieldDivider: {
    height: 1,
    marginHorizontal: 18,
  },
  detailAmountCard: {
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
  },
  detailRowsCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  summaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  catEntryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    height: 58,
  },
  chartCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  reportEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
});
