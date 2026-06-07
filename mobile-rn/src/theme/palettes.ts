export type ErpTheme = {
  bg: string
  surface: string
  surfaceMuted: string
  sidebar: string
  sidebarHover: string
  sidebarActive: string
  sidebarText: string
  sidebarTextMuted: string
  border: string
  borderLight: string
  text: string
  textMuted: string
  textSubtle: string
  primary: string
  primaryLight: string
  primarySoft: string
  primaryMuted: string
  accent: string
  success: string
  successSoft: string
  warning: string
  warningSoft: string
  danger: string
  dangerSoft: string
  shadow: {
    shadowColor: string
    shadowOffset: { width: number; height: number }
    shadowOpacity: number
    shadowRadius: number
    elevation: number
  }
  shadowSm: {
    shadowColor: string
    shadowOffset: { width: number; height: number }
    shadowOpacity: number
    shadowRadius: number
    elevation: number
  }
  radius: { sm: number; md: number; lg: number; xl: number }
  space: { xs: number; sm: number; md: number; lg: number; xl: number }
}

export type JcTheme = {
  bg: string
  bgGradientTop: string
  bgGradientMid: string
  bgGradientBottom: string
  surface: string
  surfaceMuted: string
  surfaceElevated: string
  border: string
  borderFocus: string
  text: string
  textMuted: string
  textSubtle: string
  primary: string
  primaryDark: string
  primarySoft: string
  primaryMuted: string
  accentTeal: string
  accentOrange: string
  accentPurple: string
  accentGreen: string
  success: string
  successSoft: string
  warning: string
  warningSoft: string
  danger: string
  dangerSoft: string
  shadow: ErpTheme['shadow']
  shadowSm: ErpTheme['shadowSm']
  radius: { sm: number; md: number; lg: number; xl: number; xxl: number }
  space: { xs: number; sm: number; md: number; lg: number; xl: number }
}

export type ThemeMode = 'light' | 'dark'
/** User choice in Settings; `system` follows the device appearance. */
export type ThemePreference = ThemeMode | 'system'

export const lightErp: ErpTheme = {
  bg: '#f8fafc',
  surface: '#ffffff',
  surfaceMuted: '#f1f5f9',
  sidebar: '#0f172a',
  sidebarHover: '#1e293b',
  sidebarActive: '#1d4ed8',
  sidebarText: '#e2e8f0',
  sidebarTextMuted: '#94a3b8',
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  text: '#0f172a',
  textMuted: '#64748b',
  textSubtle: '#94a3b8',
  primary: '#0284c7',
  primaryLight: '#38bdf8',
  primarySoft: '#e0f2fe',
  primaryMuted: '#bae6fd',
  accent: '#0ea5e9',
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
  radius: { sm: 8, md: 12, lg: 16, xl: 20 },
  space: { xs: 6, sm: 10, md: 14, lg: 18, xl: 24 }
}

export const darkErp: ErpTheme = {
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceMuted: '#334155',
  sidebar: '#020617',
  sidebarHover: '#1e293b',
  sidebarActive: '#2563eb',
  sidebarText: '#e2e8f0',
  sidebarTextMuted: '#94a3b8',
  border: '#334155',
  borderLight: '#1e293b',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  textSubtle: '#64748b',
  primary: '#38bdf8',
  primaryLight: '#7dd3fc',
  primarySoft: '#0c4a6e',
  primaryMuted: '#1e40af',
  accent: '#0ea5e9',
  success: '#22c55e',
  successSoft: '#14532d',
  warning: '#fbbf24',
  warningSoft: '#78350f',
  danger: '#f87171',
  dangerSoft: '#7f1d1d',
  shadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4
  },
  shadowSm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 2
  },
  radius: { sm: 8, md: 12, lg: 16, xl: 20 },
  space: { xs: 6, sm: 10, md: 14, lg: 18, xl: 24 }
}

export const lightJc: JcTheme = {
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
  shadow: lightErp.shadow,
  shadowSm: lightErp.shadowSm,
  radius: { sm: 10, md: 12, lg: 16, xl: 20, xxl: 24 },
  space: { xs: 6, sm: 10, md: 14, lg: 18, xl: 24 }
}

export const darkJc: JcTheme = {
  bg: '#0f172a',
  bgGradientTop: '#0f172a',
  bgGradientMid: '#1e293b',
  bgGradientBottom: '#334155',
  surface: '#1e293b',
  surfaceMuted: '#334155',
  surfaceElevated: '#334155',
  border: '#475569',
  borderFocus: '#38bdf8',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  textSubtle: '#64748b',
  primary: '#3b82f6',
  primaryDark: '#93c5fd',
  primarySoft: '#1e3a5f',
  primaryMuted: '#1e40af',
  accentTeal: '#2dd4bf',
  accentOrange: '#fb923c',
  accentPurple: '#a78bfa',
  accentGreen: '#22c55e',
  success: '#22c55e',
  successSoft: '#14532d',
  warning: '#fbbf24',
  warningSoft: '#78350f',
  danger: '#f87171',
  dangerSoft: '#7f1d1d',
  shadow: darkErp.shadow,
  shadowSm: darkErp.shadowSm,
  radius: { sm: 10, md: 12, lg: 16, xl: 20, xxl: 24 },
  space: { xs: 6, sm: 10, md: 14, lg: 18, xl: 24 }
}

export function resolveThemes(mode: ThemeMode): { erp: ErpTheme; jc: JcTheme; isDark: boolean } {
  const isDark = mode === 'dark'
  return {
    erp: isDark ? darkErp : lightErp,
    jc: isDark ? darkJc : lightJc,
    isDark
  }
}

export function resolveColorScheme(
  preference: ThemePreference,
  systemScheme: ThemeMode
): ThemeMode {
  return preference === 'system' ? systemScheme : preference
}
