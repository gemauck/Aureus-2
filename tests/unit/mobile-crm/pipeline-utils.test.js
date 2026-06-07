/**
 * Pipeline parity tests — mirrors mobile-rn/src/crm/pipeline/utils.ts logic.
 */
import { describe, expect, test } from '@jest/globals'

const AIDA_STAGES = ['No Engagement', 'Awareness', 'Interest', 'Desire', 'Action']

function normalizeStageToAida(rawStage) {
  const fallbackStage = 'Awareness'
  if (rawStage == null) return fallbackStage
  const normalized = String(rawStage).trim()
  if (!normalized) return fallbackStage
  const lower = normalized.toLowerCase()
  if (lower === 'prospect' || lower === 'new') return fallbackStage
  const exact = AIDA_STAGES.find((s) => s.toLowerCase() === lower)
  if (exact) return exact
  const ids = ['no engagement', 'awareness', 'interest', 'desire', 'action']
  const idx = ids.indexOf(lower)
  if (idx !== -1) return AIDA_STAGES[idx]
  return fallbackStage
}

function normalizeLifecycleStage(value) {
  switch (String(value || '').toLowerCase()) {
    case 'active':
      return 'Active'
    case 'proposal':
      return 'Proposal'
    case 'tender':
      return 'Tender'
    case 'disinterested':
      return 'Disinterested'
    default:
      return 'Potential'
  }
}

function buildPipelineItems(clients, leads) {
  const leadItems = leads.map((lead) => ({
    id: String(lead.id),
    type: 'lead',
    name: lead.name || 'Lead',
    aidaStatus: normalizeStageToAida(lead.aidaStatus ?? lead.stage),
    industry: lead.industry
  }))

  const siteItems = []
  for (const lead of leads) {
    const sites = lead.sites || lead.clientSites || []
    sites.forEach((site, idx) => {
      if (!site || site.siteType === 'client') return
      siteItems.push({
        id: `lead-${lead.id}-site-${site.id || idx}`,
        type: 'site',
        name: `${lead.name} · ${site.name || 'Site'}`,
        leadId: lead.id
      })
    })
  }

  const opportunityItems = []
  for (const client of clients) {
    for (const opp of client.opportunities || []) {
      opportunityItems.push({
        id: String(opp.id),
        type: 'opportunity',
        name: opp.title || opp.name,
        clientId: client.id,
        value: Number(opp.value) || 0
      })
    }
  }

  return [...leadItems, ...siteItems, ...opportunityItems]
}

function itemsForKanban(items, leads) {
  const leadHasSites = (leadId) => {
    const lead = leads.find((l) => String(l.id) === String(leadId))
    if (!lead) return false
    return (lead.sites || lead.clientSites || []).some((s) => s && s.siteType !== 'client')
  }
  return items.filter((item) => item.type !== 'lead' || !leadHasSites(item.id))
}

describe('mobile CRM pipeline utils parity', () => {
  test('normalizeStageToAida maps aliases and stages', () => {
    expect(normalizeStageToAida(null)).toBe('Awareness')
    expect(normalizeStageToAida('prospect')).toBe('Awareness')
    expect(normalizeStageToAida('interest')).toBe('Interest')
    expect(normalizeStageToAida('No Engagement')).toBe('No Engagement')
    expect(normalizeStageToAida('ACTION')).toBe('Action')
  })

  test('normalizeLifecycleStage matches web ERP', () => {
    expect(normalizeLifecycleStage('proposal')).toBe('Proposal')
    expect(normalizeLifecycleStage('Tender')).toBe('Tender')
    expect(normalizeLifecycleStage('')).toBe('Potential')
  })

  test('buildPipelineItems includes leads, sites, and opportunities', () => {
    const items = buildPipelineItems(
      [
        {
          id: 'c1',
          name: 'Acme',
          opportunities: [{ id: 'o1', title: 'Expansion', value: 50000 }]
        }
      ],
      [
        {
          id: 'l1',
          name: 'Beta Lead',
          aidaStatus: 'Interest',
          sites: [{ name: 'Site A', siteType: 'lead' }]
        }
      ]
    )
    expect(items.some((i) => i.type === 'lead' && i.id === 'l1')).toBe(true)
    expect(items.some((i) => i.type === 'site')).toBe(true)
    expect(items.some((i) => i.type === 'opportunity' && i.id === 'o1')).toBe(true)
  })

  test('kanban hides lead row when lead has pipeline sites', () => {
    const leads = [
      {
        id: 'l1',
        name: 'With sites',
        sites: [{ name: 'S1', siteType: 'lead' }]
      },
      { id: 'l2', name: 'No sites', sites: [] }
    ]
    const items = buildPipelineItems([], leads)
    const kanban = itemsForKanban(items, leads)
    expect(kanban.some((i) => i.type === 'lead' && i.id === 'l1')).toBe(false)
    expect(kanban.some((i) => i.type === 'lead' && i.id === 'l2')).toBe(true)
    expect(kanban.some((i) => i.type === 'site')).toBe(true)
  })
})
