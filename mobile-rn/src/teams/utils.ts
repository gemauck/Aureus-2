import type { User } from '../types'
import type { Team, TeamTabId } from './types'

const ADMIN_ROLES = new Set([
  'admin',
  'administrator',
  'superadmin',
  'super-admin',
  'super_admin',
  'system_admin'
])

export const MEETING_DEPARTMENTS = [
  { id: 'management', name: 'David Buttemer' },
  { id: 'compliance', name: 'Compliance' },
  { id: 'finance', name: 'Finance' },
  { id: 'technical', name: 'Technical' },
  { id: 'data', name: 'Data & Analytics' },
  { id: 'support', name: 'Support' },
  { id: 'commercial', name: 'Commercial' },
  { id: 'business-development', name: 'Business Development' },
  { id: 'hr', name: 'HR' }
] as const

const SARS_MONITORING_TEAM_IDS = new Set(['compliance', 'finance', 'commercial'])

export function teamHasSarsMonitoring(teamId: string) {
  return SARS_MONITORING_TEAM_IDS.has(String(teamId || '').toLowerCase())
}

const TEAM_COLOR_MAP: Record<string, string> = {
  blue: '#3b82f6',
  green: '#22c55e',
  purple: '#8b5cf6',
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  pink: '#ec4899',
  indigo: '#6366f1',
  teal: '#14b8a6',
  gray: '#6b7280'
}

export function isAdminUser(user: User | null | undefined) {
  const role = String(user?.role || '').toLowerCase().replace(/[\s_-]/g, '')
  return ADMIN_ROLES.has(role) || role.includes('admin')
}

export function isManagementTeam(teamId: string) {
  return teamId === 'management'
}

export function isTeamAccessible(teamId: string, user: User | null | undefined) {
  if (isManagementTeam(teamId)) return isAdminUser(user)
  return true
}

export function teamAccentColor(team: Pick<Team, 'color'>) {
  const key = String(team.color || 'blue').toLowerCase()
  return TEAM_COLOR_MAP[key] || TEAM_COLOR_MAP.blue
}

export function teamIconName(icon?: string): string {
  const raw = String(icon || 'users').replace(/^fa[srb]?\s+fa-/, '').replace(/^fa-/, '')
  const map: Record<string, string> = {
    users: 'users',
    'user-friends': 'user-friends',
    cogs: 'cogs',
    'chart-line': 'chart-line',
    'dollar-sign': 'dollar-sign',
    handshake: 'handshake',
    'balance-scale': 'balance-scale',
    'user-tie': 'user-tie',
    'project-diagram': 'project-diagram',
    'shield-alt': 'shield-alt',
    database: 'database',
    wrench: 'wrench'
  }
  return map[raw] || raw || 'users'
}

export function getTeamTabs(teamId: string, user: User | null | undefined): TeamTabId[] {
  const tabs: TeamTabId[] = ['discussions', 'process-flows']
  if (isManagementTeam(teamId) && isAdminUser(user)) tabs.push('meeting-notes')
  if (teamId === 'data-analytics') {
    tabs.push('poa-review', 'dfrr-check')
  }
  if (teamHasSarsMonitoring(teamId)) tabs.push('sars-monitoring')
  if (isAdminUser(user)) tabs.push('members')
  return tabs
}

export function tabLabel(tab: TeamTabId): string {
  switch (tab) {
    case 'discussions':
      return 'Discussions'
    case 'process-flows':
      return 'Process flows'
    case 'meeting-notes':
      return 'Meeting notes'
    case 'poa-review':
      return 'POA Review'
    case 'dfrr-check':
      return 'DFRR Check'
    case 'sars-monitoring':
      return 'SARS Monitoring'
    case 'members':
      return 'Members'
    default:
      return tab
  }
}

export function formatRelative(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function stripHtml(html?: string) {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

export function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback
  if (typeof value === 'object') return value as T
  if (typeof value !== 'string' || !value.trim()) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
