import type { LinkingOptions } from '@react-navigation/native'
import type { RootStackParamList } from './types'

/** Deep links: abcotronics://dashboard, abcotronics://manufacturing/inventory, etc. */
export const linking: LinkingOptions<RootStackParamList> = {
  // Use the custom scheme only — do not include the ERP web origin (WebViews load that host).
  prefixes: ['abcotronics://'],
  config: {
    screens: {
      Dashboard: 'dashboard',
      DashboardCustomize: 'dashboard/customize',
      Clients: 'clients',
      Projects: 'projects',
      Teams: 'teams',
      Users: 'users',
      Manufacturing: {
        path: 'manufacturing',
        screens: {
          ManufacturingHome: '',
          ManufacturingWeb: ':tab'
        }
      },
      Helpdesk: 'helpdesk',
      Tools: 'tools',
      Documents: 'documents',
      Messages: 'messages',
      Notifications: 'notifications',
      Reports: 'reports',
      MyTasks: 'my-tasks',
      MyNotes: 'my-notes',
      JobCards: 'job-cards',
      Settings: 'settings',
      ServiceMaintenance: 'service-maintenance'
    }
  }
}
