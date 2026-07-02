/**
 * POST /api/projects/:id/correspondence-entries — add manual entry
 * PATCH /api/projects/:id/correspondence-entries?entryId=... — edit manual entry
 * DELETE /api/projects/:id/correspondence-entries?entryId=... — delete an entry (manual, sent, or received)
 */
import { authRequired } from '../../_lib/authRequired.js'
import { prisma } from '../../_lib/prisma.js'
import { ok, badRequest, notFound, serverError } from '../../_lib/response.js'
import { parseJsonBody } from '../../_lib/body.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { logProjectActivity, getActivityUserFromRequest } from '../../_lib/projectActivityLog.js'
import {
  assertProjectCorrespondenceEnabled,
  ensureCorrespondenceTables,
  normalizeConfidentiality,
  normalizeCorrespondenceType,
  normalizeDirection,
  parseCorrespondenceEntry,
  serializeJsonArray,
  touchThreadActivity
} from '../../_lib/projectCorrespondence.js'

function entryFieldsFromBody(body, thread, existing = null) {
  const bodyText = body.bodyText != null ? String(body.bodyText) : (body.body != null ? String(body.body) : (existing?.bodyText ?? ''))
  const direction = body.direction != null ? normalizeDirection(body.direction, 'manual') : (existing?.direction ?? 'internal')
  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : (existing?.occurredAt ?? new Date())
  const toEmails = Array.isArray(body.toEmails) ? body.toEmails : (existing ? undefined : [])
  const ccEmails = Array.isArray(body.ccEmails) ? body.ccEmails : (existing ? undefined : [])
  const attachments = Array.isArray(body.attachments) ? body.attachments : (existing ? undefined : [])
  const subject = body.subject != null ? String(body.subject).trim() : (existing?.subject ?? thread.subject)
  const followUpDate = body.followUpDate != null ? new Date(body.followUpDate) : (existing?.followUpDate ?? null)

  return {
    direction,
    correspondenceType: body.correspondenceType != null
      ? normalizeCorrespondenceType(body.correspondenceType)
      : (existing?.correspondenceType ?? 'other'),
    subject,
    bodyText: String(bodyText || ''),
    occurredAt: Number.isNaN(occurredAt?.getTime?.()) ? new Date() : occurredAt,
    ...(toEmails !== undefined ? { toEmails: serializeJsonArray(toEmails) } : {}),
    ...(ccEmails !== undefined ? { ccEmails: serializeJsonArray(ccEmails) } : {}),
    ...(attachments !== undefined ? { attachments: serializeJsonArray(attachments) } : {}),
    contactName: body.contactName != null ? String(body.contactName).trim() || null : (existing?.contactName ?? null),
    contactOrganization: body.contactOrganization != null ? String(body.contactOrganization).trim() || null : (existing?.contactOrganization ?? null),
    contactPhone: body.contactPhone != null ? String(body.contactPhone).trim() || null : (existing?.contactPhone ?? null),
    externalReference: body.externalReference != null ? String(body.externalReference).trim() || null : (existing?.externalReference ?? null),
    actionRequired: body.actionRequired != null ? String(body.actionRequired).trim() || null : (existing?.actionRequired ?? null),
    followUpDate: followUpDate && !Number.isNaN(followUpDate.getTime()) ? followUpDate : null,
    location: body.location != null ? String(body.location).trim() || null : (existing?.location ?? null),
    durationMinutes: body.durationMinutes != null ? parseInt(body.durationMinutes, 10) : (existing?.durationMinutes ?? null),
    outcome: body.outcome != null ? String(body.outcome).trim() || null : (existing?.outcome ?? null),
    confidentiality: body.confidentiality != null
      ? normalizeConfidentiality(body.confidentiality)
      : (existing?.confidentiality ?? 'standard')
  }
}

