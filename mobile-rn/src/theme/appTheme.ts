/** Shared ERP mobile shell theme — dark slate palette aligned with web ERP sidebar. */
export const erp = {
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
} as const

export const COMPANY_NAME = 'Abcotronics'
