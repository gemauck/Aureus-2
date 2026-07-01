/**
 * GET /api/projects/:id/correspondence — list threads + inbox settings
 * PATCH /api/projects/:id/correspondence — update project inbox name (slug) or full email
 */
import { authRequired } from '../../_lib/authRequired.js'
import { prisma } from '../../_lib/prisma.js'
import { ok, badRequest, serverError } from '../../_lib/response.js'
import { parseJsonBody } from '../../_lib/body.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import {
  assertProjectCorrespondenceEnabled,
  CORRESPONDENCE_TYPES,
  CORRESPONDENCE_STATUSES,
  CONFIDENTIALITY_LEVELS,
  ensureCorrespondenceTables,
  ensureProjectCorrespondenceInboundEmail,
  getCorrespondenceInboundDomain,
  isValidEmail,
  parseCorrespondenceThread,
  setProjectCorrespondenceInboxSlug,
  withCorrespondenceSchema
} from '../../_lib/projectCorrespondence.js'

function inboxSettingsPayload(project, inboxEmail) {
  return {
    correspondenceInboundEmail: inboxEmail,
    correspondenceInboxSlug: project?.correspondenceInboxSlug || null,
    correspondenceInboxDomain: getCorrespondenceInboundDomain(),
    types: CORRESPONDENCE_TYPES,
    statuses: CORRESPONDENCE_STATUSES,
    confidentialityLevels: CONFIDENTIALITY_LEVELS
  }
}

async function handler(req, res) {
  const projectId = req.params?.id
  if (!projectId) return badRequest(res, 'Project ID required')

  try {
    const ensured = await ensureCorrespondenceTables()
    if (!ensured.ok) {
      return serverError(res, 'Correspondence database schema is not ready', ensured.error)
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const gate = await assertProjectCorrespondenceEnabled(projectId)
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error })

      const body = await parseJsonBody(req)
      const slugRaw = body?.correspondenceInboxSlug ?? body?.inboxSlug ?? body?.inboxName ?? body?.name

      if (slugRaw !== undefined && slugRaw !== null) {
        const result = await setProjectCorrespondenceInboxSlug(projectId, slugRaw)
        if (!result.ok) {
          return res.status(result.status).json({ error: result.error })
        }
        return ok(res, inboxSettingsPayload(
          { correspondenceInboxSlug: result.correspondenceInboxSlug },
          result.correspondenceInboundEmail
        ))
      }

      const raw = body?.correspondenceInboundEmail ?? body?.inboxEmail
      if (raw === undefined || raw === null) {
        return badRequest(res, 'inboxName or correspondenceInboundEmail is required')
      }
      const trimmed = String(raw).trim().toLowerCase()
      if (trimmed && !isValidEmail(trimmed)) {
        return badRequest(res, 'Invalid email address')
      }
      const emailToSave = trimmed || (await ensureProjectCorrespondenceInboundEmail(projectId))
      await prisma.project.update({
        where: { id: projectId },
        data: { correspondenceInboundEmail: emailToSave, correspondenceInboxSlug: null }
      })
      return ok(res, inboxSettingsPayload({ correspondenceInboxSlug: null }, emailToSave))
    }

    if (req.method !== 'GET') {
      return res.status(405).setHeader('Allow', 'GET, PATCH, PUT').json({ error: 'Method not allowed' })
    }

    const gate = await assertProjectCorrespondenceEnabled(projectId)
    if (!gate.ok) {
      return res.status(gate.status).json({ error: gate.error })
    }

    const inboxEmail =
      gate.project?.correspondenceInboundEmail ||
      (await ensureProjectCorrespondenceInboundEmail(projectId))

    const threads = await withCorrespondenceSchema(() =>
      prisma.projectCorrespondenceThread.findMany({
        where: { projectId },
        orderBy: { lastActivityAt: 'desc' },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          entries: {
            orderBy: { occurredAt: 'desc' },
            take: 1,
            select: {
              id: true,
              kind: true,
              direction: true,
              correspondenceType: true,
              subject: true,
              bodyText: true,
              occurredAt: true,
              createdAt: true
            }
          },
          _count: { select: { entries: true } }
        }
      })
    )

    const emailThreadIds = new Set(
      (
        await withCorrespondenceSchema(() =>
          prisma.projectCorrespondenceEntry.findMany({
            where: { projectId, kind: { in: ['sent', 'received'] } },
            select: { threadId: true },
            distinct: ['threadId']
          })
        )
      ).map((r) => r.threadId)
    )

    const list = threads.map((t) => {
      const latest = t.entries?.[0] || null
      const base = parseCorrespondenceThread(t)
      return {
        ...base,
        entryCount: t._count?.entries || 0,
        hasEmail: emailThreadIds.has(t.id),
        latestPreview: latest
          ? {
              kind: latest.kind,
              direction: latest.direction,
              correspondenceType: latest.correspondenceType,
              subject: latest.subject,
              bodyText: (latest.bodyText || '').slice(0, 200),
              occurredAt: latest.occurredAt || latest.createdAt
            }
          : null
      }
    })

    return ok(res, {
      threads: list,
      ...inboxSettingsPayload(gate.project, inboxEmail)
    })
  } catch (e) {
    console.error('correspondence:', e)
    return serverError(res, 'Failed to load correspondence', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
