/**
 * GET /api/projects/:id/document-sections-v2
 * Same as document-sections but different path so browser/proxy cache never returns stale data.
 * Use this path in the frontend to bypass any cached response for document-sections.
 * Merges emailRequestByMonth (recipients, CC, template, schedule) from Project.documentSections blob
 * so saved request-email data persists when loading from this endpoint.
 */
import { authRequired } from '../../_lib/authRequired.js'
import { documentSectionsToJson } from '../../projects.js'
import { ok, serverError } from '../../_lib/response.js'
import { prisma } from '../../_lib/prisma.js'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).setHeader('Allow', 'GET').json({ error: 'Method not allowed' })
  }

  // Prefer server-set param; then parse from path (req.url is relative to /api mount)
  const pathOrUrl = (req.originalUrl || req.url || req.path || '').split('?')[0].split('#')[0]
  const match = pathOrUrl.match(/(?:\/api)?\/projects\/([^/]+)\/document-sections-v2/)
  const rawId = (req.params && req.params.id) || (match ? match[1] : null)
  const id = rawId ? String(rawId).split('?')[0].split('&')[0].trim() : null
  if (!id) {
    return res.status(400).json({ error: 'Project ID required', path: pathOrUrl })
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    let documentSections = await documentSectionsToJson(id, { skipComments: false })
    documentSections = documentSections != null ? documentSections : {}

    // Merge emailRequestByMonth from Project.documentSections blob (recipients, CC, template, schedule)
    // so saved "Request documents via email" data persists when loading from this endpoint
    try {
      const project = await prisma.project.findUnique({
        where: { id },
        select: { documentSections: true }
      })
      if (project?.documentSections && typeof documentSections === 'object' && !Array.isArray(documentSections)) {
        const blob = typeof project.documentSections === 'string'
          ? JSON.parse(project.documentSections) : project.documentSections
        if (blob && typeof blob === 'object' && !Array.isArray(blob)) {
          for (const year of Object.keys(blob)) {
            const blobSections = blob[year]
            const outSections = documentSections[year]
            if (!Array.isArray(blobSections) || !Array.isArray(outSections)) continue
            for (let si = 0; si < blobSections.length && si < outSections.length; si++) {
              const blobDocs = blobSections[si].documents || []
              const outDocs = outSections[si].documents || []
              for (let di = 0; di < blobDocs.length && di < outDocs.length; di++) {
                if (blobDocs[di].emailRequestByMonth && typeof blobDocs[di].emailRequestByMonth === 'object') {
                  outDocs[di].emailRequestByMonth = blobDocs[di].emailRequestByMonth
                }
              }
            }
          }
        }
      }
    } catch (mergeErr) {
      console.warn('⚠️ document-sections-v2: merge emailRequestByMonth from blob failed:', mergeErr.message)
    }

    return ok(res, { documentSections })
  } catch (e) {
    console.error('GET /api/projects/:id/document-sections-v2 error:', e)
    return serverError(res, e.message || 'Failed to load document sections')
  }
}

export default authRequired(handler)
