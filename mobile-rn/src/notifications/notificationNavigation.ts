import type { TeamTabId } from '../teams/types'
import type { CrmDetailTab } from '../crm/types'
import type { ProjectDetailTab } from '../projects/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NavLike = { navigate: (...args: any[]) => void }

export type NotificationNavItem = {
  id?: string
  link?: string
  title?: string
  type?: string
  metadata?: string | Record<string, unknown>
}

export type PushNotificationData = {
  notificationId?: string
  type?: string
  link?: string
  conversationId?: string
  projectId?: string
  taskId?: string
  clientId?: string
  leadId?: string
  teamId?: string
  discussionId?: string
}

type ParsedLink = {
  path: string
  params: URLSearchParams
}

function parseMetadata(item: NotificationNavItem): Record<string, unknown> {
  if (!item.metadata) return {}
  if (typeof item.metadata === 'object') return item.metadata
  try {
    return JSON.parse(item.metadata) as Record<string, unknown>
  } catch {
    return {}
  }
}

function parseNotificationLink(link: string): ParsedLink {
  const raw = String(link || '').trim()
  if (!raw) return { path: '', params: new URLSearchParams() }

  const hashPart = raw.includes('#') ? raw.split('#').slice(1).join('#') : raw
  const withoutLeading = hashPart.startsWith('/') ? hashPart : `/${hashPart}`
  const qIdx = withoutLeading.indexOf('?')
  const path = qIdx >= 0 ? withoutLeading.slice(0, qIdx) : withoutLeading
  const query =
    qIdx >= 0
      ? withoutLeading.slice(qIdx + 1)
      : raw.includes('?') && !raw.includes('#')
        ? raw.split('?').slice(1).join('?')
        : ''
  return { path, params: new URLSearchParams(query) }
}

function projectTabFromParams(params: URLSearchParams, meta: Record<string, unknown>): ProjectDetailTab {
  const tab = params.get('tab') || (meta.tab as string) || ''
  const allowed: ProjectDetailTab[] = [
    'overview',
    'tasks',
    'notes',
    'activity',
    'documents',
    'team',
    'processes'
  ]
  if (allowed.includes(tab as ProjectDetailTab)) return tab as ProjectDetailTab
  if (tab === 'comments') return 'activity'
  if (
    params.get('docSectionId') ||
    params.get('docDocumentId') ||
    meta.sectionId ||
    meta.documentId
  ) {
    return 'documents'
  }
  return 'overview'
}

function crmTabForNotification(type?: string): CrmDetailTab {
  if (type === 'comment' || type === 'mention') return 'activity'
  return 'overview'
}

type TeamsDeepLink = {
  teamId?: string
  tab?: TeamTabId
  discussionId?: string
  monthKey?: string
  weekKey?: string
}

function parseTeamsLink(link: string, meta: Record<string, unknown>): TeamsDeepLink | null {
  const raw = link || ''
  if (!raw.includes('/teams') && !raw.includes('#/teams') && !meta.teamId) return null

  const { path, params } = parseNotificationLink(raw)
  const pathMatch = path.match(/\/teams\/([^/]+)?/)
  const teamId =
    (meta.teamId as string) ||
    pathMatch?.[1] ||
    params.get('team') ||
    undefined
  const tab = (params.get('tab') as TeamTabId | null) || undefined
  const discussionId = (meta.discussionId as string) || params.get('discussion') || undefined
  const monthKey = params.get('month') || params.get('monthKey') || undefined
  const weekKey = params.get('week') || params.get('weekKey') || undefined

  if (!teamId && !discussionId && !monthKey) return null
  return { teamId, tab, discussionId, monthKey, weekKey }
}

function navigateTeams(navigation: NavLike, teams: TeamsDeepLink) {
  if (teams.teamId && teams.tab === 'meeting-notes') {
    navigation.navigate('Teams', {
      screen: 'MeetingNotes',
      params: { teamId: teams.teamId, monthKey: teams.monthKey, weekKey: teams.weekKey }
    } as never)
    return true
  }
  if (teams.teamId) {
    navigation.navigate('Teams', {
      screen: 'TeamDetail',
      params: {
        teamId: teams.teamId,
        initialTab: teams.tab,
        discussionId: teams.discussionId
      }
    } as never)
    return true
  }
  if (teams.discussionId) {
    navigation.navigate('Teams', {
      screen: 'DiscussionDetail',
      params: { teamId: teams.teamId || 'unknown', discussionId: teams.discussionId }
    } as never)
    return true
  }
  navigation.navigate('Teams')
  return true
}

