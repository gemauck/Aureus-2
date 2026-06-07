import type { UserTask } from './types'

export const USER_TASK_STATUSES = [
  { value: 'todo', label: 'To do' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' }
] as const

export const USER_TASK_PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' }
] as const

export function normalizeUserTaskStatus(status?: string) {
  const s = String(status || 'todo').toLowerCase().replace(/\s+/g, '-')
  if (s === 'done' || s === 'complete') return 'completed'
  if (s === 'inprogress') return 'in-progress'
  return s
}

export function userTaskStatusLabel(status?: string) {
  const v = normalizeUserTaskStatus(status)
  return USER_TASK_STATUSES.find((s) => s.value === v)?.label || status || 'To do'
}

export function userTaskPriorityLabel(priority?: string) {
  const p = String(priority || 'medium').toLowerCase()
  return USER_TASK_PRIORITIES.find((x) => x.value === p)?.label || priority || 'Medium'
}

export function isUserTaskOverdue(task: Pick<UserTask, 'dueDate' | 'status'>) {
  if (!task.dueDate) return false
  const st = normalizeUserTaskStatus(task.status)
  if (st === 'completed' || st === 'cancelled') return false
  const due = new Date(task.dueDate)
  if (Number.isNaN(due.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  return due < today
}

export function formatDueLabel(dueDate?: string | null) {
  if (!dueDate) return null
  const due = new Date(dueDate)
  if (Number.isNaN(due.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000)
  if (diffDays < 0) return 'Overdue'
  if (diffDays === 0) return 'Due today'
  if (diffDays === 1) return 'Due tomorrow'
  if (diffDays <= 7) return `Due in ${diffDays} days`
  return due.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
}

export function isArchivedProjectTask(status?: string) {
  return String(status || '').toLowerCase().replace(/\s+/g, '') === 'archived'
}
