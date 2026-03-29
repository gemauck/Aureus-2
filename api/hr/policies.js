import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, created, forbidden, ok, serverError } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { isHrAdministrator, requireLeaveModuleAccess } from '../_lib/hrAccess.js'

function slugify(title) {
  const s = String(title || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return s || 'policy'
}

async function handler(req, res) {
  try {
    const actor = await requireLeaveModuleAccess(prisma, req, res)
    if (!actor) return

    const elevated = isHrAdministrator(actor)

    if (req.method === 'GET') {
      const where = elevated ? {} : { status: 'published' }
      const policies = await prisma.hrPolicy.findMany({
        where,
        orderBy: [{ category: 'asc' }, { title: 'asc' }],
        include: {
          updatedBy: { select: { id: true, name: true, email: true } }
        }
      })
      return ok(res, { policies })
    }

    if (req.method === 'POST') {
      if (!elevated) {
        return forbidden(res, 'Only HR administrators can create policies')
      }
      const body = await parseJsonBody(req)
      const title = (body.title || '').toString().trim()
      if (!title) {
        return badRequest(res, 'title is required')
      }
      let slug = (body.slug || '').toString().trim() || slugify(title)
      const exists = await prisma.hrPolicy.findUnique({ where: { slug } })
      if (exists) {
        slug = `${slug}-${Date.now().toString(36)}`
      }
      const policy = await prisma.hrPolicy.create({
        data: {
          title,
          slug,
          category: (body.category || 'general').toString(),
          body: (body.body || '').toString(),
          status: (body.status || 'draft').toString(),
          version: Number.isFinite(Number(body.version)) ? Number(body.version) : 1,
          effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : null,
          updatedById: actor.id
        },
        include: {
          updatedBy: { select: { id: true, name: true, email: true } }
        }
      })
      return created(res, { policy })
    }

    return badRequest(res, 'Method not allowed')
  } catch (e) {
    console.error('HR policies API error:', e)
    return serverError(res, 'Internal server error', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
