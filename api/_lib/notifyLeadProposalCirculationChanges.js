/**
 * Notify users when they are newly assigned as circulation "responsible person" on a lead proposal.
 * Single source of truth: called after proposal rows are persisted (email + in-app via createNotificationForUser).
 */
import { createNotificationForUser } from '../notifications.js'
import {
  LEAD_PROPOSAL_CIRCULATION_DEPT_KEYS,
  sanitizeLeadProposalWorkflow
} from './leadProposalWorkflow.js'

/** Labels aligned with ClientDetailModal LEAD_PROPOSAL_CIRCULATION_DEPARTMENTS */
const CIRCULATION_DEPT_LABELS = {
  technical: 'Technical',
  support: 'Support',
  data: 'Data',
  compliance: 'Compliance',
  businessDevelopment: 'Business Development',
  commercialAndPricing: 'Commercial and Pricing',
  legalOperationsReview: 'Legal / Operations Review',
  director: 'Director'
}

/**
 * @param {object} opts
 * @param {string} opts.leadId
 * @param {string} opts.leadName
 * @param {Array<object>} opts.proposalsIncoming – proposals as submitted by the client (must include id when updating)
 * @param {Map<string, object>} opts.previousWorkflowByProposalId – proposal id → sanitized workflow from DB before this save
 */
export async function notifyLeadProposalCirculationChanges({
  leadId,
  leadName,
  proposalsIncoming,
  previousWorkflowByProposalId
}) {
  const name = String(leadName || '').trim() || 'Lead'
  const lid = String(leadId || '').trim()
  if (!lid || !Array.isArray(proposalsIncoming)) return

  for (const proposal of proposalsIncoming) {
    if (!proposal || typeof proposal !== 'object') continue
    const pid = String(proposal.id || '').trim()
    if (!pid) continue

    const empty = sanitizeLeadProposalWorkflow({})
    const prev =
      previousWorkflowByProposalId && previousWorkflowByProposalId.has(pid)
        ? sanitizeLeadProposalWorkflow(previousWorkflowByProposalId.get(pid))
        : empty
    const next = sanitizeLeadProposalWorkflow(proposal.workflow || {})

    const prevCd = prev.circulationDepartments || {}
    const nextCd = next.circulationDepartments || {}
    const titleSafe = String(proposal.title || '').trim() || 'Untitled'

    for (const key of LEAD_PROPOSAL_CIRCULATION_DEPT_KEYS) {
      const prevId = String(prevCd[key]?.responsibleUserId || '').trim()
      const nextId = String(nextCd[key]?.responsibleUserId || '').trim()
      if (!nextId || nextId === prevId) continue

      const label = CIRCULATION_DEPT_LABELS[key] || key
      const link = `#/clients?lead=${encodeURIComponent(lid)}&tab=proposals`
      try {
        await createNotificationForUser(
          nextId,
          'system',
          `Proposal circulation: ${label}`,
          `You were assigned as responsible person for ${label} on proposal "${titleSafe}" (${name}). Open the lead Proposals tab to review and comment.`,
          link,
          {
            source: 'lead_proposal_circulation',
            leadId: lid,
            departmentKey: key,
            departmentLabel: label,
            proposalTitle: titleSafe,
            proposalId: pid
          }
        )
      } catch (e) {
        console.warn('notifyLeadProposalCirculationChanges: notification failed', { leadId: lid, nextId, key, message: e?.message })
      }
    }
  }
}
