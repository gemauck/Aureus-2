import { authRequired } from '../../_lib/authRequired.js'
import { prisma } from '../../_lib/prisma.js'
import { badRequest, forbidden, notFound, ok, serverError } from '../../_lib/response.js'
import { parseJsonBody } from '../../_lib/body.js'
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
      return badRequest(res, 'Policy id required')
    }

    const policy = await prisma.hrPolicy.findFirst({
      where: {
        OR: [{ id }, { slug: id }]
      },
      include: {
        updatedBy: { select: { id: true, name: true, email: true } }
      }
    })

    if (!policy) {
      return notFound(res, 'Policy not found')
    }

    if (!elevated && policy.status !== 'published') {
      return forbidden(res, 'Policy not available')
    }

    if (req.method === 'GET') {
      return ok(res, { policy })
    }

    if (!elevated) {
      return forbidden(res, 'Only HR administrators can modify policies')
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await parseJsonBody(req)
      const data = {}
      if (body.title !== undefined) data.title = String(body.title).trim()
      if (body.slug !== undefined) data.slug = String(body.slug).trim()
      if (body.category !== undefined) data.category = String(body.category)
      if (body.body !== undefined) data.body = String(body.body)
      if (body.status !== undefined) data.status = String(body.status)
      if (body.version !== undefined && Number.isFinite(Number(body.version))) {
        data.version = Number(body.version)
      }
      if (body.effectiveFrom !== undefined) {
        data.effectiveFrom = body.effectiveFrom ? new Date(body.effectiveFrom) : null
      }
      data.updatedById = actor.id

      const updated = await prisma.hrPolicy.update({
        where: { id: policy.id },
        data,
        include: {
          updatedBy: { select: { id: true, name: true, email: true } }
        }
      })
      return ok(res, { policy: updated })
    }

    if (req.method === 'DELETE') {
      await prisma.hrPolicy.delete({ where: { id: policy.id } })
      return ok(res, { deleted: true })
    }

    return badRequest(res, 'Method not allowed')
  } catch (e) {
    console.error('HR policy [id] API error:', e)
    return serverError(res, 'Internal server error', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
