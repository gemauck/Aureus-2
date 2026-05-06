// POST /api/teams/convert-pdf-sketch — experimental PDF → Excalidraw sketch (Poppler SVG + heuristic), auth required
import { authRequired } from '../_lib/authRequired.js'
import { badRequest, ok, serverError } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { tryPdfBufferToSvgPoppler } from '../_lib/pdfTryPopplerSvg.js'
import { svgToExcalidrawSketch } from '../_lib/svgToExcalidrawSketch.js'

function dataUrlToBuffer(dataUrl) {
  const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/s)
  if (!m) return null
  try {
    return Buffer.from(m[2], 'base64')
  } catch {
    return null
  }
}

async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return badRequest(res, 'Method not allowed')
    }
    const body = await parseJsonBody(req)
    const dataUrl = (body.dataUrl || '').toString()
    const page = Math.max(1, parseInt(body.page, 10) || 1)
    if (!dataUrl.startsWith('data:') || !dataUrl.includes('base64')) {
      return badRequest(res, 'dataUrl with base64 PDF is required')
    }
    if (page !== 1) {
      return badRequest(res, 'Only page 1 is supported for vector extraction in this experimental endpoint')
    }

    const buf = dataUrlToBuffer(dataUrl)
    if (!buf || buf.length < 100) {
      return badRequest(res, 'Invalid PDF payload')
    }

    let converter = 'none'
    const warnings = []

    let svg = tryPdfBufferToSvgPoppler(buf)
    if (svg) {
      converter = 'poppler-svg'
    } else {
      warnings.push(
        'Vector extraction skipped: `pdftocairo` (Poppler) not available or conversion failed. Install poppler-utils on the server for SVG-based sketches, or use Trace mode in the browser.'
      )
    }

    let elements = []
    if (svg) {
      const sketch = svgToExcalidrawSketch(svg)
      elements = sketch.elements
      warnings.push(...sketch.warnings)
    }

    const canvasData = {
      elements,
      appState: {
        viewBackgroundColor: '#ffffff',
        gridSize: null
      },
      files: {}
    }

    return ok(res, {
      canvasData,
      meta: {
        converter,
        elementCount: elements.length,
        warnings
      }
    })
  } catch (e) {
    console.error('convert-pdf-sketch:', e)
    return serverError(res, 'PDF sketch conversion failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
