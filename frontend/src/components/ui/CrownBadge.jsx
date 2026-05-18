import { View, Text } from 'react-native';
import { Font } from '../../constants/fonts';

export const CROWN_COLORS = {
  pro:      '#F59E0B',
  business: '#7C3AED',
};

/**
 * Inline badge displayed next to features that require a paid tier.
 * tier: 'pro' | 'business'
 * size: font size for the crown glyph (default 12)
 */
export default function CrownBadge({ tier = 'pro', size = 12 }) {
  const color = CROWN_COLORS[tier] ?? CROWN_COLORS.pro;
  const label = tier === 'business' ? 'Business' : 'Pro';
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: color + '1A',
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 2,
      gap: 3,
    }}>
      <Text style={{ fontSize: size, lineHeight: size + 4, color }}>👑</Text>
      <Text style={{ fontSize: size - 1, color, fontFamily: Font.bold, letterSpacing: 0.2 }}>
        {label}
      </Text>
    </View>
  );
}
