import AsyncStorage from '@react-native-async-storage/async-storage'
import { API_BASE_URL } from '../config'
import type {
  ClientProjectGroup,
  DocCollectionSummary,
  DocumentSectionsJson,
  DriveLink,
  ProjectActivityEntry,
  ProjectFilterKey,
  ProjectInsights,
  ProjectSortKey,
  ProjectStatusFilter,
  ProjectSummary,
  ProjectTask,
  TaskFilterStatus,
  TaskScopeFilter
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

export function formatRelative(value?: string | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return formatDate(value)
  const diffMs = Date.now() - d.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(value)
}

export function formatDateRange(start?: string, end?: string) {
  const s = formatDate(start)
  const e = formatDate(end)
  if (s && e) return `${s} – ${e}`
  return s || e || ''
}

export function statusColor(status?: string) {
  const s = String(status || '').toLowerCase()
  if (s === 'active' || s === 'in progress') return '#0284c7'
  if (s === 'completed' || s === 'done') return '#16a34a'
  if (s === 'on hold' || s === 'blocked') return '#64748b'
  if (s === 'cancelled') return '#dc2626'
  if (s === 'to do') return '#6366f1'
  return '#0284c7'
}

export function listColor(color?: string) {
  const map: Record<string, string> = {
    blue: '#0284c7',
    green: '#16a34a',
    red: '#dc2626',
    yellow: '#d97706',
    purple: '#7c3aed',
    pink: '#db2777',
    gray: '#64748b'
  }
  return map[String(color || 'blue').toLowerCase()] || map.blue
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

export function normalizeTaskStatus(status?: string) {
  const s = String(status || '').toLowerCase().trim()
  if (s === 'todo' || s === 'to do') return 'To Do'
  if (s === 'in progress' || s === 'in_progress') return 'In Progress'
  if (s === 'done' || s === 'complete' || s === 'completed') return 'Done'
  if (s === 'blocked') return 'Blocked'
  if (s === 'archived') return 'Archived'
  return status || 'To Do'
}

export function isTaskDone(status?: string) {
  const s = normalizeTaskStatus(status).toLowerCase()
  return s === 'done' || s === 'archived'
}

export function isTaskOverdue(task: ProjectTask) {
  if (!task.dueDate || isTaskDone(task.status)) return false
  const due = new Date(task.dueDate)
  if (Number.isNaN(due.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  return due < today
}

export function isTaskDueSoon(task: ProjectTask, withinDays = 3) {
  if (!task.dueDate || isTaskDone(task.status) || isTaskOverdue(task)) return false
  const due = new Date(task.dueDate)
  if (Number.isNaN(due.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  const diff = (due.getTime() - today.getTime()) / 86400000
  return diff >= 0 && diff <= withinDays
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

export function sortProjects(items: ProjectSummary[], sortKey: ProjectSortKey) {
  const copy = [...items]
  copy.sort((a, b) => {
    if (sortKey === 'client') {
      return String(a.clientName || '').localeCompare(String(b.clientName || '')) ||
        String(a.name || '').localeCompare(String(b.name || ''))
    }
    if (sortKey === 'updated') {
      return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
    }
    if (sortKey === 'due') {
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
      return ad - bd
    }
    return String(a.name || '').localeCompare(String(b.name || ''))
  })
  return copy
}

export function groupProjectsByClient(projects: ProjectSummary[]): ClientProjectGroup[] {
  const map = new Map<string, ClientProjectGroup>()
  for (const p of projects) {
    const clientName = String(p.clientName || 'No client').trim() || 'No client'
    const clientKey = p.clientId || clientName
    if (!map.has(clientKey)) {
      map.set(clientKey, { clientKey, clientName, projects: [] })
    }
    map.get(clientKey)!.projects.push(p)
  }
  return Array.from(map.values()).sort((a, b) => a.clientName.localeCompare(b.clientName))
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
  projectId: string,
  scope: TaskScopeFilter,
  userId?: string
) {
  const q = query.trim().toLowerCase()
  return tasks.filter((t) => {
    const norm = normalizeTaskStatus(t.status)
    if (status !== 'all' && norm !== status && String(t.status || '') !== status) return false
    if (projectId && projectId !== 'all' && t.projectId !== projectId && t.project?.id !== projectId)
      return false
    if (scope === 'mine' && userId && t.assigneeId !== userId) return false
    if (scope === 'overdue' && !isTaskOverdue(t)) return false
    if (scope === 'dueSoon' && !isTaskDueSoon(t)) return false
    if (!q) return true
    const hay = [t.title, t.status, t.assignee, t.project?.name, t.project?.clientName]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

export function computeInsights(
  projects: ProjectSummary[],
  tasks: ProjectTask[],
  starredIds: Set<string>,
  userId?: string
): ProjectInsights {
  const activeProjects = projects.filter((p) => {
    const st = String(p.status || '').toLowerCase()
    return st === 'active' || st === 'in progress'
  }).length
  const openTasks = tasks.filter((t) => !isTaskDone(t.status))
  const myOpenTasks = userId
    ? openTasks.filter((t) => t.assigneeId === userId).length
    : openTasks.length
  return {
    totalProjects: projects.length,
    activeProjects,
    starredCount: starredIds.size,
    totalTasks: tasks.length,
    myOpenTasks,
    overdueTasks: tasks.filter(isTaskOverdue).length,
    dueSoonTasks: tasks.filter((t) => isTaskDueSoon(t)).length
  }
}

export function groupTasksByStatus(tasks: ProjectTask[]) {
  const columns: Record<string, ProjectTask[]> = {}
  for (const st of KANBAN_COLUMNS) columns[st] = []
  for (const t of tasks) {
    const key = normalizeTaskStatus(t.status)
    if (!columns[key]) columns[key] = []
    columns[key].push(t)
  }
  return KANBAN_COLUMNS.map((status) => ({ status, tasks: columns[status] || [] }))
}

export function groupTasksByList(
  tasks: ProjectTask[],
  taskLists: Array<{ listId?: number; id?: string; name?: string; color?: string }>
) {
  const lists = taskLists.length
    ? taskLists
    : [{ listId: 1, name: 'To Do', color: 'blue' }]
  const groups = lists.map((list) => {
    const lid = list.listId ?? list.id
    const matched = tasks.filter((t) => {
      if (t.listId == null) return String(lid) === '1' || lid === 1
      return String(t.listId) === String(lid)
    })
    return {
      listId: String(lid),
      name: list.name || 'List',
      color: list.color,
      tasks: matched
    }
  })
  const known = new Set(lists.map((l) => String(l.listId ?? l.id)))
  const unassigned = tasks.filter((t) => {
    if (t.listId == null) return !known.has('1')
    return !known.has(String(t.listId))
  })
  if (unassigned.length) {
    groups.push({ listId: 'other', name: 'Other', color: 'gray', tasks: unassigned })
  }
  return groups
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
  const items: { id: string; label: string; icon: string; tab: string; description: string; purpose: string }[] = []
  if (project.hasTimeProcess) {
    items.push({
      id: 'time',
      label: 'Time tracking',
      icon: 'clock',
      tab: 'time',
      description: 'Log billable hours against this project',
      purpose: 'Track who worked what hours for invoicing and utilisation.'
    })
  }
  if (project.hasDocumentCollectionProcess) {
    items.push({
      id: 'documentCollection',
      label: 'Document collection',
      icon: 'folder-open',
      tab: 'documentCollection',
      description: 'Monthly document checklist per client',
      purpose: 'Chase and record client documents by month — diesel refunds, FMS, etc.'
    })
  }
  if (project.hasWeeklyFMSReviewProcess) {
    items.push({
      id: 'weeklyFMSReview',
      label: 'Weekly FMS review',
      icon: 'calendar-week',
      tab: 'weeklyFMSReview',
      description: 'Weekly fleet management review grid',
      purpose: 'Review weekly FMS items, statuses, and comments with the client.'
    })
  }
  if (project.hasMonthlyFMSReviewProcess) {
    items.push({
      id: 'monthlyFMSReview',
      label: 'Monthly FMS review',
      icon: 'calendar-alt',
      tab: 'monthlyFMSReview',
      description: 'Monthly FMS compliance tracker',
      purpose: 'Monthly roll-up of FMS review items and sign-off.'
    })
  }
  if (project.hasMonthlyDataReviewProcess) {
    items.push({
      id: 'monthlyDataReview',
      label: 'Monthly data review',
      icon: 'table',
      tab: 'monthlyDataReview',
      description: 'Production / data review checklist',
      purpose: 'Validate monthly operational data submitted by the client.'
    })
  }
  if (project.hasComplianceReviewProcess) {
    items.push({
      id: 'complianceReview',
      label: 'Compliance review',
      icon: 'shield-alt',
      tab: 'complianceReview',
      description: 'Regulatory compliance checklist',
      purpose: 'Track compliance documents and review steps.'
    })
  }
  return items
}

export function parseDriveLinks(project: ProjectSummary): DriveLink[] {
  const links: DriveLink[] = []
  if (project.googleDriveLink?.trim()) {
    links.push({ label: 'Google Drive', url: project.googleDriveLink.trim() })
  }
  if (project.onlineDriveLinks) {
    try {
      const raw =
        typeof project.onlineDriveLinks === 'string'
          ? JSON.parse(project.onlineDriveLinks)
          : project.onlineDriveLinks
      if (Array.isArray(raw)) {
        for (const item of raw) {
          if (typeof item === 'string' && item.trim()) {
            links.push({ label: 'Drive link', url: item.trim() })
          } else if (item && typeof item === 'object') {
            const url = String((item as { url?: string }).url || '').trim()
            const label = String((item as { name?: string; label?: string }).name ||
              (item as { label?: string }).label || 'Drive link')
            if (url) links.push({ label, url })
          }
        }
      }
    } catch {
      /* ignore malformed JSON */
    }
  }
  return links
}

export function summarizeDocumentCollection(sections?: DocumentSectionsJson | null): DocCollectionSummary | null {
  if (!sections || typeof sections !== 'object') return null
  const now = new Date()
  const year = String(now.getFullYear())
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const monthKey = `${year}-${month}`
  const monthLabel = now.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })

  let collected = 0
  let pending = 0
  let other = 0

  const yearSections = sections[year] || sections[String(Number(year))] || []
  for (const section of yearSections) {
    for (const doc of section.documents || []) {
      const status = doc.collectionStatus?.[monthKey]
      if (!status) {
        pending += 1
        continue
      }
      const s = String(status).toLowerCase()
      if (s === 'collected' || s === 'received' || s === 'complete' || s === 'done') collected += 1
      else if (s === 'pending' || s === 'requested' || s === 'not received') pending += 1
      else other += 1
    }
  }

  const totalCells = collected + pending + other
  if (totalCells === 0) return null
  return { year, monthKey, monthLabel, totalCells, collected, pending, other }
}

export function activityIcon(type?: string) {
  const t = String(type || '').toLowerCase()
  if (t.includes('task')) return 'tasks'
  if (t.includes('note')) return 'sticky-note'
  if (t.includes('document') || t.includes('collection')) return 'folder-open'
  if (t.includes('comment')) return 'comment'
  if (t.includes('status') || t.includes('fms')) return 'exchange-alt'
  if (t.includes('team') || t.includes('member')) return 'user-plus'
  return 'history'
}

export function activityCategory(entry: ProjectActivityEntry) {
  const t = String(entry.type || '').toLowerCase()
  if (t.includes('task')) return 'Tasks'
  if (t.includes('note')) return 'Notes'
  if (t.includes('document') || t.includes('collection') || t.includes('fms')) return 'Trackers'
  if (t.includes('comment')) return 'Comments'
  return 'General'
}

export function stripHtml(html?: string) {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export const TASK_STATUSES = ['To Do', 'In Progress', 'Done', 'Blocked', 'Archived'] as const
export const KANBAN_COLUMNS = ['To Do', 'In Progress', 'Done', 'Blocked'] as const
export const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const
export const PROJECT_STATUSES: ProjectStatusFilter[] = [
  'all',
  'Active',
  'In Progress',
  'Completed',
  'On Hold',
  'Cancelled'
]

export const PROJECT_STATUS_EDIT = ['Active', 'In Progress', 'Completed', 'On Hold', 'Cancelled'] as const

export function taskCompletionStats(tasks: ProjectTask[]) {
  const total = tasks.length
  const done = tasks.filter((t) => isTaskDone(t.status)).length
  const overdue = tasks.filter(isTaskOverdue).length
  const inProgress = tasks.filter((t) => normalizeTaskStatus(t.status) === 'In Progress').length
  return { total, done, overdue, inProgress, open: total - done }
}
