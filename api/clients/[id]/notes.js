/**
 * GET /api/clients/:id/notes — list notes for this client (ClientNote table)
 * POST /api/clients/:id/notes — create a new client note
 */
import { authRequired } from '../../_lib/authRequired.js'
import { prisma } from '../../_lib/prisma.js'
import { ok, badRequest, created, serverError } from '../../_lib/response.js'
import { parseJsonBody } from '../../_lib/body.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { logClientActivity, getActivityUserFromRequest } from '../../_lib/clientActivityLog.js'
import { syncMentionsFromEntityNote } from '../../_lib/noteMentions.js'

function parseClientNote(note) {
  const parsed = { ...note }
  if (typeof parsed.tags === 'string' && parsed.tags) {
    try {
      parsed.tags = JSON.parse(parsed.tags)
    } catch (_) {
      parsed.tags = []
    }
  } else if (!parsed.tags) {
    parsed.tags = []
  }
  if (note.author) {
    parsed.author = { id: note.author.id, name: note.author.name, email: note.author.email }
  } else {
    parsed.author = parsed.authorId ? { id: parsed.authorId, name: null, email: null } : null
  }
  parsed.source = 'client'
  return parsed
}

async function handler(req, res) {
  const clientId = req.params?.id
  if (!clientId) {
    return badRequest(res, 'Client ID required')
  }

  const userId = req.user?.sub || req.user?.id
  if (!userId) {
    return badRequest(res, 'User not authenticated')
  }

  if (req.method === 'GET') {
    try {
      const notes = await prisma.clientNote.findMany({
        where: { clientId },
        include: {
          author: { select: { id: true, name: true, email: true } }
        },
        orderBy: { updatedAt: 'desc' }
      })
      const list = notes.map(parseClientNote)
      return ok(res, { notes: list })
    } catch (e) {
      console.error('Error fetching client notes:', e)
      return serverError(res, 'Failed to load notes', e.message)
    }
  }

  if (req.method === 'POST') {
    try {
      const body = await parseJsonBody(req)
      const title = (body?.title && String(body.title).trim()) ? String(body.title).trim() : 'Untitled Note'
      const content = typeof body?.content === 'string' ? body.content : ''
      const tags = Array.isArray(body?.tags) ? body.tags : []

      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { id: true }
      })
      if (!client) {
        return badRequest(res, 'Client not found')
      }

      const note = await prisma.clientNote.create({
        data: {
          clientId,
          title,
          content,
          tags: JSON.stringify(tags),
          authorId: userId
        },
        include: {
          author: { select: { id: true, name: true, email: true } }
        }
      })
      await syncMentionsFromEntityNote({
        entityType: 'client',
        entityNoteId: note.id,
        title: note.title,
        content: note.content,
        tags,
        authorId: userId,
        authorName: note.author?.name || null,
        clientId
      })
      const { userId: uid, userName: uName } = getActivityUserFromRequest(req)
      await logClientActivity(prisma, {
        clientId,
        userId: uid,
        userName: uName,
        type: 'note_created',
        description: `Note "${title}" created`,
        metadata: { noteId: note.id, noteTitle: title, source: 'client' }
      })
      const parsed = parseClientNote(note)
      return created(res, { note: parsed })
    } catch (e) {
      console.error('Error creating client note:', e)
      return serverError(res, 'Failed to create note', e.message)
    }
  }

  return res.status(405).setHeader('Allow', 'GET, POST').json({ error: 'Method not allowed' })
}

export default withHttp(withLogging(authRequired(handler)))
