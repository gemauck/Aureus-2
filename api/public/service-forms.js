// Public API endpoint for service form templates - returns active templates without authentication
import { prisma } from '../_lib/prisma.js'
import { ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'

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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('📡 Public service forms endpoint: Fetching active templates for job card form...')
    
    // Get only active templates
    const templates = await prisma.serviceFormTemplate.findMany({
      where: {
        isActive: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    // Format templates with parsed fields
    const formatted = templates.map((tpl) => ({
      id: tpl.id,
      name: tpl.name,
      description: tpl.description || '',
      category: tpl.category || 'General',
      fields: parseJsonSafe(tpl.fields, []),
      version: tpl.version || 1
    }))

    return ok(res, { 
      templates: formatted 
    })
  } catch (error) {
    // If the tables don't exist yet, return empty list gracefully
    const message = String(error.message || '')
    const code = error.code
    if (code === 'P2021' || code === 'P2023' || message.includes('ServiceFormTemplate')) {
      console.warn('⚠️ Service forms tables are missing; returning empty templates list.')
      return ok(res, { templates: [] })
    }

    console.error('❌ Public service forms endpoint error:', error)
    return serverError(res, 'Failed to fetch service form templates', error.message)
  }
}

export default withHttp(handler)

