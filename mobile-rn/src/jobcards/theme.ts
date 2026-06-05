/** Bright, vivid visual tokens for native job cards. */
export const jc = {
  bg: '#fafcff',
  surface: '#ffffff',
  surfaceMuted: '#f4f8fc',
  border: '#e8f0f8',
  borderFocus: '#7dd3fc',
  text: '#334155',
  textMuted: '#64748b',
  textSubtle: '#94a3b8',
  primary: '#38bdf8',
  primaryDark: '#0ea5e9',
  primarySoft: '#f0f9ff',
  primaryMuted: '#e0f2fe',
  accentTeal: '#5eead4',
  accentOrange: '#fdba74',
  accentPurple: '#c4b5fd',
  accentGreen: '#86efac',
  success: '#4ade80',
  warning: '#fbbf24',
  danger: '#fca5a5',
  shadow: {
    shadowColor: '#94a3b8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 22
  },
  space: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24
  }
} as const

export const APP_VERSION = '0.3.4'
export const APP_VERSION_CODE = 8
