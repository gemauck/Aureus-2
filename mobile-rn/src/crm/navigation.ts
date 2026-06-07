export type CrmStackParamList = {
  CrmHome: undefined
  CrmDetail: {
    entityType: 'client' | 'lead' | 'group'
    entityId: string
    initialTab?: import('./types').CrmDetailTab
  }
}