async function handler(req, res) {
  const projectId = req.params?.id
  if (!projectId) return badRequest(res, 'Project ID required')

  const userId = req.user?.sub || req.user?.id
  if (!userId) return badRequest(res, 'User not authenticated')

  const url = new URL(req.url, `http://${req.headers.host}`)
  const entryId = (url.searchParams.get('entryId') || req.query?.entryId || '').trim()

  try {
    await ensureCorrespondenceTables()
    const gate = await assertProjectCorrespondenceEnabled(projectId)
    if (!gate.ok) {
      return res.status(gate.status).json({ error: gate.error })
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req)
      const threadId = (body?.threadId && String(body.threadId).trim()) || ''
      if (!threadId) return badRequest(res, 'threadId is required')

      const thread = await prisma.projectCorrespondenceThread.findFirst({
        where: { id: threadId, projectId },
        select: { id: true, subject: true }
      })
      if (!thread) return notFound(res, 'Thread not found')

      const fields = entryFieldsFromBody(body, thread)
      const entry = await prisma.projectCorrespondenceEntry.create({
        data: {
          projectId,
          threadId,
          kind: 'manual',
          authorId: userId,
          ...fields
        },
        include: {
          author: { select: { id: true, name: true, email: true } }
        }
      })

      await touchThreadActivity(threadId, entry.occurredAt)

      const { userId: uid, userName: uName } = getActivityUserFromRequest(req)
      await logProjectActivity(prisma, {
        projectId,
        userId: uid,
        userName: uName,
        type: 'correspondence_entry_added',
        description: `Correspondence entry added to "${thread.subject}"`,
        metadata: { threadId, entryId: entry.id, kind: 'manual' }
      })

      return ok(res, { entry: parseCorrespondenceEntry(entry) })
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      if (!entryId) return badRequest(res, 'entryId query parameter is required')

      const existing = await prisma.projectCorrespondenceEntry.findFirst({
        where: { id: entryId, projectId }
      })
      if (!existing) return notFound(res, 'Entry not found')
      if (existing.kind !== 'manual') {
        return badRequest(res, 'Only manual entries can be edited')
      }

      const thread = await prisma.projectCorrespondenceThread.findFirst({
        where: { id: existing.threadId, projectId },
        select: { subject: true }
      })
      const body = await parseJsonBody(req)
      const fields = entryFieldsFromBody(body, thread || { subject: existing.subject }, existing)

      const entry = await prisma.projectCorrespondenceEntry.update({
        where: { id: entryId },
        data: fields,
        include: {
          author: { select: { id: true, name: true, email: true } }
        }
      })

      await touchThreadActivity(existing.threadId, entry.occurredAt)
      return ok(res, { entry: parseCorrespondenceEntry(entry) })
    }

    if (req.method === 'DELETE') {
      if (!entryId) return badRequest(res, 'entryId query parameter is required')

      const existing = await prisma.projectCorrespondenceEntry.findFirst({
        where: { id: entryId, projectId }
      })
      if (!existing) return notFound(res, 'Entry not found')

      const thread = await prisma.projectCorrespondenceThread.findFirst({
        where: { id: existing.threadId, projectId },
        select: { id: true, subject: true }
      })

      await prisma.projectCorrespondenceEntry.delete({ where: { id: entryId } })

      if (existing.threadId) {
        await touchThreadActivity(existing.threadId)
      }

      const { userId: uid, userName: uName } = getActivityUserFromRequest(req)
      await logProjectActivity(prisma, {
        projectId,
        userId: uid,
        userName: uName,
        type: 'correspondence_entry_deleted',
        description: `Correspondence entry deleted from "${thread?.subject || 'matter'}"`,
        metadata: { threadId: existing.threadId, entryId, kind: existing.kind }
      })

      return ok(res, { deleted: true, entryId })
    }

    return res.status(405).setHeader('Allow', 'POST, PATCH, PUT, DELETE').json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('correspondence-entries:', e)
    return serverError(res, 'Failed to update correspondence entry', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
