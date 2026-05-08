/** Stable keys for Step 3 circulation — keep in sync with ClientDetailModal LEAD_PROPOSAL_CIRCULATION_DEPARTMENTS */
export const LEAD_PROPOSAL_CIRCULATION_DEPT_KEYS = Object.freeze([
  'technical',
  'support',
  'data',
  'compliance',
  'businessDevelopment',
  'commercialAndPricing',
  'legalOperationsReview',
  'director'
])

function defaultCirculationDepartments() {
  const o = {}
  for (const k of LEAD_PROPOSAL_CIRCULATION_DEPT_KEYS) {
    o[k] = { comment: '', responsibleUserId: '' }
  }
  return o
}

const DEFAULT_WORKFLOW = Object.freeze({
  currentStep: 1,
  engagementQuestionnaireId: '',
  /** Optional: mandate completed offline (upload URL + original filename stored with proposal workflow). */
  manualEngagementMandateLink: '',
  manualEngagementMandateUploadedName: '',
  departmentalComments: '',
  circulationDepartments: defaultCirculationDepartments(),
  signOffBy: '',
  submittedToClientAt: null,
  submissionNotes: '',
  workingDraftUploadedName: ''
})

/**
 * Normalize workflow from API/DB for Prisma Json and UI.
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
export function sanitizeLeadProposalWorkflow(raw) {
  const w = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  let step = Number(w.currentStep)
  if (!Number.isFinite(step)) step = 1
  step = Math.min(4, Math.max(1, Math.floor(step)))
  const circulationDepartments = defaultCirculationDepartments()
  const circIn =
    w.circulationDepartments && typeof w.circulationDepartments === 'object' && !Array.isArray(w.circulationDepartments)
      ? w.circulationDepartments
      : {}
  for (const k of LEAD_PROPOSAL_CIRCULATION_DEPT_KEYS) {
    const row = circIn[k] && typeof circIn[k] === 'object' ? circIn[k] : {}
    circulationDepartments[k] = {
      comment: String(row.comment || ''),
      responsibleUserId: String(row.responsibleUserId || '').trim()
    }
  }
  const legacyDept = String(w.departmentalComments || '').trim()
  if (legacyDept && !circulationDepartments.technical.comment) {
    circulationDepartments.technical = {
      ...circulationDepartments.technical,
      comment: legacyDept
    }
  }
  return {
    currentStep: step,
    engagementQuestionnaireId: String(w.engagementQuestionnaireId || '').trim(),
    manualEngagementMandateLink: String(w.manualEngagementMandateLink || '').trim(),
    manualEngagementMandateUploadedName: String(w.manualEngagementMandateUploadedName || '').trim(),
    departmentalComments: String(w.departmentalComments || ''),
    circulationDepartments,
    signOffBy: String(w.signOffBy || '').trim(),
    submittedToClientAt:
      typeof w.submittedToClientAt === 'string' && w.submittedToClientAt.trim()
        ? w.submittedToClientAt.trim()
        : null,
    submissionNotes: String(w.submissionNotes || ''),
    workingDraftUploadedName: String(w.workingDraftUploadedName || '').trim()
  }
}

export function workflowJsonForPrisma(proposal) {
  if (!proposal || !Object.prototype.hasOwnProperty.call(proposal, 'workflow')) {
    return undefined
  }
  return sanitizeLeadProposalWorkflow(proposal.workflow)
}

export { DEFAULT_WORKFLOW }
