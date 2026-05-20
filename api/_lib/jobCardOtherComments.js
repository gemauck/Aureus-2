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

/** Attach `heading` for API responses (list/detail/create/update). */
export function withComputedJobCardHeading(jobCard) {
  if (!jobCard || typeof jobCard !== 'object') return jobCard
  const fromComments = extractHeadingFromOtherComments(jobCard.otherComments)
  const explicit =
    jobCard.heading != null && String(jobCard.heading).trim() !== ''
      ? String(jobCard.heading).trim()
      : ''
  return {
    ...jobCard,
    heading: explicit || fromComments || ''
  }
}
