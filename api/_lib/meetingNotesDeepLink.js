/**
 * Deep links for Management Meeting Notes (Teams → management → meeting-notes).
 * Hash format: #/teams/management?tab=meeting-notes&team=management&month=&week=&…
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ monthlyNotesId?: string|null, departmentNotesId?: string|null, actionItemId?: string|null }} ids
 * @returns {Promise<{ monthKey: string|null, weekKey: string|null, departmentId: string|null, monthlyNotesId: string|null, departmentNotesId: string|null, actionItemId: string|null }>}
 */
export async function resolveMeetingNotesLinkContext(prisma, ids) {
  const ctx = {
    monthKey: null,
    weekKey: null,
    departmentId: null,
    monthlyNotesId: ids.monthlyNotesId || null,
    departmentNotesId: ids.departmentNotesId || null,
    actionItemId: ids.actionItemId || null
  };

  if (ids.monthlyNotesId) {
    const m = await prisma.monthlyMeetingNotes.findUnique({
      where: { id: String(ids.monthlyNotesId) },
      select: { monthKey: true }
    });
    if (m?.monthKey) ctx.monthKey = m.monthKey;
    return ctx;
  }

  if (ids.departmentNotesId) {
    const d = await prisma.departmentNotes.findUnique({
      where: { id: String(ids.departmentNotesId) },
      select: {
        departmentId: true,
        weeklyNotes: {
          select: {
            weekKey: true,
            monthlyNotes: { select: { monthKey: true } }
          }
        }
      }
    });
    if (d) {
      ctx.departmentId = d.departmentId || null;
      ctx.weekKey = d.weeklyNotes?.weekKey || null;
      ctx.monthKey = d.weeklyNotes?.monthlyNotes?.monthKey || null;
    }
    return ctx;
  }

  if (ids.actionItemId) {
    const a = await prisma.meetingActionItem.findUnique({
      where: { id: String(ids.actionItemId) },
      select: {
        monthlyNotesId: true,
        weeklyNotesId: true,
        departmentNotesId: true,
        monthlyNotes: { select: { monthKey: true, id: true } },
        weeklyNotes: {
          select: {
            weekKey: true,
            monthlyNotes: { select: { monthKey: true, id: true } }
          }
        },
        departmentNotes: {
          select: {
            departmentId: true,
            weeklyNotes: {
              select: {
                weekKey: true,
                monthlyNotes: { select: { monthKey: true, id: true } }
              }
            }
          }
        }
      }
    });
    if (a) {
      if (a.monthlyNotes?.monthKey) ctx.monthKey = a.monthlyNotes.monthKey;
      if (a.monthlyNotes?.id) ctx.monthlyNotesId = ctx.monthlyNotesId || a.monthlyNotes.id;
      if (a.weeklyNotes) {
        ctx.weekKey = a.weeklyNotes.weekKey || ctx.weekKey;
        if (!ctx.monthKey && a.weeklyNotes.monthlyNotes?.monthKey) {
          ctx.monthKey = a.weeklyNotes.monthlyNotes.monthKey;
        }
        if (!ctx.monthlyNotesId && a.weeklyNotes.monthlyNotes?.id) {
          ctx.monthlyNotesId = a.weeklyNotes.monthlyNotes.id;
        }
      }
      if (a.departmentNotes) {
        ctx.departmentId = a.departmentNotes.departmentId || ctx.departmentId;
        const w = a.departmentNotes.weeklyNotes;
        if (w) {
          ctx.weekKey = ctx.weekKey || w.weekKey || null;
          if (!ctx.monthKey && w.monthlyNotes?.monthKey) ctx.monthKey = w.monthlyNotes.monthKey;
          if (!ctx.monthlyNotesId && w.monthlyNotes?.id) ctx.monthlyNotesId = w.monthlyNotes.id;
        }
      }
      ctx.departmentNotesId = ctx.departmentNotesId || a.departmentNotesId || null;
      ctx.actionItemId = ids.actionItemId;
    }
    return ctx;
  }

  return ctx;
}

/**
 * @param {Awaited<ReturnType<typeof resolveMeetingNotesLinkContext>>} ctx
 * @param {string|null|undefined} commentId
 */
export function buildMeetingNotesAppLink(ctx, commentId) {
  const q = new URLSearchParams();
  q.set('tab', 'meeting-notes');
  q.set('team', 'management');
  if (ctx.monthKey) q.set('month', String(ctx.monthKey));
  if (ctx.weekKey) q.set('week', String(ctx.weekKey));
  if (ctx.departmentId) q.set('department', String(ctx.departmentId));
  if (ctx.monthlyNotesId) q.set('monthlyNotesId', String(ctx.monthlyNotesId));
  if (ctx.departmentNotesId) q.set('departmentNotesId', String(ctx.departmentNotesId));
  if (ctx.actionItemId) q.set('actionItemId', String(ctx.actionItemId));
  if (commentId) q.set('meetingCommentId', String(commentId));
  return `#/teams/management?${q.toString()}`;
}