/** Navigate from an ERP notification row. Returns true when a destination was opened. */
export function navigateFromNotification(navigation: NavLike, item: NotificationNavItem): boolean {
  const meta = parseMetadata(item)
  const link = item.link || (meta.link as string) || ''
  const type = item.type || (meta.type as string)

  const conversationId =
    (meta.conversationId as string) ||
    link.match(/conversation=([^&]+)/)?.[1] ||
    null
  if (conversationId) {
    navigation.navigate('Messages', {
      screen: 'Chat',
      params: { conversationId: decodeURIComponent(conversationId), title: item.title || 'Chat' }
    } as never)
    return true
  }
  if (link.includes('/messages') || link.includes('#/messages')) {
    navigation.navigate('Messages')
    return true
  }

  const teams = parseTeamsLink(link, meta)
  if (teams) return navigateTeams(navigation, teams)

  const { path, params } = parseNotificationLink(link)
  const clientId =
    (meta.clientId as string) ||
    path.match(/\/clients\/([^/?]+)/)?.[1] ||
    null
  if (clientId) {
    navigation.navigate('Clients', {
      screen: 'CrmDetail',
      params: {
        entityType: 'client',
        entityId: decodeURIComponent(clientId),
        initialTab: crmTabForNotification(type)
      }
    } as never)
    return true
  }

  const leadId =
    (meta.leadId as string) ||
    path.match(/\/leads\/([^/?]+)/)?.[1] ||
    null
  if (leadId) {
    navigation.navigate('Clients', {
      screen: 'CrmDetail',
      params: {
        entityType: 'lead',
        entityId: decodeURIComponent(leadId),
        initialTab: crmTabForNotification(type)
      }
    } as never)
    return true
  }

  const projectId =
    (meta.projectId as string) ||
    path.match(/\/projects\/([^/?]+)/)?.[1] ||
    null
  const taskId = (meta.taskId as string) || params.get('task') || path.match(/\/tasks\/([^/?]+)/)?.[1] || null

  if (projectId && taskId) {
    navigation.navigate('Projects', {
      screen: 'TaskDetail',
      params: {
        taskId: decodeURIComponent(taskId),
        projectId: decodeURIComponent(projectId)
      }
    } as never)
    return true
  }

  if (taskId && !projectId && (type === 'task' || path.includes('/tasks/'))) {
    navigation.navigate('MyTasks', {
      screen: 'UserTaskDetail',
      params: { taskId: decodeURIComponent(taskId) }
    } as never)
    return true
  }

  if (projectId) {
    navigation.navigate('Projects', {
      screen: 'ProjectDetail',
      params: {
        projectId: decodeURIComponent(projectId),
        initialTab: projectTabFromParams(params, meta)
      }
    } as never)
    return true
  }

  if (path.includes('/helpdesk') || link.includes('helpdesk')) {
    navigation.navigate('Helpdesk')
    return true
  }
  if (path.includes('/reports') || link.includes('reports')) {
    navigation.navigate('Reports')
    return true
  }
  if (path.includes('/jobcards') || path.includes('/service-maintenance')) {
    navigation.navigate('JobCards')
    return true
  }
  if (path.includes('/manufacturing')) {
    navigation.navigate('Manufacturing')
    return true
  }
  if (path.includes('/my-tasks') || path.includes('/tasks')) {
    navigation.navigate('MyTasks')
    return true
  }
  if (path.includes('/dashboard') || path === '/' || !path) {
    navigation.navigate('Dashboard')
    return true
  }

  return false
}

/** Navigate when the user taps a push notification banner. */
export function navigateFromPushData(navigation: NavLike, data: PushNotificationData) {
  const item: NotificationNavItem = {
    id: data.notificationId,
    link: data.link,
    type: data.type,
    metadata: {
      conversationId: data.conversationId,
      projectId: data.projectId,
      taskId: data.taskId,
      clientId: data.clientId,
      leadId: data.leadId,
      teamId: data.teamId,
      discussionId: data.discussionId
    }
  }
  if (!navigateFromNotification(navigation, item)) {
    navigation.navigate('Notifications')
  }
}
