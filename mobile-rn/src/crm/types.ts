export type CrmContact = {
  id?: string
  name?: string
  email?: string
  phone?: string
  mobile?: string
  role?: string
  title?: string
  isPrimary?: boolean
  notes?: string
}

export type CrmSite = {
  id?: string
  name?: string
  siteName?: string
  address?: string
  contactPerson?: string
  contactPhone?: string
  contactEmail?: string
  notes?: string
  siteLead?: string
  engagementStage?: string | null
  aidaStatus?: string | null
  stage?: string | null
  siteType?: string
  createdAt?: string
}

export type CrmComment = {
  id?: string
  text?: string
  content?: string
  author?: string | { name?: string; email?: string }
  userName?: string
  createdAt?: string
  timestamp?: string
  tags?: string[]
}

export type CrmFollowUp = {
  id?: string
  date?: string
  time?: string
  type?: string
  description?: string
  completed?: boolean
  assignedTo?: string | null
}

export type CrmContract = {
  id?: string
  name?: string
  size?: number
  type?: string
  uploadDate?: string
  url?: string
}

export type CrmProposal = {
  id?: string
  title?: string
  amount?: number
  status?: string
  workingDocumentLink?: string
  createdDate?: string | null
  expiryDate?: string | null
  notes?: string
}

export type CrmService = {
  id?: string
  name?: string
  description?: string
  price?: number
  status?: string
  startDate?: string | null
  endDate?: string | null
  notes?: string
}

export type CrmActivityItem = {
  id?: string
  type?: string
  description?: string
  timestamp?: string
  user?: string
  userName?: string
}

export type CrmOpportunity = {
  id: string
  name?: string
  title?: string
  value?: number
  status?: string
  stage?: string | null
  engagementStage?: string | null
  aidaStatus?: string | null
  probability?: number
  isStarred?: boolean
  clientId?: string
  createdAt?: string
}

export type CrmProject = {
  id: string
  name?: string
  status?: string
}

export type CrmJobCard = {
  id: string
  jobCardNumber?: string
  status?: string
  siteName?: string
  reasonForVisit?: string
  createdAt?: string
  agentName?: string
}

export type CrmClientNote = {
  id: string
  title?: string
  content?: string
  createdAt?: string
  updatedAt?: string
  author?: { id?: string; name?: string; email?: string } | null
  tags?: string[]
}

export type CrmTag = {
  id: string
  name?: string
  color?: string
}

export type CrmBillingTerms = {
  paymentTerms?: string
  billingFrequency?: string
  currency?: string
  retainerAmount?: number
  taxExempt?: boolean
  notes?: string
}

export type CrmKyc = {
  clientType?: string
  legalEntity?: {
    registeredLegalName?: string
    tradingName?: string
    registrationNumber?: string
    vatNumber?: string
    registeredAddress?: string
  }
  businessProfile?: {
    industrySector?: string
    coreBusinessActivities?: string
  }
  directorsNotes?: string
  ubosNotes?: string
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
  value?: number
  probability?: number
  revenue?: number
  contacts?: CrmContact[]
  sites?: CrmSite[]
  clientSites?: CrmSite[]
  comments?: CrmComment[]
  followUps?: CrmFollowUp[]
  contracts?: CrmContract[]
  proposals?: CrmProposal[]
  services?: CrmService[]
  activityLog?: CrmActivityItem[]
  opportunities?: CrmOpportunity[]
  projects?: CrmProject[]
  projectIds?: string[]
  billingTerms?: CrmBillingTerms
  kyc?: CrmKyc
  externalAgent?: { id?: string; name?: string } | null
  ownerId?: string | null
  type?: string
  createdAt?: string
  updatedAt?: string
  groupMemberships?: Array<{ group?: { id?: string; name?: string } | null }>
}

export type CrmClient = CrmEntityBase & {
  type?: 'client' | string
}

export type CrmLead = CrmEntityBase & {
  type?: 'lead'
  company?: string
}

export type CrmGroup = CrmEntityBase & {
  type?: 'group'
  _count?: { groupChildren?: number; childCompanies?: number }
}

export type CrmGroupMember = CrmEntityBase & {
  relationship?: string
  membershipId?: string
  role?: string
}

export type CrmTab = 'clients' | 'leads' | 'pipeline' | 'groups'

export type CrmFilterKey = 'all' | 'starred' | 'active' | 'recent'

export type CrmDetailTab =
  | 'overview'
  | 'contacts'
  | 'sites'
  | 'members'
  | 'opportunities'
  | 'projects'
  | 'calendar'
  | 'activity'
  | 'proposals'
  | 'services'
  | 'kyc'
  | 'notes'

export type CrmDetailTabConfig = {
  key: CrmDetailTab
  label: string
  shortLabel?: string
  icon: string
  clientOnly?: boolean
  leadOnly?: boolean
  groupOnly?: boolean
}
