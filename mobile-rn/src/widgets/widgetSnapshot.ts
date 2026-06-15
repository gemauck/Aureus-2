import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = '@erp_widget_snapshot_v1'

export type WidgetSnapshot = {
  updatedAt: string
  signedIn: boolean
  userName?: string
  openTaskCount: number
  topTasks: Array<{ id: string; title: string }>
  unreadNotifications: number
  activeProjects: number
  totalProjects: number
  openJobCards: number
}

export const EMPTY_WIDGET_SNAPSHOT: WidgetSnapshot = {
  updatedAt: '',
  signedIn: false,
  openTaskCount: 0,
  topTasks: [],
  unreadNotifications: 0,
  activeProjects: 0,
  totalProjects: 0,
  openJobCards: 0
}

export async function saveWidgetSnapshot(snapshot: WidgetSnapshot): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
}

export async function loadWidgetSnapshot(): Promise<WidgetSnapshot> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_WIDGET_SNAPSHOT
    return { ...EMPTY_WIDGET_SNAPSHOT, ...(JSON.parse(raw) as Partial<WidgetSnapshot>) }
  } catch {
    return EMPTY_WIDGET_SNAPSHOT
  }
}

export async function clearWidgetSnapshot(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY)
}

export function formatWidgetUpdatedAt(iso: string): string {
  if (!iso) return 'Open app to refresh'
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return 'Open app to refresh'
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000))
  if (mins < 1) return 'Updated just now'
  if (mins < 60) return `Updated ${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Updated ${hours}h ago`
  return `Updated ${Math.floor(hours / 24)}d ago`
}
