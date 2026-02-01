/**
 * GET /api/projects/:id/document-sections
 * Returns only documentSections for the project. Used by Document Collection tab
 * so it never relies on cached full-project response. Always no-store.
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
    let documentSections = await documentSectionsToJson(id, { skipComments: false })

    // Fetch blob for merge (or as primary source when table is empty)
    let blob = null
    try {
      const project = await prisma.project.findUnique({
        where: { id },
        select: { documentSections: true }
      })
      if (project?.documentSections) {
        blob = typeof project.documentSections === 'string'
          ? JSON.parse(project.documentSections) : project.documentSections
      }
    } catch (blobErr) {
      console.warn('⚠️ document-sections: failed to parse blob:', blobErr.message)
    }

    // When table returns null/empty, use blob as primary source (preserves emailRequestByMonth)
    if ((documentSections == null || (typeof documentSections === 'object' && Object.keys(documentSections).length === 0)) && blob && typeof blob === 'object' && !Array.isArray(blob)) {
      documentSections = blob
    } else {
      documentSections = documentSections != null ? documentSections : {}
    }

    // Merge emailRequestByMonth from blob into table output (recipients, CC, template, schedule)
    if (blob && typeof blob === 'object' && !Array.isArray(blob) && typeof documentSections === 'object' && !Array.isArray(documentSections)) {
      try {
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
            // Fallback: match by document id when index might misalign
            for (let di = 0; di < outDocs.length; di++) {
              if (outDocs[di].emailRequestByMonth) continue
              const outDocId = outDocs[di].id
              const outDocName = outDocs[di].name
              const blobDoc = blobDocs.find((d) => String(d.id) === String(outDocId) || (d.name && String(d.name) === String(outDocName)))
              if (blobDoc?.emailRequestByMonth && typeof blobDoc.emailRequestByMonth === 'object') {
                outDocs[di].emailRequestByMonth = blobDoc.emailRequestByMonth
              }
            }
          }
        }
      } catch (mergeErr) {
        console.warn('⚠️ document-sections: merge emailRequestByMonth from blob failed:', mergeErr.message)
      }
    }

    return ok(res, { documentSections })
  } catch (e) {
    console.error('GET /api/projects/:id/document-sections error:', e)
    return serverError(res, e.message || 'Failed to load document sections')
  }
}

export default authRequired(handler)
