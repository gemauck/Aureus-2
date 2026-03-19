/**
 * GET /api/projects/:id/public-notes
 * Returns public notes linked to this project, with author (owner) for display.
 * Only notes with isPublic true and projectId = :id are returned.
 */
import { authRequired } from '../../_lib/authRequired.js'
import { prisma } from '../../_lib/prisma.js'
import { ok, badRequest, serverError } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'

function parseNote(note) {
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
  if (note.owner) {
    parsed.author = { id: note.owner.id, name: note.owner.name, email: note.owner.email }
  } else {
    parsed.author = parsed.ownerId ? { id: parsed.ownerId, name: null, email: null } : null
  }
  return parsed
}

async function handler(req, res) {
  const projectId = req.params?.id
  if (!projectId) {
    return badRequest(res, 'Project ID required')
  }

  if (req.method !== 'GET') {
    return res.status(405).setHeader('Allow', 'GET').json({ error: 'Method not allowed' })
  }

  try {
    const notes = await prisma.userNote.findMany({
      where: {
        projectId,
        isPublic: true
      },
      include: {
        owner: { select: { id: true, name: true, email: true } }
      },
      orderBy: { updatedAt: 'desc' }
    })

    const list = notes.map(parseNote)
    return ok(res, { notes: list })
  } catch (e) {
    console.error('Error fetching project public notes:', e)
    return serverError(res, 'Failed to load notes', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
