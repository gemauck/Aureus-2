import type { CrmClient, CrmGroup, CrmLead } from '../crm/types'
import type { ProjectSummary, ProjectTask } from '../projects/types'
import type { DashboardNotification, DashboardTask, DashboardJobCard } from '../services/erpApi'
import { readListCache, writeListCache } from './readListCache'

const MY_TASKS_KEY = 'mobile_rn_my_tasks_cache_v1'
const PROJECTS_KEY = 'mobile_rn_projects_list_cache_v1'
const PROJECT_TASKS_KEY = 'mobile_rn_projects_tasks_cache_v1'
const CRM_CLIENTS_KEY = 'mobile_rn_crm_clients_cache_v1'
const CRM_LEADS_KEY = 'mobile_rn_crm_leads_cache_v1'
const CRM_GROUPS_KEY = 'mobile_rn_crm_groups_cache_v1'
const CRM_RECENT_KEY = 'mobile_rn_crm_recent_entities_v1'
const NOTIFICATIONS_KEY = 'mobile_rn_notifications_cache_v1'
const NOTIFICATIONS_UNREAD_KEY = 'mobile_rn_notifications_unread_v1'
const CHAT_UNREAD_KEY = 'mobile_rn_chat_unread_v1'
const MAX_RECENT_CRM = 30

export type CrmRecentEntry = { entityType: string; entityId: string; viewedAt: string }

export const cacheMyTasks = (tasks: DashboardTask[]) => writeListCache(MY_TASKS_KEY, tasks)
export const readCachedMyTasks = () => readListCache<DashboardTask[]>(MY_TASKS_KEY)

export const cacheProjectsList = (projects: ProjectSummary[]) =>
  writeListCache(PROJECTS_KEY, projects)
export const readCachedProjectsList = () => readListCache<ProjectSummary[]>(PROJECTS_KEY)

export const cacheProjectTasksList = (tasks: ProjectTask[]) =>
  writeListCache(PROJECT_TASKS_KEY, tasks)
export const readCachedProjectTasksList = () => readListCache<ProjectTask[]>(PROJECT_TASKS_KEY)

export const cacheCrmClients = (clients: CrmClient[]) => writeListCache(CRM_CLIENTS_KEY, clients)
export const readCachedCrmClients = () => readListCache<CrmClient[]>(CRM_CLIENTS_KEY)

export const cacheCrmLeads = (leads: CrmLead[]) => writeListCache(CRM_LEADS_KEY, leads)
export const readCachedCrmLeads = () => readListCache<CrmLead[]>(CRM_LEADS_KEY)

export const cacheCrmGroups = (groups: CrmGroup[]) => writeListCache(CRM_GROUPS_KEY, groups)
export const readCachedCrmGroups = () => readListCache<CrmGroup[]>(CRM_GROUPS_KEY)

export async function rememberRecentCrmEntity(entityType: string, entityId: string) {
  const id = String(entityId || '').trim()
  if (!id) return
  const type = String(entityType || 'client')
  const existing = (await readListCache<CrmRecentEntry[]>(CRM_RECENT_KEY)) || []
  const next = [
    { entityType: type, entityId: id, viewedAt: new Date().toISOString() },
    ...existing.filter((row) => !(row.entityType === type && row.entityId === id))
  ].slice(0, MAX_RECENT_CRM)
  await writeListCache(CRM_RECENT_KEY, next)
}

export const readRecentCrmEntities = () => readListCache<CrmRecentEntry[]>(CRM_RECENT_KEY)

export const cacheNotifications = (rows: DashboardNotification[]) =>
  writeListCache(NOTIFICATIONS_KEY, rows)
export const readCachedNotifications = () => readListCache<DashboardNotification[]>(NOTIFICATIONS_KEY)

export const cacheNotificationUnread = (count: number) =>
  writeListCache(NOTIFICATIONS_UNREAD_KEY, count)
export const readCachedNotificationUnread = async () => {
  const count = await readListCache<number>(NOTIFICATIONS_UNREAD_KEY)
  return typeof count === 'number' ? count : null
}

export const cacheChatUnread = (count: number) => writeListCache(CHAT_UNREAD_KEY, count)
export const readCachedChatUnread = async () => {
  const count = await readListCache<number>(CHAT_UNREAD_KEY)
  return typeof count === 'number' ? count : null
}

export function offlineListMessage(hasCache: boolean) {
  return hasCache
    ? 'Showing saved copy — connect to refresh.'
    : 'No saved data on this device. Open once while online.'
}

const DASHBOARD_SNAPSHOT_KEY = 'mobile_rn_dashboard_snapshot_v1'

export type DashboardSnapshot = {
  projectTasks: DashboardTask[]
  userTasks: DashboardTask[]
  notifications: DashboardNotification[]
  jobCards: DashboardJobCard[]
  stats: { projects: number; activeProjects: number; clients: number }
}

export const cacheDashboardSnapshot = (snapshot: DashboardSnapshot) =>
  writeListCache(DASHBOARD_SNAPSHOT_KEY, snapshot)

export const readCachedDashboardSnapshot = () =>
  readListCache<DashboardSnapshot>(DASHBOARD_SNAPSHOT_KEY)
