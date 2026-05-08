const DEFAULT_WORKFLOW = Object.freeze({
  currentStep: 1,
  engagementQuestionnaireId: '',
  departmentalComments: '',
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
  return {
    currentStep: step,
    engagementQuestionnaireId: String(w.engagementQuestionnaireId || '').trim(),
    departmentalComments: String(w.departmentalComments || ''),
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
