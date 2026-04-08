/** Max stored JSON length on JobCard (PostgreSQL TEXT is unbounded; keep responses/API payloads reasonable). */
const MAX_SNAPSHOT_CHARS = 900_000

/**
 * @param {object} payload
 * @returns {string}
 */
export function serializeSafetyCultureSnapshot(payload) {
  if (!payload || typeof payload !== 'object') return '{}'
  let json = JSON.stringify(payload)
  if (json.length <= MAX_SNAPSHOT_CHARS) return json

  if (Array.isArray(payload.answers) && payload.answers.length > 0) {
    const { answers, ...rest } = payload
    const trimmed = {
      ...rest,
      answersOmittedDueToSize: true,
      answersCount: answers.length
    }
    json = JSON.stringify(trimmed)
  }

  if (json.length <= MAX_SNAPSHOT_CHARS) return json

  return JSON.stringify({
    version: payload.version,
    source: payload.source,
    capturedAt: payload.capturedAt,
    id: payload.id,
    _truncated: true,
    approximateChars: json.length,
    note: 'Snapshot exceeded max size; import with include_snapshot false or include_answers false, or smaller batches.'
  })
}
