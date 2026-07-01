/**
 * POST /api/projects/:id/correspondence-threads — create thread with optional first entry
 */
import { authRequired } from '../../_lib/authRequired.js'
import { prisma } from '../../_lib/prisma.js'
import { ok, badRequest, created, serverError } from '../../_lib/response.js'
import { parseJsonBody } from '../../_lib/body.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { logProjectActivity, getActivityUserFromRequest } from '../../_lib/projectActivityLog.js'
import {
  assertProjectCorrespondenceEnabled,
  ensureCorrespondenceTables,
  generateCorrespondenceRequestNumber,
  normalizeConfidentiality,
  normalizeCorrespondenceStatus,
  normalizeCorrespondenceType,
  normalizeDirection,
  parseCorrespondenceEntry,
  parseCorrespondenceThread,
  serializeJsonArray,
  touchThreadActivity
} from '../../_lib/projectCorrespondence.js'

function buildEntryData({ projectId, threadId, subject, userId, entryPayload, now }) {
  if (!entryPayload || typeof entryPayload !== 'object') return null
  const bodyText = typeof entryPayload.bodyText === 'string' ? entryPayload.bodyText : (entryPayload.body || '')
  const direction = normalizeDirection(entryPayload.direction, 'manual')
  const occurredAt = entryPayload.occurredAt ? new Date(entryPayload.occurredAt) : now
  const toEmails = Array.isArray(entryPayload.toEmails) ? entryPayload.toEmails : []
  const ccEmails = Array.isArray(entryPayload.ccEmails) ? entryPayload.ccEmails : []
  const attachments = Array.isArray(entryPayload.attachments) ? entryPayload.attachments : []
  const followUpDate = entryPayload.followUpDate ? new Date(entryPayload.followUpDate) : null

  return {
    projectId,
    threadId,
    kind: 'manual',
    direction,
    correspondenceType: normalizeCorrespondenceType(entryPayload.correspondenceType),
    subject: (entryPayload.subject && String(entryPayload.subject).trim()) || subject,
    bodyText: String(bodyText || ''),
    occurredAt: Number.isNaN(occurredAt.getTime()) ? now : occurredAt,
    authorId: userId,
    toEmails: serializeJsonArray(toEmails),
    ccEmails: serializeJsonArray(ccEmails),
    contactName: entryPayload.contactName ? String(entryPayload.contactName).trim() : null,
    contactOrganization: entryPayload.contactOrganization ? String(entryPayload.contactOrganization).trim() : null,
    contactPhone: entryPayload.contactPhone ? String(entryPayload.contactPhone).trim() : null,
    externalReference: entryPayload.externalReference ? String(entryPayload.externalReference).trim() : null,
    actionRequired: entryPayload.actionRequired ? String(entryPayload.actionRequired).trim() : null,
    followUpDate: followUpDate && !Number.isNaN(followUpDate.getTime()) ? followUpDate : null,
    location: entryPayload.location ? String(entryPayload.location).trim() : null,
    durationMinutes: entryPayload.durationMinutes != null ? parseInt(entryPayload.durationMinutes, 10) : null,
    outcome: entryPayload.outcome ? String(entryPayload.outcome).trim() : null,
    confidentiality: normalizeConfidentiality(entryPayload.confidentiality),
    attachments: serializeJsonArray(attachments)
  }
}

async function handler(req, res) {
  const projectId = req.params?.id
  if (!projectId) return badRequest(res, 'Project ID required')
  if (req.method !== 'POST') {
    return res.status(405).setHeader('Allow', 'POST').json({ error: 'Method not allowed' })
  }

  const userId = req.user?.sub || req.user?.id
  if (!userId) return badRequest(res, 'User not authenticated')

  try {
    await ensureCorrespondenceTables()
    const gate = await assertProjectCorrespondenceEnabled(projectId)
    if (!gate.ok) {
      return res.status(gate.status).json({ error: gate.error })
    }

    const body = await parseJsonBody(req)
    const subject = (body?.subject && String(body.subject).trim()) ? String(body.subject).trim() : 'Correspondence'
    const requestNumber = generateCorrespondenceRequestNumber(new Date().getFullYear())
    const now = new Date()

    const thread = await prisma.projectCorrespondenceThread.create({
      data: {
        projectId,
        subject,
        requestNumber,
        correspondenceType: normalizeCorrespondenceType(body.correspondenceType),
        status: normalizeCorrespondenceStatus(body.status),
        counterparty: body.counterparty ? String(body.counterparty).trim() : null,
        externalReference: body.externalReference ? String(body.externalReference).trim() : null,
        summary: body.summary ? String(body.summary).trim() : null,
        createdById: userId,
        lastActivityAt: now
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } }
      }
    })

    let firstEntry = null
    const entryPayload = body?.entry || body?.firstEntry || null
    const entryData = buildEntryData({
      projectId,
      threadId: thread.id,
      subject,
      userId,
      entryPayload,
      now
    })
    if (entryData) {
      firstEntry = await prisma.projectCorrespondenceEntry.create({
        data: entryData,
        include: {
          author: { select: { id: true, name: true, email: true } }
        }
      })
      await touchThreadActivity(thread.id, firstEntry.occurredAt)
    }

    const { userId: uid, userName: uName } = getActivityUserFromRequest(req)
    await logProjectActivity(prisma, {
      projectId,
      userId: uid,
      userName: uName,
      type: 'correspondence_thread_created',
      description: `Correspondence thread "${subject}" created`,
      metadata: { threadId: thread.id, requestNumber }
    })

    return created(res, {
      thread: parseCorrespondenceThread(thread),
      entry: firstEntry ? parseCorrespondenceEntry(firstEntry) : null
    })
  } catch (e) {
    console.error('POST correspondence-threads:', e)
    return serverError(res, 'Failed to create correspondence thread', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
