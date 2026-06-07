import { SCREEN_TITLES, ALL_MENU_ITEMS } from '../navigation/menuItems'
import type { RootStackParamList } from '../navigation/types'
import type { User } from '../types'
import { canAccessMenuPermission } from './permissions'

const SCREEN_PERMISSION: Partial<Record<keyof RootStackParamList, string | null>> = {
  Dashboard: null,
  Login: null,
  Notifications: null,
  Messages: null,
  MyTasks: null,
  MyNotes: null,
  Settings: null,
  DashboardCustomize: null,
  JobCards: null
}

for (const item of ALL_MENU_ITEMS) {
  if (item.screen) {
    SCREEN_PERMISSION[item.screen] = item.permission ?? null
  }
}

export function getScreenPermission(screen: keyof RootStackParamList): string | null {
  return SCREEN_PERMISSION[screen] ?? null
}

export function canAccessScreen(user: User | null | undefined, screen: keyof RootStackParamList) {
  if (!user) return false
  const role = String(user.role || '').toLowerCase()
  if (role === 'guest') {
    const guestScreens: Array<keyof RootStackParamList> = ['Projects', 'MyTasks', 'MyNotes', 'Login']
    return guestScreens.includes(screen)
  }
  // Signed-in users always reach Settings / dashboard personalization (OTA, theme, etc.).
  if (screen === 'Settings' || screen === 'DashboardCustomize') {
    return true
  }
  const permission = getScreenPermission(screen)
  return canAccessMenuPermission(user, permission)
}

export function getScreenTitle(screen: keyof RootStackParamList) {
  return SCREEN_TITLES[screen] || screen
}
