/**
 * Live revision signals for Management Meeting Notes (per monthKey, in-process).
 * Writers call bump after successful DB changes; SSE subscribers receive the revision.
 */

/** @type {Map<string, number>} */
const revisions = new Map()

/** @type {Map<string, Set<(revision: number) => void>>} */
const subscribers = new Map()

export function getMeetingNotesLiveRevision(monthKey) {
  if (!monthKey) return 0
  return revisions.get(String(monthKey).trim()) || 0
}

export function bumpMeetingNotesLive(monthKey) {
  const key = monthKey ? String(monthKey).trim() : ''
  if (!key) return 0
  const revision = Date.now()
  revisions.set(key, revision)
  const subs = subscribers.get(key)
  if (subs) {
    for (const send of subs) {
      try {
        send(revision)
      } catch (_) {
        /* ignore subscriber errors */
      }
    }
  }
  return revision
}

/**
 * @param {string} monthKey
 * @param {(revision: number) => void} send
 * @returns {() => void} unsubscribe
 */
export function subscribeMeetingNotesLive(monthKey, send) {
  const key = monthKey ? String(monthKey).trim() : ''
  if (!key || typeof send !== 'function') {
    return () => {}
  }
  let set = subscribers.get(key)
  if (!set) {
    set = new Set()
    subscribers.set(key, set)
  }
  set.add(send)
  return () => {
    set.delete(send)
    if (set.size === 0) {
      subscribers.delete(key)
    }
  }
}

/**
 * Resolve monthKey from mutation context for live bump.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function resolveMonthKeyForLive(prisma, ids = {}) {
  const { monthKey, monthlyNotesId, weeklyNotesId, departmentNotesId, actionItemId, commentId } =
    ids

  if (monthKey) {
    return String(monthKey).trim()
  }

  if (monthlyNotesId) {
    const row = await prisma.monthlyMeetingNotes.findUnique({
      where: { id: monthlyNotesId },
      select: { monthKey: true }
    })
    return row?.monthKey || null
  }

  if (weeklyNotesId) {
    const row = await prisma.weeklyMeetingNotes.findUnique({
      where: { id: weeklyNotesId },
      select: { monthlyNotes: { select: { monthKey: true } } }
    })
    return row?.monthlyNotes?.monthKey || null
  }

  if (departmentNotesId) {
    const row = await prisma.departmentNotes.findUnique({
      where: { id: departmentNotesId },
      select: { weeklyNotes: { select: { monthlyNotes: { select: { monthKey: true } } } } }
    })
    return row?.weeklyNotes?.monthlyNotes?.monthKey || null
  }

  if (actionItemId) {
    const row = await prisma.meetingActionItem.findUnique({
      where: { id: actionItemId },
      select: {
        monthlyNotes: { select: { monthKey: true } },
        weeklyNotes: { select: { monthlyNotes: { select: { monthKey: true } } } },
        departmentNotes: {
          select: { weeklyNotes: { select: { monthlyNotes: { select: { monthKey: true } } } } }
        }
      }
    })
    return (
      row?.monthlyNotes?.monthKey ||
      row?.weeklyNotes?.monthlyNotes?.monthKey ||
      row?.departmentNotes?.weeklyNotes?.monthlyNotes?.monthKey ||
      null
    )
  }

  if (commentId) {
    const row = await prisma.meetingComment.findUnique({
      where: { id: commentId },
      select: {
        monthlyNotes: { select: { monthKey: true } },
        departmentNotes: {
          select: { weeklyNotes: { select: { monthlyNotes: { select: { monthKey: true } } } } }
        }
      }
    })
    return (
      row?.monthlyNotes?.monthKey ||
      row?.departmentNotes?.weeklyNotes?.monthlyNotes?.monthKey ||
      null
    )
  }

  return null
}

/** @param {import('@prisma/client').PrismaClient} prisma */
export async function bumpMeetingNotesLiveFromContext(prisma, ids = {}) {
  try {
    const monthKey = await resolveMonthKeyForLive(prisma, ids)
    if (monthKey) {
      bumpMeetingNotesLive(monthKey)
    }
  } catch (e) {
    console.warn('meetingNotesLive bump failed:', e?.message || e)
  }
}
