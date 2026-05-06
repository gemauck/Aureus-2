// POST /api/teams/convert-svg-sketch — SVG text → Excalidraw canvasData (heuristic), auth required
import { authRequired } from '../_lib/authRequired.js'
import { badRequest, ok, serverError } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { svgToExcalidrawSketch } from '../_lib/svgToExcalidrawSketch.js'

async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return badRequest(res, 'Method not allowed')
    }
    const body = await parseJsonBody(req)
    const svg = (body.svg ?? '').toString()
    if (!svg.trim() || !/<svg[\s>/]/i.test(svg)) {
      return badRequest(res, 'Valid SVG markup (svg element) is required')
    }

    const sketch = svgToExcalidrawSketch(svg)
    const canvasData = {
      elements: sketch.elements,
      appState: {
        viewBackgroundColor: '#ffffff',
        gridSize: null
      },
      files: {}
    }

    return ok(res, {
      canvasData,
      meta: {
        elementCount: sketch.elements.length,
        warnings: sketch.warnings
      }
    })
  } catch (e) {
    console.error('convert-svg-sketch:', e)
    return serverError(res, 'SVG conversion failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
