// Shadcn-inspired design tokens — cyan primary

export const LightColors = {
  // Brand
  primary:          '#39AAAA',          // teal-cyan
  primaryDark:      '#2B8080',          // darker teal
  primaryLight:     '#F4FAFA',          // barely-there teal — almost white
  primaryMid:       '#DFF0F0',          // very soft teal border

  // On-primary (text/icons sitting on top of a primary-colored surface)
  onPrimary:        '#FFFFFF',
  onPrimaryMuted:   'rgba(255,255,255,0.72)',
  onPrimarySubtle:  'rgba(255,255,255,0.45)',
  onPrimaryIconBg:  'rgba(255,255,255,0.20)',

  // Semantic
  cashIn:           '#15803D',          // green-700
  cashInLight:      '#DCFCE7',          // green-100
  cashOut:          '#B91C1C',          // red-700
  cashOutLight:     '#FEE2E2',          // red-100

  // Danger (red) — used for delete actions, destructive UI, cash out amounts
  danger:           '#B91C1C',          // red-700
  dangerLight:      '#FEE2E2',          // red-100

  // Surface
  background:       '#F8FAFC',          // slate-50
  card:             '#FFFFFF',
  cardAlt:          '#F1F5F9',          // slate-100

  // Text
  text:             '#0F172A',          // slate-900
  textMuted:        '#64748B',          // slate-500
  textSubtle:       '#94A3B8',          // slate-400

  // Structure
  border:           '#E2E8F0',          // slate-200
  borderFocus:      '#39AAAA',
  shadow:           '#000000',

  // Misc
  badge:            '#ECFEFF',
  overlay:          'rgba(0,0,0,0.45)',
  isDark:           false,
};

export const DarkColors = {
  // Brand
  primary:          '#4BBFBF',          // lighter teal for dark bg contrast
  primaryDark:      '#39AAAA',          // base teal
  primaryLight:     '#111111',          // near-black chip/badge bg
  primaryMid:       '#222222',          // subtle border on chips

  // On-primary (always white — primary surface is colored in both modes)
  onPrimary:        '#FFFFFF',
  onPrimaryMuted:   'rgba(255,255,255,0.65)',
  onPrimarySubtle:  'rgba(255,255,255,0.35)',
  onPrimaryIconBg:  'rgba(255,255,255,0.15)',

  // Semantic
  cashIn:           '#16A34A',          // green-600
  cashInLight:      '#052E16',          // green-950
  cashOut:          '#DC2626',          // red-600
  cashOutLight:     '#3B0000',          // near-black red tint

  // Danger (red) — used for delete actions, destructive UI, cash out amounts
  danger:           '#DC2626',          // red-600
  dangerLight:      '#3B0000',          // near-black red tint

  // Surface — true blacks
  background:       '#000000',          // pure black
  card:             '#0D0D0D',          // off-black card
  cardAlt:          '#161616',          // slightly lighter surface

  // Text
  text:             '#F5F5F5',          // near-white
  textMuted:        '#A0A0A0',          // mid grey
  textSubtle:       '#606060',          // dim grey

  // Structure
  border:           '#242424',          // very dark border
  borderFocus:      '#22D3EE',
  shadow:           '#000000',

  // Misc
  badge:            '#0D0D0D',
  overlay:          'rgba(0,0,0,0.75)',
  isDark:           true,
};

// Accent palette for book cards — lives here so screens import from theme, not inline
export const CARD_ACCENTS = ['#39AAAA', '#16A34A', '#7C3AED', '#D97706', '#DB2777'];

// Super-admin gold — intentionally fixed (not theme-adaptive) so the badge always reads as "special"
export const SUPER_ADMIN_GOLD = {
  text:       '#FCD34D',   // amber-300
  textDark:   '#D97706',   // amber-600 (readable on light bg)
  bg:         'rgba(251,191,36,0.22)',
  border:     'rgba(251,191,36,0.55)',
  dot:        '#FCD34D',
  spark:      ['#FCD34D', '#F59E0B', '#FDE68A', '#D97706'],
};

// Legacy alias — screens still on the old API keep working
export const Colors = LightColors;
