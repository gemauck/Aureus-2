/** Heading is stored as the first `Heading: …` line inside JobCard.otherComments (no DB column). */

export const JOB_CARD_HEADING_PREFIX = 'Heading:'

export function extractHeadingFromOtherComments(rawComments) {
  if (!rawComments || typeof rawComments !== 'string') return ''
  const line = rawComments
    .split('\n')
    .find((entry) => typeof entry === 'string' && entry.trim().startsWith(JOB_CARD_HEADING_PREFIX))
  return line ? line.slice(JOB_CARD_HEADING_PREFIX.length).trim() : ''
}

/**
 * @param {string|null|undefined} rawComments
 * @param {string|null|undefined} heading - when `undefined`, comments are unchanged; when `''`, heading line is removed
 */
export function mergeHeadingIntoOtherComments(rawComments, heading) {
  if (heading === undefined) {
    return rawComments != null ? String(rawComments) : ''
  }
  const withoutHeading = String(rawComments ?? '')
    .split('\n')
    .filter((line) => line && !String(line).trim().startsWith(JOB_CARD_HEADING_PREFIX))
  const headingLine = heading != null ? String(heading).trim() : ''
  const lines = [...withoutHeading]
  if (headingLine) {
    lines.unshift(`${JOB_CARD_HEADING_PREFIX} ${headingLine}`)
  }
  return lines.filter(Boolean).join('\n')
}

/**
 * Single source of truth for persisting heading on create/update.
 * @returns {string|undefined} `undefined` when neither comments nor heading should change
 */
export function finalizeJobCardOtherCommentsForSave({
  otherComments,
  heading,
  existingOtherComments
}) {
  if (otherComments === undefined && heading === undefined) {
    return undefined
  }

  const base =
    otherComments !== undefined
      ? String(otherComments ?? '')
      : String(existingOtherComments ?? '')

  if (heading !== undefined) {
    return mergeHeadingIntoOtherComments(base, heading)
  }

  if (otherComments !== undefined) {
    const extracted = extractHeadingFromOtherComments(base)
    if (extracted) {
      return mergeHeadingIntoOtherComments(base, extracted)
    }
    return base
  }

  return mergeHeadingIntoOtherComments(base, heading)
}

/** Customer sign-off lines merged into `otherComments` on save (no dedicated DB columns). */
const CUSTOMER_SIGNOFF_LINE_PREFIXES = [
  'Customer:',
  'Position:',
  'Feedback:',
  'Signature:'
]

/** @returns {{ name: string, position: string, feedback: string, signatureLabel: string }} */
export function parseCustomerSignoffFromOtherComments(rawComments) {
  const customer = { name: '', position: '', feedback: '', signatureLabel: '' }
  for (const line of String(rawComments || '').split('\n')) {
    const t = line.trim()
    if (!t) continue
    if (t.startsWith('Customer:')) {
      customer.name = t.slice('Customer:'.length).trim()
      continue
    }
    if (t.startsWith('Position:')) {
      customer.position = t.slice('Position:'.length).trim()
      continue
    }
    if (t.startsWith('Feedback:')) {
      customer.feedback = t.slice('Feedback:'.length).trim()
      continue
    }
    if (t.startsWith('Signature:')) {
      customer.signatureLabel = t.slice('Signature:'.length).trim()
      continue
    }
  }
  return customer
}

/** Remove merged customer sign-off lines; keeps heading, project, and technician notes. */
export function stripCustomerSignoffLinesFromComments(rawComments) {
  const kept = []
  for (const line of String(rawComments || '').split('\n')) {
    const t = line.trim()
    if (!t) continue
    if (CUSTOMER_SIGNOFF_LINE_PREFIXES.some((prefix) => t.startsWith(prefix))) continue
    kept.push(line)
  }
  return kept.join('\n').trim()
}

/** @param {unknown} photos */
export function extractSignatureDataUrlFromPhotos(photos) {
  let arr = photos
  if (typeof photos === 'string' && photos.trim()) {
    try {
      arr = JSON.parse(photos)
    } catch {
      return ''
    }
  }
  if (!Array.isArray(arr)) return ''
  const hit = arr.find(
    (p) =>
      p &&
      typeof p === 'object' &&
      p.kind === 'signature' &&
      typeof p.url === 'string' &&
      p.url.trim()
  )
  return hit ? hit.url.trim() : ''
}

/**
 * Append customer sign-off lines once (strips any prior customer lines from `otherComments` first).
 */
export function mergeCustomerSignoffIntoOtherComments({
  otherComments,
  customerName,
  customerTitle,
  customerPosition,
  customerFeedback,
  hasSignature
}) {
  const base = stripCustomerSignoffLinesFromComments(
    otherComments != null ? String(otherComments) : ''
  )
  const pos = customerTitle || customerPosition
  const hasCustomer =
    customerName ||
    pos ||
    customerFeedback ||
    hasSignature
  if (!hasCustomer) return base
  return [
    base,
    customerName ? `Customer: ${customerName}` : '',
    pos ? `Position: ${pos}` : '',
    customerFeedback ? `Feedback: ${customerFeedback}` : '',
    hasSignature ? 'Signature: [Captured]' : ''
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Resolved customer sign-off for display/PDF (API fields + merged `otherComments` lines + photos).
 * @param {Record<string, unknown>|null|undefined} jobCard
 */
export function resolveCustomerSignoffFields(jobCard) {
  const parsed = parseCustomerSignoffFromOtherComments(jobCard?.otherComments)
  const trim = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : '')
  const signatureFromPhotos = extractSignatureDataUrlFromPhotos(jobCard?.photos)
  const signatureFromField =
    typeof jobCard?.customerSignature === 'string' &&
    jobCard.customerSignature.trim().startsWith('data:image')
      ? jobCard.customerSignature.trim()
      : ''
  return {
    name: trim(jobCard?.customerName) || parsed.name,
    position: trim(jobCard?.customerTitle) || trim(jobCard?.customerPosition) || parsed.position,
    feedback: trim(jobCard?.customerFeedback) || parsed.feedback,
    signatureLabel: parsed.signatureLabel,
    signatureDataUrl: signatureFromField || signatureFromPhotos
  }
}

/** @param {ReturnType<typeof resolveCustomerSignoffFields>} signoff */
export function hasCustomerSignoffContent(signoff) {
  if (!signoff) return false
  return !!(
    signoff.name ||
    signoff.position ||
    signoff.feedback ||
    signoff.signatureLabel ||
    signoff.signatureDataUrl
  )
}

/** Attach `heading` and parsed customer sign-off for API responses (list/detail/create/update). */
export function withComputedJobCardHeading(jobCard) {
  if (!jobCard || typeof jobCard !== 'object') return jobCard
  const fromComments = extractHeadingFromOtherComments(jobCard.otherComments)
  const explicit =
    jobCard.heading != null && String(jobCard.heading).trim() !== ''
      ? String(jobCard.heading).trim()
      : ''
  const parsed = parseCustomerSignoffFromOtherComments(jobCard.otherComments)
  const signatureFromPhotos = extractSignatureDataUrlFromPhotos(jobCard.photos)
  return {
    ...jobCard,
    heading: explicit || fromComments || '',
    customerName: parsed.name,
    customerTitle: parsed.position,
    customerFeedback: parsed.feedback,
    customerSignature: signatureFromPhotos
  }
}
