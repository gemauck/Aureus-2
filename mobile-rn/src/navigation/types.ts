export type RootStackParamList = {
  Login: undefined
  Dashboard: undefined
  JobCards: { jobCardId?: string; initialFlow?: 'landing' | 'prior_list' | 'form' | 'stock_take' } | undefined
  Clients:
    | {
        screen?: keyof import('../crm/navigation').CrmStackParamList
        params?: import('../crm/navigation').CrmStackParamList[keyof import('../crm/navigation').CrmStackParamList]
      }
    | undefined
  Projects:
    | {
        screen?: keyof import('../projects/navigation').ProjectsStackParamList
        params?: import('../projects/navigation').ProjectsStackParamList[keyof import('../projects/navigation').ProjectsStackParamList]
      }
    | undefined
  MyTasks:
    | {
        screen?: 'MyTasksHome' | 'UserTaskDetail'
        params?: { taskId: string; isNew?: boolean }
      }
    | undefined
  MyNotes:
    | {
        screen?: 'MyNotesHome' | 'MyNoteDetail'
        params?: { noteId: string; isNew?: boolean }
      }
    | undefined
  Teams:
    | {
        screen?: keyof import('../teams/navigation').TeamsStackParamList
        params?: import('../teams/navigation').TeamsStackParamList[keyof import('../teams/navigation').TeamsStackParamList]
      }
    | undefined
  Users:
    | {
        screen?: keyof import('../users/navigation').UsersStackParamList
        params?: import('../users/navigation').UsersStackParamList[keyof import('../users/navigation').UsersStackParamList]
      }
    | undefined
  Manufacturing:
    | {
        screen?: keyof import('../manufacturing/navigation').ManufacturingStackParamList
        params?: import('../manufacturing/navigation').ManufacturingStackParamList[keyof import('../manufacturing/navigation').ManufacturingStackParamList]
      }
    | undefined
  ServiceMaintenance: undefined
  Helpdesk: undefined
  Tools:
    | {
        screen?: keyof import('../tools/navigation').ToolsStackParamList
        params?: import('../tools/navigation').ToolsStackParamList[keyof import('../tools/navigation').ToolsStackParamList]
      }
    | undefined
  Documents: undefined
  Messages:
    | {
        screen?: 'MessagesHome' | 'Chat'
        params?: { conversationId: string; title?: string }
      }
    | undefined
  Notifications: undefined
  Reports: undefined
  Settings: undefined
  DashboardCustomize: undefined
}

export type MenuItemId = keyof Omit<
  RootStackParamList,
  'Login' | 'JobCards' | 'ServiceMaintenance'
> | 'service-maintenance'
