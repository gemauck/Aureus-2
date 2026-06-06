import AsyncStorage from '@react-native-async-storage/async-storage'
import type { RootStackParamList } from '../navigation/types'
import type { ErpTheme } from '../theme/palettes'

const STORAGE_KEY = '@erp_dashboard_config_v1'

export type DashboardWidgetId = 'tasks' | 'notifications' | 'jobCards'

export type DashboardQuickActionId =
  | 'jobCards'
  | 'projects'
  | 'crm'
  | 'myTasks'
  | 'messages'
  | 'notifications'
  | 'teams'
  | 'manufacturing'

export type DashboardConfig = {
  showStats: boolean
  widgetOrder: DashboardWidgetId[]
  hiddenWidgets: DashboardWidgetId[]
  quickActionOrder: DashboardQuickActionId[]
  hiddenQuickActions: DashboardQuickActionId[]
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  showStats: true,
  widgetOrder: ['tasks', 'notifications', 'jobCards'],
  hiddenWidgets: [],
  quickActionOrder: ['jobCards', 'projects', 'crm', 'myTasks'],
  hiddenQuickActions: []
}

export type WidgetDef = {
  id: DashboardWidgetId
  title: string
  subtitle: string
  icon: string
  iconColor: string
  screen: keyof RootStackParamList
}

export function getWidgetDefs(erp: ErpTheme): Record<DashboardWidgetId, WidgetDef> {
  return {
    tasks: {
      id: 'tasks',
      title: 'My Tasks',
      subtitle: 'Project tasks and personal to-dos',
      icon: 'check-square',
      iconColor: erp.success,
      screen: 'MyTasks'
    },
    notifications: {
      id: 'notifications',
      title: 'Notifications',
      subtitle: 'Updates from across the ERP',
      icon: 'bell',
      iconColor: erp.warning,
      screen: 'Notifications'
    },
    jobCards: {
      id: 'jobCards',
      title: 'Recent job cards',
      subtitle: 'Latest field service visits',
      icon: 'clipboard-list',
      iconColor: erp.primary,
      screen: 'JobCards'
    }
  }
}

export type QuickActionDef = {
  id: DashboardQuickActionId
  label: string
  icon: string
  tint: string
  screen: keyof RootStackParamList
}

export function getQuickActionDefs(erp: ErpTheme): Record<DashboardQuickActionId, QuickActionDef> {
  return {
    jobCards: { id: 'jobCards', label: 'Job cards', icon: 'wrench', tint: erp.primary, screen: 'JobCards' },
    projects: { id: 'projects', label: 'Projects', icon: 'project-diagram', tint: '#7c3aed', screen: 'Projects' },
    crm: { id: 'crm', label: 'CRM', icon: 'users', tint: '#0891b2', screen: 'Clients' },
    myTasks: { id: 'myTasks', label: 'My tasks', icon: 'check-square', tint: erp.success, screen: 'MyTasks' },
    messages: { id: 'messages', label: 'Messages', icon: 'comments', tint: '#6366f1', screen: 'Messages' },
    notifications: {
      id: 'notifications',
      label: 'Notifications',
      icon: 'bell',
      tint: erp.warning,
      screen: 'Notifications'
    },
    teams: { id: 'teams', label: 'Teams', icon: 'user-friends', tint: '#8b5cf6', screen: 'Teams' },
    manufacturing: {
      id: 'manufacturing',
      label: 'Manufacturing',
      icon: 'industry',
      tint: '#475569',
      screen: 'Manufacturing'
    }
  }
}

export const ALL_WIDGET_IDS: DashboardWidgetId[] = ['tasks', 'notifications', 'jobCards']
export const ALL_QUICK_ACTION_IDS: DashboardQuickActionId[] = [
  'jobCards',
  'projects',
  'crm',
  'myTasks',
  'messages',
  'notifications',
  'teams',
  'manufacturing'
]

function normalizeConfig(raw: Partial<DashboardConfig> | null | undefined): DashboardConfig {
  const base = { ...DEFAULT_DASHBOARD_CONFIG, ...raw }
  const widgetOrder = [
    ...base.widgetOrder.filter((id) => ALL_WIDGET_IDS.includes(id)),
    ...ALL_WIDGET_IDS.filter((id) => !base.widgetOrder.includes(id))
  ]
  const quickActionOrder = [
    ...base.quickActionOrder.filter((id) => ALL_QUICK_ACTION_IDS.includes(id)),
    ...ALL_QUICK_ACTION_IDS.filter((id) => !base.quickActionOrder.includes(id))
  ]
  return {
    showStats: base.showStats !== false,
    widgetOrder,
    hiddenWidgets: (base.hiddenWidgets || []).filter((id) => ALL_WIDGET_IDS.includes(id)),
    quickActionOrder,
    hiddenQuickActions: (base.hiddenQuickActions || []).filter((id) =>
      ALL_QUICK_ACTION_IDS.includes(id)
    )
  }
}

export function visibleWidgets(config: DashboardConfig): DashboardWidgetId[] {
  return config.widgetOrder.filter((id) => !config.hiddenWidgets.includes(id))
}

export function visibleQuickActions(config: DashboardConfig): DashboardQuickActionId[] {
  return config.quickActionOrder.filter((id) => !config.hiddenQuickActions.includes(id))
}

export async function loadDashboardConfig(): Promise<DashboardConfig> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_DASHBOARD_CONFIG
    return normalizeConfig(JSON.parse(raw) as Partial<DashboardConfig>)
  } catch {
    return DEFAULT_DASHBOARD_CONFIG
  }
}

export async function saveDashboardConfig(config: DashboardConfig): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeConfig(config)))
}

export function moveItem<T extends string>(order: T[], id: T, direction: 'up' | 'down'): T[] {
  const idx = order.indexOf(id)
  if (idx < 0) return order
  const swap = direction === 'up' ? idx - 1 : idx + 1
  if (swap < 0 || swap >= order.length) return order
  const next = [...order]
  ;[next[idx], next[swap]] = [next[swap], next[idx]]
  return next
}

export function toggleHidden<T extends string>(hidden: T[], id: T, enabled: boolean): T[] {
  if (enabled) return hidden.filter((x) => x !== id)
  if (hidden.includes(id)) return hidden
  return [...hidden, id]
}
