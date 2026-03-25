/**
 * Ensures only one automated SARS monitoring run per calendar day in Africa/Johannesburg
 * (dedupes duplicate crons: e.g. app server + external VPS script, or multiple Railway instances).
 */
import { prisma } from '../_lib/prisma.js'

export function sarsDailyLeaseId() {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
  return `sars-${ymd}`
}

/**
 * @returns {{ acquired: true, id: string } | { acquired: false, id: string }}
 */
export async function tryAcquireSarsDailyLease() {
  const id = sarsDailyLeaseId()
  try {
    await prisma.sarsDailyJobLease.create({ data: { id } })
    return { acquired: true, id }
  } catch (e) {
    if (e.code === 'P2002') {
      return { acquired: false, id }
    }
    throw e
  }
}
