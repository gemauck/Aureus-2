/** Shared ERP mobile shell theme — aligned with web MainLayout / dashboard. */
export const erp = {
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
} as const

export const COMPANY_NAME = 'Abcotronics'
