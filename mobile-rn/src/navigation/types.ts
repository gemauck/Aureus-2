export type RootStackParamList = {
  Login: undefined
  Dashboard: undefined
  JobCards: undefined
  Clients: undefined
  Projects: undefined
  MyTasks: undefined
  MyNotes: undefined
  Teams: undefined
  Users: undefined
  Manufacturing: undefined
  ServiceMaintenance: undefined
  Helpdesk: undefined
  Tools: undefined
  Documents: undefined
  Notifications: undefined
  Reports: undefined
  Settings: undefined
}

export type MenuItemId = keyof Omit<
  RootStackParamList,
  'Login' | 'JobCards' | 'ServiceMaintenance'
> | 'service-maintenance'
