/**
 * Canonical checklist-derived subfolder templates for strict sorter mode.
 * Derived from DocumentCollectionChecklist / Exxaro template definitions.
 */

import { folderNameForFileNum } from './classify.js'

export const CHECKLIST_SUBFOLDERS = {
  1: [
    'Mining Right',
    'CIPC Documents',
    'Diesel Refund Registration',
    'VAT Registration',
    'Title Deed / Lease Agreement',
    'Environmental Authorisations',
    'Summary of Operations and Activities',
    'Descriptions of Specialised Data Systems',
    'File 1 Explanation',
  ],
  2: [
    'Fuel Supply Contract',
    'Mining Contractors Contracts',
    'Sale of Product Contracts',
    'File 2 Explanation',
  ],
  3: [
    'Tank and Pump Configuration',
    'Diagram of Fuel System',
    'Photos of meter',
    'Delivery Notes',
    'Invoices',
    'Remittance Advices',
    'Proof of payments',
    'Tank Reconcilliations',
    'Photos of Meter Readings',
    'Meter Readings',
    'Calibration Certificates',
    'Document',
  ],
  4: [
    'Asset Register - Combined Assets',
    'Asset Register - Mining Assets',
    'Asset Register - Non Mining Assets',
    'Driver List',
    'File 4 Explanation',
  ],
  5: [
    'Description and Literature of FMS',
    'FMS Raw Data',
    'Detailed Fuel Refund Report',
    'Fuel Refund Logbook Per Asset',
    'Claim Comparison [if applicable]',
    'File 5 Explanation',
  ],
  6: [
    'Monthly Survey Reports',
    'Production Reports',
    'Asset Activity Reports',
    'Asset Tagging Reports',
    'Diesel Cost Component',
    'Sales of Coal',
    'Weighbridge Data',
    'Contractor Invoices',
    'Contractor Remittances',
    'Contractor Proof of payment',
    'File 6 Explanation',
  ],
  7: [
    'Annual Financial Statements',
    'Management Accounts',
    'Any deviations (theft, loss etc)',
    'Fuel Caps Exceeded',
    'VAT 201 - Monthly',
    'File 7 Explanation',
  ],
}

export function normalizeTokenText(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sanitizeSubfolderName(name) {
  return String(name || '')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
}

function scoreSubfolderMatch(pathTokenText, subfolder) {
  const tokens = normalizeTokenText(subfolder).split(' ').filter(Boolean)
  if (!tokens.length) return 0
  let score = 0
  for (const t of tokens) {
    if (pathTokenText.includes(` ${t} `)) score += t.length <= 3 ? 1 : 2
  }
  return score
}

/**
 * Pick strict checklist subfolder; if no signal, keep in "Unsorted".
 */
export function resolveChecklistSubfolder(fileNum, originalPath, fallback = 'Unsorted') {
  const list = CHECKLIST_SUBFOLDERS[fileNum] || []
  const tokenText = ` ${normalizeTokenText(originalPath)} `
  let best = null
  let bestScore = 0
  for (const s of list) {
    const score = scoreSubfolderMatch(tokenText, s)
    if (score > bestScore) {
      best = s
      bestScore = score
    }
  }
  if (!best || bestScore <= 0) {
    return { subFolderName: fallback, subFolderReason: 'fallback-unsorted', subFolderConfidence: 0 }
  }
  return {
    subFolderName: sanitizeSubfolderName(best),
    subFolderReason: `checklist-match:${best}`,
    subFolderConfidence: Math.min(1, 0.45 + bestScore * 0.08),
  }
}

export function folderAndSubfolderPath(fileNum, subFolderName) {
  return `${folderNameForFileNum(fileNum)}/${sanitizeSubfolderName(subFolderName || 'Unsorted')}`
}

