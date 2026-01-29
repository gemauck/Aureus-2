/**
 * GET /api/projects/:id/document-sections
 * Returns only documentSections for the project. Used by Document Collection tab
 * so it never relies on cached full-project response. Always no-store.
 */
import { authRequired } from '../../_lib/authRequired.js'
import { documentSectionsToJson } from '../../projects.js'
import { ok, serverError } from '../../_lib/response.js'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).setHeader('Allow', 'GET').json({ error: 'Method not allowed' })
  }

  // Prefer server-set param; then parse from path (req.url is relative to /api mount)
  const pathOrUrl = (req.originalUrl || req.url || req.path || '').split('?')[0].split('#')[0]
  const match = pathOrUrl.match(/(?:\/api)?\/projects\/([^/]+)\/document-sections(?!-v2)(?:\/|$|\?)/)
  const rawId = (req.params && req.params.id) || (match ? match[1] : null)
  const id = rawId ? String(rawId).split('?')[0].split('&')[0].trim() : null
  if (!id) {
    return res.status(400).json({ error: 'Project ID required', path: pathOrUrl })
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    const documentSections = await documentSectionsToJson(id, { skipComments: false })
    const data = documentSections != null ? documentSections : {}
    return ok(res, { documentSections: data })
  } catch (e) {
    console.error('GET /api/projects/:id/document-sections error:', e)
    return serverError(res, e.message || 'Failed to load document sections')
  }
}

export default authRequired(handler)
