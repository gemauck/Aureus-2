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
    // Fetch table data and blob in parallel to reduce latency
    const [documentSectionsRaw, projectRow] = await Promise.all([
      documentSectionsToJson(id, { skipComments: false }),
      prisma.project.findUnique({
        where: { id },
        select: { documentSections: true }
      })
    ])
    let documentSections = documentSectionsRaw

    // Parse blob for merge (or as primary source when table is empty)
    let blob = null
    try {
      if (projectRow?.documentSections) {
        blob = typeof projectRow.documentSections === 'string'
          ? JSON.parse(projectRow.documentSections) : projectRow.documentSections
      }
    } catch (blobErr) {
      console.warn('⚠️ document-sections-v2: failed to parse blob:', blobErr.message)
    }

    // When table returns null/empty, use blob as primary source (preserves emailRequestByMonth).
    // Include legacy top-level arrays — old saves stored sections as [] on Project.documentSections;
    // excluding arrays made the API return {} and the tracker showed "No sections yet".
    const tableEmpty =
      documentSections == null ||
      (typeof documentSections === 'object' &&
        !Array.isArray(documentSections) &&
        Object.keys(documentSections).length === 0)
    if (tableEmpty && blob != null && typeof blob === 'object') {
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
          for (let si = 0; si < outSections.length; si++) {
            const outSection = outSections[si] || {}
            const outSectionId = outSection.id
            const outSectionName = outSection.name
            const blobSectionByIdentity = blobSections.find((s) =>
              String(s?.id) === String(outSectionId) ||
              (s?.name && outSectionName && String(s.name) === String(outSectionName))
            )
            const blobSection = blobSectionByIdentity || blobSections[si] || {}
            const blobDocs = Array.isArray(blobSection.documents) ? blobSection.documents : []
            const outDocs = Array.isArray(outSection.documents) ? outSection.documents : []

            for (let di = 0; di < outDocs.length; di++) {
              if (outDocs[di]?.emailRequestByMonth) continue
              const outDocId = outDocs[di]?.id
              const outDocName = outDocs[di]?.name
              const blobDoc = blobDocs.find((d) =>
                String(d?.id) === String(outDocId) ||
                (d?.name && outDocName && String(d.name) === String(outDocName))
              )
              if (blobDoc?.emailRequestByMonth && typeof blobDoc.emailRequestByMonth === 'object') {
                outDocs[di].emailRequestByMonth = blobDoc.emailRequestByMonth
              }
            }
          }
        }
      } catch (mergeErr) {
        console.warn('⚠️ document-sections-v2: merge emailRequestByMonth from blob failed:', mergeErr.message)
      }
    }

    return ok(res, { documentSections })
  } catch (e) {
    console.error('GET /api/projects/:id/document-sections-v2 error:', e)
    return serverError(res, e.message || 'Failed to load document sections')
  }
}

export default authRequired(handler)
