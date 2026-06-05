/** Job card wizard theme — aligned with web ERP JobCardFormPublic (slate + blue-600). */
export const jc = {
  bg: '#f8fafc',
  bgGradientTop: '#f8fafc',
  bgGradientMid: '#eff6ff',
  bgGradientBottom: '#e2e8f0',
  surface: '#ffffff',
  surfaceMuted: '#f1f5f9',
  surfaceElevated: '#ffffff',
  border: '#e2e8f0',
  borderFocus: '#93c5fd',
  text: '#0f172a',
  textMuted: '#64748b',
  textSubtle: '#94a3b8',
  primary: '#2563eb',
  primaryDark: '#1d4ed8',
  primarySoft: '#eff6ff',
  primaryMuted: '#dbeafe',
  accentTeal: '#0d9488',
  accentOrange: '#ea580c',
  accentPurple: '#7c3aed',
  accentGreen: '#16a34a',
  success: '#16a34a',
  successSoft: '#dcfce7',
  warning: '#d97706',
  warningSoft: '#fef3c7',
  danger: '#dc2626',
  dangerSoft: '#fee2e2',
  shadow: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4
  },
  shadowSm: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2
  },
  radius: {
    sm: 10,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24
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
