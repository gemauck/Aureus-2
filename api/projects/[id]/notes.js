/**
 * GET /api/projects/:id/notes — list notes for this project (from ProjectNote table only)
 * POST /api/projects/:id/notes — create a new project note
 */
import { authRequired } from '../../_lib/authRequired.js'
import { prisma } from '../../_lib/prisma.js'
import { ok, badRequest, created, serverError } from '../../_lib/response.js'
import { parseJsonBody } from '../../_lib/body.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { logProjectActivity, getActivityUserFromRequest } from '../../_lib/projectActivityLog.js'

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
  if (!projectId) {
    return badRequest(res, 'Project ID required')
  }

  const userId = req.user?.sub || req.user?.id
  if (!userId) {
    return badRequest(res, 'User not authenticated')
  }

  if (req.method === 'GET') {
    try {
      const notes = await prisma.projectNote.findMany({
        where: { projectId },
        include: {
          author: { select: { id: true, name: true, email: true } }
        },
        orderBy: { updatedAt: 'desc' }
      })
      const list = notes.map(parseProjectNote)
      return ok(res, { notes: list })
    } catch (e) {
      console.error('Error fetching project notes:', e)
      return serverError(res, 'Failed to load notes', e.message)
    }
  }

  if (req.method === 'POST') {
    try {
      const body = await parseJsonBody(req)
      const title = (body?.title && String(body.title).trim()) ? String(body.title).trim() : 'Untitled Note'
      const content = typeof body?.content === 'string' ? body.content : ''
      const tags = Array.isArray(body?.tags) ? body.tags : []

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true }
      })
      if (!project) {
        return badRequest(res, 'Project not found')
      }

      const note = await prisma.projectNote.create({
        data: {
          projectId,
          title,
          content,
          tags: JSON.stringify(tags),
          authorId: userId
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
        type: 'note_created',
        description: `Note "${title}" created`,
        metadata: { noteId: note.id, noteTitle: title, source: 'project' }
      })
      const parsed = parseProjectNote(note)
      return created(res, { note: parsed })
    } catch (e) {
      console.error('Error creating project note:', e)
      return serverError(res, 'Failed to create note', e.message)
    }
  }

  return res.status(405).setHeader('Allow', 'GET, POST').json({ error: 'Method not allowed' })
}

export default withHttp(withLogging(authRequired(handler)))
