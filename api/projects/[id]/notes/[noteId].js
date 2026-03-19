/**
 * GET /api/projects/:id/notes/:noteId — get one project note
 * PUT /api/projects/:id/notes/:noteId — update project note
 * DELETE /api/projects/:id/notes/:noteId — delete project note
 */
import { authRequired } from '../../../_lib/authRequired.js'
import { prisma } from '../../../_lib/prisma.js'
import { ok, badRequest, notFound, serverError } from '../../../_lib/response.js'
import { parseJsonBody } from '../../../_lib/body.js'
import { withHttp } from '../../../_lib/withHttp.js'
import { withLogging } from '../../../_lib/logger.js'
import { logProjectActivity, getActivityUserFromRequest } from '../../../_lib/projectActivityLog.js'

function parseProjectNote(note) {
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
  parsed.source = 'project'
  return parsed
}

async function handler(req, res) {
  const projectId = req.params?.id
  const noteId = req.params?.noteId
  if (!projectId || !noteId) {
    return badRequest(res, 'Project ID and Note ID required')
  }

  if (req.method === 'GET') {
    try {
      const note = await prisma.projectNote.findFirst({
        where: { id: noteId, projectId },
        include: {
          author: { select: { id: true, name: true, email: true } }
        }
      })
      if (!note) return notFound(res, 'Note not found')
      return ok(res, { note: parseProjectNote(note) })
    } catch (e) {
      console.error('Error fetching project note:', e)
      return serverError(res, 'Failed to load note', e.message)
    }
  }

  if (req.method === 'PUT') {
    try {
      const existing = await prisma.projectNote.findFirst({
        where: { id: noteId, projectId }
      })
      if (!existing) return notFound(res, 'Note not found')

      const body = await parseJsonBody(req)
      const title = (body?.title != null && String(body.title).trim()) ? String(body.title).trim() : existing.title
      const content = typeof body?.content === 'string' ? body.content : existing.content
      const tags = Array.isArray(body?.tags) ? body.tags : (typeof existing.tags === 'string' ? (() => { try { return JSON.parse(existing.tags) } catch { return [] } })() : [])

      const note = await prisma.projectNote.update({
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
      const { userId: uid, userName: uName } = getActivityUserFromRequest(req)
      await logProjectActivity(prisma, {
        projectId,
        userId: uid,
        userName: uName,
        type: 'note_updated',
        description: `Note "${title}" updated`,
        metadata: { noteId: note.id, noteTitle: title, source: 'project' }
      })
      return ok(res, { note: parseProjectNote(note) })
    } catch (e) {
      console.error('Error updating project note:', e)
      return serverError(res, 'Failed to update note', e.message)
    }
  }

  if (req.method === 'DELETE') {
    try {
      const existing = await prisma.projectNote.findFirst({
        where: { id: noteId, projectId }
      })
      if (!existing) return notFound(res, 'Note not found')

      const noteTitle = existing.title || 'Untitled'
      await prisma.projectNote.delete({
        where: { id: noteId }
      })
      const { userId: uid, userName: uName } = getActivityUserFromRequest(req)
      await logProjectActivity(prisma, {
        projectId,
        userId: uid,
        userName: uName,
        type: 'note_deleted',
        description: `Note "${noteTitle}" deleted`,
        metadata: { noteId, noteTitle, source: 'project' }
      })
      return ok(res, { deleted: true })
    } catch (e) {
      console.error('Error deleting project note:', e)
      return serverError(res, 'Failed to delete note', e.message)
    }
  }

  return res.status(405).setHeader('Allow', 'GET, PUT, DELETE').json({ error: 'Method not allowed' })
}

export default withHttp(withLogging(authRequired(handler)))
