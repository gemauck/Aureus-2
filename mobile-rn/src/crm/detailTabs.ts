import type { CrmDetailTab, CrmDetailTabConfig, CrmEntityBase } from './types'
import {
  entityActivityLog,
  entityComments,
  entityContacts,
  entityContracts,
  entityFollowUps,
  entityProjects,
  entityProposals,
  entityServices,
  entitySites
} from './utils'

export const ALL_DETAIL_TABS: CrmDetailTabConfig[] = [
  { key: 'overview', label: 'Overview', icon: 'info-circle' },
  { key: 'contacts', label: 'Contacts', icon: 'address-book' },
  { key: 'sites', label: 'Sites', icon: 'map-marker-alt' },
  { key: 'calendar', label: 'Calendar', shortLabel: 'Cal', icon: 'calendar-alt' },
  { key: 'activity', label: 'Activity', shortLabel: 'Feed', icon: 'history' },
  { key: 'notes', label: 'Notes', icon: 'sticky-note' },
  { key: 'kyc', label: 'KYC', icon: 'id-card', clientOnly: true },
  { key: 'opportunities', label: 'Opportunities', shortLabel: 'Opps', icon: 'bullseye', clientOnly: true },
  { key: 'projects', label: 'Projects', icon: 'folder-open', clientOnly: true },
  { key: 'services', label: 'Service & Maint.', shortLabel: 'S&M', icon: 'wrench', clientOnly: true },
  { key: 'jobcards', label: 'Job cards', shortLabel: 'Jobs', icon: 'clipboard-list', clientOnly: true },
  { key: 'contracts', label: 'Contracts', shortLabel: 'Deals', icon: 'file-contract', clientOnly: true },
  { key: 'proposals', label: 'Proposals', icon: 'clipboard-list', leadOnly: true }
]

export function detailTabsFor(entityType: 'client' | 'lead'): CrmDetailTabConfig[] {
  return ALL_DETAIL_TABS.filter((t) => {
    if (t.clientOnly && entityType !== 'client') return false
    if (t.leadOnly && entityType !== 'lead') return false
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
  } = {}
): number | null {
  switch (tab) {
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
    case 'contracts':
      return entityContracts(entity).length || null
    case 'services':
      return entityServices(entity).length || null
    case 'jobcards':
      return extras.jobCards ?? null
    case 'notes':
      return extras.clientNotes != null && extras.clientNotes > 0
        ? extras.clientNotes
        : entity.notes?.trim()
          ? 1
          : null
    default:
      return null
  }
}
