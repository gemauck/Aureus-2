/**
 * GET /api/clients/:id/notes/:noteId — get one client note
 * PUT /api/clients/:id/notes/:noteId — update client note
 * DELETE /api/clients/:id/notes/:noteId — delete client note
 */
import { authRequired } from '../../../_lib/authRequired.js'
import { prisma } from '../../../_lib/prisma.js'
import { ok, badRequest, notFound, serverError } from '../../../_lib/response.js'
import { parseJsonBody } from '../../../_lib/body.js'
import { withHttp } from '../../../_lib/withHttp.js'
import { withLogging } from '../../../_lib/logger.js'
import { logClientActivity, getActivityUserFromRequest } from '../../../_lib/clientActivityLog.js'
import { syncMentionsFromEntityNote } from '../../../_lib/noteMentions.js'

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
  const noteId = req.params?.noteId
  if (!clientId || !noteId) {
    return badRequest(res, 'Client ID and Note ID required')
  }

  if (req.method === 'GET') {
    try {
      const note = await prisma.clientNote.findFirst({
        where: { id: noteId, clientId },
        include: {
          author: { select: { id: true, name: true, email: true } }
        }
      })
      if (!note) return notFound(res, 'Note not found')
      return ok(res, { note: parseClientNote(note) })
    } catch (e) {
      console.error('Error fetching client note:', e)
      return serverError(res, 'Failed to load note', e.message)
    }
  }

  if (req.method === 'PUT') {
    try {
      const existing = await prisma.clientNote.findFirst({
        where: { id: noteId, clientId }
      })
      if (!existing) return notFound(res, 'Note not found')

      const body = await parseJsonBody(req)
      const title = (body?.title != null && String(body.title).trim()) ? String(body.title).trim() : existing.title
      const content = typeof body?.content === 'string' ? body.content : existing.content
      const tags = Array.isArray(body?.tags) ? body.tags : (typeof existing.tags === 'string' ? (() => { try { return JSON.parse(existing.tags) } catch { return [] } })() : [])

      const note = await prisma.clientNote.update({
        where: { id: noteId },
        data: {
          title,
          content,
          tags: JSON.stringify(tags)
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
        authorId: note.authorId || existing.authorId,
        authorName: note.author?.name || null,
        clientId
      })
      const changes = []
      if (existing.title !== title) {
        changes.push(`Title changed from "${existing.title || ''}" to "${title || ''}"`)
      }
      if (existing.content !== content) {
        const oldLen = (existing.content || '').length
        const newLen = (content || '').length
        if (oldLen !== newLen) {
          changes.push(`Content edited (${oldLen} → ${newLen} characters)`)
        } else {
          changes.push('Content edited')
        }
      }
      const existingTags = typeof existing.tags === 'string' ? (() => { try { return JSON.parse(existing.tags) } catch { return [] } })() : []
      const tagsEqual = existingTags.length === tags.length && tags.every((t, i) => String(existingTags[i] || '') === String(t || ''))
      if (!tagsEqual) {
        changes.push('Tags updated')
      }
      const description = changes.length > 0
        ? `Note "${title}" updated: ${changes.join('; ')}`
        : `Note "${title}" updated`
      const { userId: uid, userName: uName } = getActivityUserFromRequest(req)
      await logClientActivity(prisma, {
        clientId,
        userId: uid,
        userName: uName,
        type: 'note_updated',
        description,
        metadata: { noteId: note.id, noteTitle: title, source: 'client', changes }
      })
      return ok(res, { note: parseClientNote(note) })
    } catch (e) {
      console.error('Error updating client note:', e)
      return serverError(res, 'Failed to update note', e.message)
    }
  }

  if (req.method === 'DELETE') {
    try {
      const existing = await prisma.clientNote.findFirst({
        where: { id: noteId, clientId }
      })
      if (!existing) return notFound(res, 'Note not found')

      const noteTitle = existing.title || 'Untitled'
      await prisma.clientNote.delete({
        where: { id: noteId }
      })
      await syncMentionsFromEntityNote({
        entityType: 'client',
        entityNoteId: noteId,
        title: '',
        content: '',
        tags: [],
        authorId: existing.authorId,
        authorName: null,
        clientId
      })
      const { userId: uid, userName: uName } = getActivityUserFromRequest(req)
      await logClientActivity(prisma, {
        clientId,
        userId: uid,
        userName: uName,
        type: 'note_deleted',
        description: `Note "${noteTitle}" deleted`,
        metadata: { noteId, noteTitle, source: 'client' }
      })
      return ok(res, { deleted: true })
    } catch (e) {
      console.error('Error deleting client note:', e)
      return serverError(res, 'Failed to delete note', e.message)
    }
  }

  return res.status(405).setHeader('Allow', 'GET, PUT, DELETE').json({ error: 'Method not allowed' })
}

export default withHttp(withLogging(authRequired(handler)))
