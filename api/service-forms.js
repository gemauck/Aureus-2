import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { ok, created, badRequest, notFound, serverError } from './_lib/response.js'

// Simple admin-only check: only users with role === 'admin' may manage templates
function requireAdmin(req, res) {
  const role = req.user?.role?.toLowerCase?.() || 'user'
  if (role !== 'admin') {
    res.statusCode = 403
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        error: 'Insufficient permissions',
        message: 'Only administrators can manage service forms and checklists.',
      })
    )
    return false
  }
  return true
}

function parseJsonSafe(value, fallback) {
  if (!value) return fallback
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return fallback
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

async function handler(req, res) {
  // Strip query parameters and hash, normalise base path
  const urlPath = req.url.split('?')[0].split('#')[0].replace(/^\/api\//, '/')
  const pathSegments = urlPath.split('/').filter(Boolean)
  const resourceType = pathSegments[0] // service-forms
  const id = pathSegments[1]

  if (resourceType !== 'service-forms') {
    return badRequest(res, 'Invalid service forms endpoint')
  }

  // LIST (GET /api/service-forms)
  if (req.method === 'GET' && !id) {
    try {
      const templates = await prisma.serviceFormTemplate.findMany({
        orderBy: { createdAt: 'desc' },
      })

      const formatted = templates.map((tpl) => ({
        ...tpl,
        fields: parseJsonSafe(tpl.fields, []),
      }))

      return ok(res, { templates: formatted })
    } catch (error) {
      console.error('❌ Failed to list service form templates:', error)
      return serverError(res, 'Failed to list service form templates', error.message)
    }
  }

  // GET ONE (GET /api/service-forms/:id)
  if (req.method === 'GET' && id) {
    try {
      const template = await prisma.serviceFormTemplate.findUnique({
        where: { id },
      })

      if (!template) {
        return notFound(res, 'Service form template not found')
      }

      return ok(res, {
        template: {
          ...template,
          fields: parseJsonSafe(template.fields, []),
        },
      })
    } catch (error) {
      console.error('❌ Failed to get service form template:', error)
      return serverError(res, 'Failed to get service form template', error.message)
    }
  }

  // CREATE (POST /api/service-forms)
  if (req.method === 'POST' && !id) {
    if (!requireAdmin(req, res)) return

    const body = req.body || {}

    try {
      const fields = Array.isArray(body.fields) ? JSON.stringify(body.fields) : body.fields || '[]'

      const template = await prisma.serviceFormTemplate.create({
        data: {
          name: body.name || 'Untitled form',
          description: body.description || '',
          category: body.category || 'General',
          isActive: body.isActive !== undefined ? !!body.isActive : true,
          version: body.version && Number.isFinite(Number(body.version)) ? Number(body.version) : 1,
          fields,
          createdById: req.user?.sub || null,
        },
      })

      return created(res, {
        template: {
          ...template,
          fields: parseJsonSafe(template.fields, []),
        },
      })
    } catch (error) {
      console.error('❌ Failed to create service form template:', error)
      return serverError(res, 'Failed to create service form template', error.message)
    }
  }

  // UPDATE (PATCH /api/service-forms/:id)
  if (req.method === 'PATCH' && id) {
    if (!requireAdmin(req, res)) return

    const body = req.body || {}

    try {
      const existing = await prisma.serviceFormTemplate.findUnique({ where: { id } })
      if (!existing) {
        return notFound(res, 'Service form template not found')
      }

      const data = {}
      if (body.name !== undefined) data.name = body.name
      if (body.description !== undefined) data.description = body.description
      if (body.category !== undefined) data.category = body.category
      if (body.isActive !== undefined) data.isActive = !!body.isActive
      if (body.version !== undefined) {
        const v = Number(body.version)
        if (Number.isFinite(v) && v > 0) data.version = v
      }
      if (body.fields !== undefined) {
        data.fields = Array.isArray(body.fields) ? JSON.stringify(body.fields) : body.fields
      }

      const template = await prisma.serviceFormTemplate.update({
        where: { id },
        data,
      })

      return ok(res, {
        template: {
          ...template,
          fields: parseJsonSafe(template.fields, []),
        },
      })
    } catch (error) {
      console.error('❌ Failed to update service form template:', error)
      return serverError(res, 'Failed to update service form template', error.message)
    }
  }

  // DELETE (DELETE /api/service-forms/:id)
  if (req.method === 'DELETE' && id) {
    if (!requireAdmin(req, res)) return

    try {
      const existing = await prisma.serviceFormTemplate.findUnique({ where: { id } })
      if (!existing) {
        return notFound(res, 'Service form template not found')
      }

      await prisma.serviceFormTemplate.delete({ where: { id } })
      return ok(res, { deleted: true, id })
    } catch (error) {
      console.error('❌ Failed to delete service form template:', error)
      return serverError(res, 'Failed to delete service form template', error.message)
    }
  }

  return badRequest(res, 'Invalid service forms endpoint')
}

export default authRequired(handler)


