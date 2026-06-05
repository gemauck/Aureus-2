import AsyncStorage from '@react-native-async-storage/async-storage'
import { API_BASE_URL } from '../config'
import type {
  ProjectFilterKey,
  ProjectStatusFilter,
  ProjectSummary,
  ProjectTask,
  TaskFilterStatus
} from './types'

const STARRED_KEY = 'projects.starredProjectIds'

export function projectTasks(project: { tasks?: ProjectTask[]; tasksList?: ProjectTask[] }) {
  const list = project.tasksList || project.tasks || []
  return Array.isArray(list) ? list : []
}

export function formatDate(value?: string | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(value?: string | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function formatDateRange(start?: string, end?: string) {
  const s = formatDate(start)
  const e = formatDate(end)
  if (s && e) return `${s} – ${e}`
  return s || e || ''
}

export function statusColor(status?: string) {
  const s = String(status || '').toLowerCase()
  if (s === 'active' || s === 'in progress') return erpPrimary()
  if (s === 'completed' || s === 'done') return '#16a34a'
  if (s === 'on hold' || s === 'blocked') return '#64748b'
  if (s === 'cancelled') return '#dc2626'
  if (s === 'to do') return '#6366f1'
  return '#0284c7'
}

function erpPrimary() {
  return '#0284c7'
}

export function priorityColor(priority?: string) {
  const p = String(priority || '').toLowerCase()
  if (p === 'high' || p === 'urgent') return '#dc2626'
  if (p === 'medium') return '#d97706'
  if (p === 'low') return '#64748b'
  return '#6366f1'
}

export function progressPercent(project: ProjectSummary) {
  const raw = project.progress
  if (raw != null && !Number.isNaN(Number(raw))) {
    return Math.min(100, Math.max(0, Math.round(Number(raw))))
  }
  const s = project.status || ''
  if (s === 'Completed') return 100
  if (s === 'Active') return 68
  if (s === 'In Progress') return 45
  if (s === 'On Hold') return 18
  return 35
}

export function uniqueClients(projects: ProjectSummary[]): Array<{ id: string; name: string } | 'all'> {
  const map = new Map<string, string>()
  for (const p of projects) {
    const name = String(p.clientName || '').trim()
    const id = p.clientId || name
    if (name) map.set(id, name)
  }
  return ['all', ...Array.from(map.entries()).map(([id, name]) => ({ id, name }))]
}

export function filterProjects(
  items: ProjectSummary[],
  query: string,
  filter: ProjectFilterKey,
  status: ProjectStatusFilter,
  clientId: string,
  starredIds: Set<string>
) {
  const q = query.trim().toLowerCase()
  return items.filter((item) => {
    if (filter === 'starred' && !starredIds.has(item.id)) return false
    if (filter === 'active') {
      const st = String(item.status || '').toLowerCase()
      if (st && st !== 'active' && st !== 'in progress') return false
    }
    if (status !== 'all' && String(item.status || '') !== status) return false
    if (clientId && clientId !== 'all') {
      const cid = item.clientId || item.clientName || ''
      if (cid !== clientId && item.clientName !== clientId) return false
    }
    if (!q) return true
    const hay = [item.name, item.clientName, item.status, item.type, item.assignedTo]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

export function filterTasks(
  tasks: ProjectTask[],
  query: string,
  status: TaskFilterStatus,
  projectId: string
) {
  const q = query.trim().toLowerCase()
  return tasks.filter((t) => {
    if (status !== 'all' && String(t.status || '') !== status) return false
    if (projectId && projectId !== 'all' && t.projectId !== projectId && t.project?.id !== projectId)
      return false
    if (!q) return true
    const hay = [
      t.title,
      t.status,
      t.assignee,
      t.project?.name,
      t.project?.clientName
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

export async function loadStarredIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(STARRED_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.map(String) : [])
  } catch {
    return new Set()
  }
}

export async function saveStarredIds(ids: Set<string>) {
  await AsyncStorage.setItem(STARRED_KEY, JSON.stringify([...ids]))
}

export async function toggleStarred(id: string): Promise<Set<string>> {
  const ids = await loadStarredIds()
  if (ids.has(id)) ids.delete(id)
  else ids.add(id)
  await saveStarredIds(ids)
  return ids
}

export function webProjectUrl(projectId: string, tab?: string) {
  const base = `${API_BASE_URL}/#/projects/${encodeURIComponent(projectId)}`
  if (!tab) return base
  return `${base}?tab=${encodeURIComponent(tab)}`
}

export function enabledProcesses(project: ProjectSummary) {
  const items: { id: string; label: string; icon: string; tab: string; description: string }[] = []
  if (project.hasTimeProcess) {
    items.push({
      id: 'time',
      label: 'Time tracking',
      icon: 'clock',
      tab: 'time',
      description: 'Log hours and time entries'
    })
  }
  if (project.hasDocumentCollectionProcess) {
    items.push({
      id: 'documentCollection',
      label: 'Document collection',
      icon: 'folder-open',
      tab: 'documentCollection',
      description: 'Monthly document tracker'
    })
  }
  if (project.hasWeeklyFMSReviewProcess) {
    items.push({
      id: 'weeklyFMSReview',
      label: 'Weekly FMS review',
      icon: 'calendar-week',
      tab: 'weeklyFMSReview',
      description: 'Weekly review grid'
    })
  }
  if (project.hasMonthlyFMSReviewProcess) {
    items.push({
      id: 'monthlyFMSReview',
      label: 'Monthly FMS review',
      icon: 'calendar-alt',
      tab: 'monthlyFMSReview',
      description: 'Monthly FMS tracker'
    })
  }
  if (project.hasMonthlyDataReviewProcess) {
    items.push({
      id: 'monthlyDataReview',
      label: 'Monthly data review',
      icon: 'table',
      tab: 'monthlyDataReview',
      description: 'Data review checklist'
    })
  }
  if (project.hasComplianceReviewProcess) {
    items.push({
      id: 'complianceReview',
      label: 'Compliance review',
      icon: 'shield-alt',
      tab: 'complianceReview',
      description: 'Compliance checklist'
    })
  }
  return items
}

export const TASK_STATUSES = ['To Do', 'In Progress', 'Done', 'Blocked', 'Archived'] as const
export const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const

export const PROJECT_STATUSES: ProjectStatusFilter[] = [
  'all',
  'Active',
  'In Progress',
  'Completed',
  'On Hold',
  'Cancelled'
]
