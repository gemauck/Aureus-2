/**
 * BCEA-oriented *baseline* leave figures when no LeaveBalance row exists (or to fill a missing type).
 * Not a substitute for payroll / policy — HR Import or POST still overrides per type via DB rows.
 *
 * - Annual: min 21 consecutive days per cycle (we prorate by portion of calendar year employed).
 * - Family responsibility: 3 days per cycle (full amount if employed in that year after hire).
 * - Sick: simplified — one 30-day cycle treated like annual prorate (BCEA’s real sick cycle is 36 months).
 */

function startOfYear(year) {
  return new Date(year, 0, 1, 0, 0, 0, 0)
}

function endOfYear(year) {
  return new Date(year, 11, 31, 23, 59, 59, 999)
}

function daysInclusive(from, to) {
  if (!from || !to || from > to) return 0
  const ms = 86400000
  return Math.floor((to - from) / ms) + 1
}

/** Portion of calendar year [year] employed: 0..1 */
function employmentFractionInYear(employmentDate, year) {
  const hire = new Date(employmentDate)
  if (Number.isNaN(hire.getTime())) return 0
  const ys = startOfYear(year)
  const ye = endOfYear(year)
  const from = hire > ys ? hire : ys
  const to = ye
  const denom = daysInclusive(ys, ye)
  const num = daysInclusive(from, to)
  if (denom <= 0) return 0
  return Math.min(1, Math.max(0, num / denom))
}

export function normalizeLeaveTypeKey(raw) {
  const s = String(raw || '').toLowerCase().trim()
  if (!s) return ''
  if (s.includes('annual')) return 'annual'
  if (s.includes('sick')) return 'sick'
  if (s.includes('family') || s.includes('responsibility')) return 'family'
  if (s.includes('maternity')) return 'maternity'
  if (s.includes('paternity')) return 'paternity'
  if (s.includes('study')) return 'study'
  if (s.includes('unpaid')) return 'unpaid'
  if (s.includes('compassion')) return 'compassionate'
  if (s.includes('religious')) return 'religious'
  return s.split(/\s+/)[0] || s
}

function sumApprovedDaysForType(applications, year, typeKey) {
  if (!Array.isArray(applications)) return 0
  let sum = 0
  for (const a of applications) {
    if (!a || a.status !== 'approved') continue
    if (normalizeLeaveTypeKey(a.leaveType) !== typeKey) continue
    const sd = a.startDate ? new Date(a.startDate) : null
    if (!sd || Number.isNaN(sd.getTime())) continue
    // Count in calendar year if leave overlaps year (use stored days as approximation)
    const ed = a.endDate ? new Date(a.endDate) : sd
    const ys = startOfYear(year).getTime()
    const ye = endOfYear(year).getTime()
    if (ed.getTime() < ys || sd.getTime() > ye) continue
    const d = Number(a.days)
    if (!Number.isFinite(d)) continue
    sum += d
  }
  return Math.round(sum * 100) / 100
}

const ANNUAL_FULL = 21
const FAMILY_FULL = 3
const SICK_FULL = 30

/**
 * @param {{ id: string, name?: string|null, email?: string|null, employmentDate: Date|null }} user
 * @param {number} year
 * @param {Array} applications approved (and others filtered inside)
 */
export function buildComputedBalanceRowsForUser(user, year, applications = []) {
  if (!user?.id || !user.employmentDate) return []
  const frac = employmentFractionInYear(user.employmentDate, year)
  if (frac <= 0) return []

  const rows = []
  const base = {
    id: null,
    userId: user.id,
    employeeName: user.name || '(no name)',
    employeeEmail: user.email || '',
    year,
    source: 'computed',
    notes: 'Estimated from employment start date (BCEA-style baseline). HR can set official balances via Import or manual entry.'
  }

  const annualEnt = Math.round(ANNUAL_FULL * frac * 100) / 100
  const annualUsed = sumApprovedDaysForType(applications, year, 'annual')
  rows.push({
    ...base,
    leaveType: 'annual',
    available: Math.max(0, Math.round((annualEnt - annualUsed) * 100) / 100),
    used: annualUsed,
    balance: Math.max(0, annualEnt - annualUsed)
  })

  const familyEnt = frac > 0 ? FAMILY_FULL : 0
  const familyUsed = sumApprovedDaysForType(applications, year, 'family')
  rows.push({
    ...base,
    leaveType: 'family',
    available: Math.max(0, Math.round((familyEnt - familyUsed) * 100) / 100),
    used: familyUsed,
    balance: Math.max(0, familyEnt - familyUsed)
  })

  const sickEnt = Math.round(SICK_FULL * frac * 100) / 100
  const sickUsed = sumApprovedDaysForType(applications, year, 'sick')
  rows.push({
    ...base,
    leaveType: 'sick',
    available: Math.max(0, Math.round((sickEnt - sickUsed) * 100) / 100),
    used: sickUsed,
    balance: Math.max(0, sickEnt - sickUsed),
    notes:
      'Sick leave shown as a simplified prorated figure (BCEA uses a 36-month cycle; confirm with HR).'
  })

  return rows
}

export function mergeDbAndComputedBalances(dbRows, computedRows) {
  const byType = new Map()
  for (const r of dbRows || []) {
    byType.set(normalizeLeaveTypeKey(r.leaveType), { ...r, source: 'record' })
  }
  for (const c of computedRows || []) {
    const k = normalizeLeaveTypeKey(c.leaveType)
    if (!byType.has(k)) {
      byType.set(k, c)
    }
  }
  return [...byType.values()]
}
