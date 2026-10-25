/**
 * Design tokens. Every colour, size and duration used by components comes from here.
 * See docs/UI_UX_DESIGN.md §2 for the rationale.
 */
export const colors = {
  bg: '#0A0A0C',
  surface: '#141418',
  surfaceRaised: '#1C1C22',
  surfacePressed: '#24242B',
  glass: 'rgba(16,16,20,0.62)',
  glassStrong: 'rgba(12,12,15,0.82)',
  scrim: 'rgba(0,0,0,0.55)',
  hairline: 'rgba(255,255,255,0.10)',
  hairlineStrong: 'rgba(255,255,255,0.18)',
  text: '#F5F5F7',
  textSecondary: 'rgba(235,235,245,0.64)',
  textTertiary: 'rgba(235,235,245,0.38)',
  accent: '#FFC861',
  accentMuted: 'rgba(255,200,97,0.16)',
  accentText: '#1A1406',
  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#F87171',
  dangerMuted: 'rgba(248,113,113,0.14)',
  overlayFigure: '#FFFFFF',
  white: '#FFFFFF',
  black: '#000000',
} as const;

/** Distinct, low-saturation tints so people in couple/group poses are distinguishable. */
export const figureTints = ['#FFFFFF', '#FFD9A0', '#A9D8FF', '#C9F2C7'] as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const typography = {
  label: { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 1.1 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: 0.1 },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400', letterSpacing: 0.1 },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600', letterSpacing: 0.1 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: 0.1 },
  headline: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.2 },
  display: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.6 },
} as const;

export type TypographyVariant = keyof typeof typography;

export const motion = {
  fast: 120,
  base: 220,
  slow: 360,
  spring: { damping: 18, stiffness: 220, mass: 1 },
  softSpring: { damping: 22, stiffness: 140, mass: 1 },
} as const;

export const touchTarget = 44;

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  floating: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },
} as const;
