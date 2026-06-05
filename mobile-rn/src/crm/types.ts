export type CrmContact = {
  id?: string
  name?: string
  email?: string
  phone?: string
  mobile?: string
  role?: string
  title?: string
  isPrimary?: boolean
}

export type CrmSite = {
  id?: string
  name?: string
  siteName?: string
  address?: string
  engagementStage?: string | null
  aidaStatus?: string | null
}

export type CrmComment = {
  id?: string
  text?: string
  content?: string
  author?: string
  createdAt?: string
  timestamp?: string
}

export type CrmEntityBase = {
  id: string
  name?: string
  industry?: string
  status?: string
  stage?: string
  engagementStage?: string | null
  aidaStatus?: string | null
  website?: string
  address?: string
  notes?: string
  lastContact?: string
  isStarred?: boolean
  contacts?: CrmContact[]
  sites?: CrmSite[]
  clientSites?: CrmSite[]
  comments?: CrmComment[]
  opportunities?: Array<{ id?: string; name?: string; value?: number; status?: string }>
  externalAgent?: { id?: string; name?: string } | null
  ownerId?: string | null
  type?: string
}

export type CrmClient = CrmEntityBase & {
  type?: 'client' | 'group' | string
  revenue?: number
}

export type CrmLead = CrmEntityBase & {
  type?: 'lead'
  value?: number
  probability?: number
  stage?: string
}

export type CrmTab = 'clients' | 'leads'

export type CrmFilterKey = 'all' | 'starred' | 'active'

export type CrmDetailTab = 'overview' | 'contacts' | 'sites' | 'notes'
