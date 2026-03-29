import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, created, forbidden, ok, serverError } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { isHrAdministrator, requireLeaveModuleAccess } from '../_lib/hrAccess.js'

function documentWhereForUser(actorId, elevated) {
  if (elevated) {
    return {}
  }
  return {
    OR: [{ visibility: 'company' }, { visibility: 'employee', userId: actorId }]
  }
}

async function handler(req, res) {
  try {
    const actor = await requireLeaveModuleAccess(prisma, req, res)
    if (!actor) return

    const elevated = isHrAdministrator(actor)

    if (req.method === 'GET') {
      const docs = await prisma.hrLibraryDocument.findMany({
        where: documentWhereForUser(actor.id, elevated),
        orderBy: { createdAt: 'desc' },
        include: {
          uploadedBy: { select: { id: true, name: true, email: true } },
          user: { select: { id: true, name: true, email: true } }
        }
      })
      return ok(res, { documents: docs })
    }

    if (req.method === 'POST') {
      if (!elevated) {
        return forbidden(res, 'Only HR administrators can add HR documents')
      }
      const body = await parseJsonBody(req)
      const title = (body.title || '').toString().trim()
      const fileUrl = (body.fileUrl || '').toString().trim()
      if (!title || !fileUrl) {
        return badRequest(res, 'title and fileUrl are required')
      }
      const visibility = (body.visibility || 'company').toString()
      if (visibility !== 'company' && visibility !== 'employee') {
        return badRequest(res, 'visibility must be company or employee')
      }
      let userId = body.userId ? String(body.userId) : null
      if (visibility === 'employee' && !userId) {
        return badRequest(res, 'userId is required for employee-scoped documents')
      }
      if (visibility === 'company') {
        userId = null
      }

      const doc = await prisma.hrLibraryDocument.create({
        data: {
          title,
          category: (body.category || 'other').toString(),
          fileUrl,
          mimeType: body.mimeType ? String(body.mimeType) : null,
          visibility,
          userId,
          uploadedById: actor.id
        },
        include: {
          uploadedBy: { select: { id: true, name: true, email: true } },
          user: { select: { id: true, name: true, email: true } }
        }
      })
      return created(res, { document: doc })
    }

    return badRequest(res, 'Method not allowed')
  } catch (e) {
    console.error('HR documents API error:', e)
    return serverError(res, 'Internal server error', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
