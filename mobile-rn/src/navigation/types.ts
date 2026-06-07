export type RootStackParamList = {
  Login: undefined
  Dashboard: undefined
  JobCards: { jobCardId?: string } | undefined
  Clients: undefined
  Projects: undefined
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
  Users: undefined
  Manufacturing: undefined
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
