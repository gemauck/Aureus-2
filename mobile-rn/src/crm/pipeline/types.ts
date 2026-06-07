import type { CrmClient, CrmLead, CrmOpportunity, CrmSite } from '../types'

export type PipelineItemType = 'lead' | 'site' | 'opportunity' | 'client'

export type PipelineItem = {
  id: string
  type: PipelineItemType
  itemType: string
  name: string
  stage: string | null
  aidaStatus: string | null
  status: string | null
  engagementStage: string | null
  isStarred: boolean
  value: number
  industry?: string
  clientId?: string
  clientName?: string
  leadId?: string
  lead?: CrmLead
  client?: CrmClient
  site?: CrmSite
  siteId?: string | null
  siteIndex?: number
  company?: string
  createdDate?: string
  expectedCloseDate?: string | null
  raw?: unknown
}

export type PipelineListRow = {
  item: PipelineItem
  isNested: boolean
  parentName: string | null
  parentLabel: string | null
}

export type PipelineViewMode = 'list' | 'kanban'
export type PipelineKanbanGroupBy = 'aidaStatus' | 'engagementStage'

export type PipelineFilters = {
  search: string
  industry: string
  engagementStage: string
  aidaStatus: string
  type: string
  starredOnly: boolean
}
