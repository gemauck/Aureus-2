import type { CrmDetailTab, CrmDetailTabConfig, CrmEntityBase } from './types'
import {
  entityActivityLog,
  entityComments,
  entityContacts,
  entityFollowUps,
  entityProjects,
  entityProposals,
  entityServices,
  entitySites
} from './utils'

export const ALL_DETAIL_TABS: CrmDetailTabConfig[] = [
  { key: 'overview', label: 'Overview', icon: 'info-circle' },
  { key: 'members', label: 'Members', icon: 'users', groupOnly: true },
  { key: 'contacts', label: 'Contacts', icon: 'address-book' },
  { key: 'sites', label: 'Sites', icon: 'map-marker-alt' },
  { key: 'calendar', label: 'Calendar', shortLabel: 'Cal', icon: 'calendar-alt' },
  { key: 'activity', label: 'Activity', shortLabel: 'Feed', icon: 'history' },
  { key: 'notes', label: 'Notes', icon: 'sticky-note' },
  { key: 'kyc', label: 'KYC', icon: 'id-card', clientOnly: true },
  { key: 'opportunities', label: 'Opportunities', shortLabel: 'Opps', icon: 'bullseye', clientOnly: true },
  { key: 'projects', label: 'Projects', icon: 'folder-open', clientOnly: true },
  {
    key: 'services',
    label: 'Service & Maintenance',
    shortLabel: 'S&M',
    icon: 'wrench',
    clientOnly: true
  },
  { key: 'proposals', label: 'Proposals', icon: 'clipboard-list', leadOnly: true }
]

export function detailTabsFor(entityType: 'client' | 'lead' | 'group'): CrmDetailTabConfig[] {
  return ALL_DETAIL_TABS.filter((t) => {
    if (t.clientOnly && entityType !== 'client') return false
    if (t.leadOnly && entityType !== 'lead') return false
    if (t.groupOnly && entityType !== 'group') return false
    if (entityType === 'group' && (t.key === 'contacts' || t.key === 'sites' || t.key === 'calendar' || t.key === 'activity')) {
      return false
    }
    return true
  })
}

export function tabCount(
  tab: CrmDetailTab,
  entity: CrmEntityBase,
  extras: {
    opportunities?: number
    jobCards?: number
    clientNotes?: number
    groupMembers?: number
  } = {}
): number | null {
  switch (tab) {
    case 'members':
      return extras.groupMembers != null && extras.groupMembers > 0 ? extras.groupMembers : null
    case 'contacts':
      return entityContacts(entity).length || null
    case 'sites':
      return entitySites(entity).length || null
    case 'calendar':
      return entityFollowUps(entity).length || null
    case 'activity':
      return (entityActivityLog(entity).length + entityComments(entity).length) || null
    case 'opportunities':
      return extras.opportunities ?? entity.opportunities?.length ?? null
    case 'projects':
      return entityProjects(entity).length || null
    case 'proposals':
      return entityProposals(entity).length || null
    case 'services': {
      const n = entityServices(entity).length + (extras.jobCards ?? 0)
      return n > 0 ? n : null
    }
    case 'notes': {
      const structured = extras.clientNotes ?? 0
      const summary = entity.notes?.trim() ? 1 : 0
      const leadComments = entityComments(entity).length
      const total = structured + summary + leadComments
      return total > 0 ? total : null
    }
    default:
      return null
  }
}
