export const AIDA_STAGES = [
  'No Engagement',
  'Awareness',
  'Interest',
  'Desire',
  'Action'
] as const

export const ENGAGEMENT_STAGES = [
  'Disinterested',
  'Potential',
  'Active',
  'Proposal',
  'Tender'
] as const

export const PIPELINE_TYPE_FILTERS = [
  { key: 'all', label: 'All types' },
  { key: 'lead', label: 'Leads' },
  { key: 'site', label: 'Sites' },
  { key: 'opportunity', label: 'Opportunities' }
] as const

export type PipelineTypeFilterKey = (typeof PIPELINE_TYPE_FILTERS)[number]['key']

export const AIDA_STAGE_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  'No Engagement': { bg: '#f1f5f9', fg: '#475569', border: '#cbd5e1' },
  Awareness: { bg: '#f3f4f6', fg: '#374151', border: '#d1d5db' },
  Interest: { bg: '#eff6ff', fg: '#1d4ed8', border: '#bfdbfe' },
  Desire: { bg: '#fefce8', fg: '#a16207', border: '#fde047' },
  Action: { bg: '#f0fdf4', fg: '#15803d', border: '#86efac' }
}

export const ENGAGEMENT_STAGE_COLORS: Record<string, { bg: string; fg: string }> = {
  Disinterested: { bg: '#f1f5f9', fg: '#64748b' },
  Potential: { bg: '#eff6ff', fg: '#0284c7' },
  Active: { bg: '#f0fdf4', fg: '#16a34a' },
  Proposal: { bg: '#fef3c7', fg: '#d97706' },
  Tender: { bg: '#ede9fe', fg: '#7c3aed' }
}
