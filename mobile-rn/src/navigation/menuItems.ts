import type { RootStackParamList } from './types'

export type MenuItem = {
  id: string
  label: string
  icon: string
  screen?: keyof RootStackParamList
  permission?: string | null
  section?: 'main' | 'footer'
  webPath?: string
}

/** Mirrors web MainLayout `allMenuItems` (Calendar hidden by default). */
export const ALL_MENU_ITEMS: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'th-large', screen: 'Dashboard', permission: null, section: 'main' },
  { id: 'clients', label: 'CRM', icon: 'users', screen: 'Clients', permission: 'ACCESS_CRM', section: 'main' },
  { id: 'projects', label: 'Projects', icon: 'project-diagram', screen: 'Projects', permission: 'ACCESS_PROJECTS', section: 'main' },
  { id: 'teams', label: 'Teams', icon: 'user-friends', screen: 'Teams', permission: 'ACCESS_TEAM', section: 'main' },
  { id: 'users', label: 'Users', icon: 'user-cog', screen: 'Users', permission: 'ACCESS_USERS', section: 'main' },
  { id: 'manufacturing', label: 'Manufacturing', icon: 'industry', screen: 'Manufacturing', permission: 'ACCESS_MANUFACTURING', section: 'main' },
  {
    id: 'service-maintenance',
    label: 'Service & Maintenance',
    icon: 'wrench',
    screen: 'ServiceMaintenance',
    permission: 'ACCESS_SERVICE_MAINTENANCE',
    section: 'main'
  },
  { id: 'helpdesk', label: 'Helpdesk', icon: 'headset', screen: 'Helpdesk', permission: 'ACCESS_HELPDESK', section: 'main', webPath: '/helpdesk' },
  { id: 'tools', label: 'Tools', icon: 'toolbox', screen: 'Tools', permission: 'ACCESS_TOOL', section: 'main', webPath: '/tools' },
  { id: 'documents', label: 'Documents', icon: 'folder-open', screen: 'Documents', permission: 'ACCESS_DOCUMENTS', section: 'main', webPath: '/documents' },
  { id: 'messages', label: 'Messages', icon: 'comments', screen: 'Messages', permission: null, section: 'main' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', screen: 'Notifications', permission: null, section: 'main' },
  { id: 'reports', label: 'Reports', icon: 'chart-bar', screen: 'Reports', permission: 'ACCESS_REPORTS', section: 'main', webPath: '/reports' },
  { id: 'my-tasks', label: 'My Tasks', icon: 'check-square', screen: 'MyTasks', permission: null, section: 'footer' },
  { id: 'my-notes', label: 'My Notes', icon: 'sticky-note', screen: 'MyNotes', permission: null, section: 'footer' }
]

export const SCREEN_TITLES: Partial<Record<keyof RootStackParamList, string>> = {
  Dashboard: 'Dashboard',
  Clients: 'CRM',
  Projects: 'Projects',
  MyTasks: 'My Tasks',
  MyNotes: 'My Notes',
  Teams: 'Teams',
  Users: 'Users',
  Manufacturing: 'Manufacturing',
  ServiceMaintenance: 'Service & Maintenance',
  Helpdesk: 'Helpdesk',
  Tools: 'Tools',
  Documents: 'Documents',
  Messages: 'Messages',
  Notifications: 'Notifications',
  Reports: 'Reports',
  Settings: 'Settings',
  JobCards: 'Job cards'
}
