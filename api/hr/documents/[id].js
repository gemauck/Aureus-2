import { authRequired } from '../../_lib/authRequired.js'
import { prisma } from '../../_lib/prisma.js'
import { badRequest, forbidden, notFound, ok, serverError } from '../../_lib/response.js'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { isHrAdministrator, requireLeaveModuleAccess } from '../../_lib/hrAccess.js'

async function handler(req, res) {
  try {
    const actor = await requireLeaveModuleAccess(prisma, req, res)
    if (!actor) return

    const elevated = isHrAdministrator(actor)
    const id =
      req.params?.id ||
      req.url
        .split('?')[0]
        .split('/')
        .filter(Boolean)
        .pop()

    if (!id) {
      return badRequest(res, 'Document id required')
    }

    const doc = await prisma.hrLibraryDocument.findUnique({
      where: { id },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
        user: { select: { id: true, name: true, email: true } }
      }
    })

    if (!doc) {
      return notFound(res, 'Document not found')
    }

    if (!elevated) {
      const allowed =
        doc.visibility === 'company' ||
        (doc.visibility === 'employee' && doc.userId === actor.id)
      if (!allowed) {
        return forbidden(res, 'Access denied')
      }
    }

    if (req.method === 'GET') {
      return ok(res, { document: doc })
    }

    if (req.method === 'DELETE') {
      if (!elevated) {
        return forbidden(res, 'Only HR administrators can delete documents')
      }
      await prisma.hrLibraryDocument.delete({ where: { id: doc.id } })
      return ok(res, { deleted: true })
    }

    return badRequest(res, 'Method not allowed')
  } catch (e) {
    console.error('HR document [id] API error:', e)
    return serverError(res, 'Internal server error', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
