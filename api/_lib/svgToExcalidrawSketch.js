/**
 * Heuristic SVG → Excalidraw elements (experimental sketch).
 * Handles common primitives; complex paths become bbox rectangles or are skipped.
 */

function genId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`
}

function baseCommon(partial) {
  const now = Date.now()
  return {
    id: partial.id || genId(),
    angle: partial.angle ?? 0,
    strokeColor: partial.strokeColor ?? '#1e1e1e',
    backgroundColor: partial.backgroundColor ?? 'transparent',
    fillStyle: partial.fillStyle ?? 'solid',
    strokeWidth: partial.strokeWidth ?? 1,
    strokeStyle: partial.strokeStyle ?? 'solid',
    /** 0 = crisp “architect” strokes; 1+ = hand-drawn sketch pen */
    roughness: partial.roughness ?? 0,
    opacity: partial.opacity ?? 100,
    groupIds: [],
    frameId: null,
    roundness: partial.roundness ?? null,
    seed: Math.floor(Math.random() * 1e9),
    versionNonce: Math.floor(Math.random() * 1e9),
    isDeleted: false,
    boundElements: null,
    updated: now,
    link: null,
    locked: false,
    ...partial
  }
}

/** Rough bbox from SVG path d= "M x y L x y ..." */
export function pathDToRoughBBox(d) {
  if (!d || typeof d !== 'string') return null
  const nums = d.match(/-?\d+\.?\d*/g)
  if (!nums || nums.length < 2) return null
  const coords = nums.map(Number).filter((n) => !Number.isNaN(n))
  if (coords.length < 2) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i + 1 < coords.length; i += 2) {
    const x = coords[i]
    const y = coords[i + 1]
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  if (!Number.isFinite(minX)) return null
  const w = Math.max(4, maxX - minX)
  const h = Math.max(4, maxY - minY)
  return { x: minX, y: minY, width: w, height: h }
}

/**
 * @param {string} svgText
 * @returns {{ elements: object[], warnings: string[] }}
 */
export function svgToExcalidrawSketch(svgText) {
  const warnings = []
  const elements = []
  if (!svgText || typeof svgText !== 'string') {
    warnings.push('Empty SVG')
    return { elements, warnings }
  }

  const stripComments = svgText.replace(/<!--[\s\S]*?-->/g, '')
  const rectRe = /<rect\b([^>]*)\/?>/gi
  let m
  while ((m = rectRe.exec(stripComments)) !== null) {
    const attrs = m[1]
    const x = parseFloat(/x="([^"]*)"/i.exec(attrs)?.[1] ?? '0')
    const y = parseFloat(/y="([^"]*)"/i.exec(attrs)?.[1] ?? '0')
    const w = parseFloat(/width="([^"]*)"/i.exec(attrs)?.[1] ?? '0')
    const h = parseFloat(/height="([^"]*)"/i.exec(attrs)?.[1] ?? '0')
    if (w > 0 && h > 0) {
      elements.push(
        baseCommon({
          type: 'rectangle',
          x,
          y,
          width: w,
          height: h,
          strokeColor: '#495057',
          backgroundColor: 'transparent'
        })
      )
    }
  }

  const lineRe = /<line\b([^>]*)\/?>/gi
  while ((m = lineRe.exec(stripComments)) !== null) {
    const attrs = m[1]
    const x1 = parseFloat(/x1="([^"]*)"/i.exec(attrs)?.[1] ?? '0')
    const y1 = parseFloat(/y1="([^"]*)"/i.exec(attrs)?.[1] ?? '0')
    const x2 = parseFloat(/x2="([^"]*)"/i.exec(attrs)?.[1] ?? '0')
    const y2 = parseFloat(/y2="([^"]*)"/i.exec(attrs)?.[1] ?? '0')
    const lw = Math.abs(x2 - x1) || 2
    const lh = Math.abs(y2 - y1) || 2
    const lx = Math.min(x1, x2)
    const ly = Math.min(y1, y2)
    elements.push(
      baseCommon({
        type: 'rectangle',
        x: lx,
        y: ly,
        width: lw,
        height: Math.max(lh, 2),
        strokeColor: '#495057',
        backgroundColor: 'transparent',
        strokeWidth: 2
      })
    )
  }

  const circleRe = /<circle\b([^>]*)\/?>/gi
  while ((m = circleRe.exec(stripComments)) !== null) {
    const attrs = m[1]
    const cx = parseFloat(/cx="([^"]*)"/i.exec(attrs)?.[1] ?? '0')
    const cy = parseFloat(/cy="([^"]*)"/i.exec(attrs)?.[1] ?? '0')
    const r = parseFloat(/r="([^"]*)"/i.exec(attrs)?.[1] ?? '0')
    if (r > 0) {
      elements.push(
        baseCommon({
          type: 'ellipse',
          x: cx - r,
          y: cy - r,
          width: r * 2,
          height: r * 2,
          strokeColor: '#495057',
          backgroundColor: 'transparent'
        })
      )
    }
  }

  const ellipseRe = /<ellipse\b([^>]*)\/?>/gi
  while ((m = ellipseRe.exec(stripComments)) !== null) {
    const attrs = m[1]
    const cx = parseFloat(/cx="([^"]*)"/i.exec(attrs)?.[1] ?? '0')
    const cy = parseFloat(/cy="([^"]*)"/i.exec(attrs)?.[1] ?? '0')
    const rx = parseFloat(/rx="([^"]*)"/i.exec(attrs)?.[1] ?? '0')
    const ry = parseFloat(/ry="([^"]*)"/i.exec(attrs)?.[1] ?? '0')
    if (rx > 0 && ry > 0) {
      elements.push(
        baseCommon({
          type: 'ellipse',
          x: cx - rx,
          y: cy - ry,
          width: rx * 2,
          height: ry * 2,
          strokeColor: '#495057',
          backgroundColor: 'transparent'
        })
      )
    }
  }

  const textRe = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi
  while ((m = textRe.exec(stripComments)) !== null) {
    const attrs = m[1]
    const inner = m[2].replace(/<[^>]+>/g, '').trim()
    const x = parseFloat(/x="([^"]*)"/i.exec(attrs)?.[1] ?? '0')
    const y = parseFloat(/y="([^"]*)"/i.exec(attrs)?.[1] ?? '0')
    if (inner) {
      elements.push(
        baseCommon({
          type: 'text',
          x,
          y,
          width: Math.max(inner.length * 7, 40),
          height: 24,
          text: inner.slice(0, 500),
          fontSize: 16,
          fontFamily: 1,
          textAlign: 'left',
          verticalAlign: 'top',
          containerId: null,
          originalText: inner.slice(0, 500),
          lineHeight: 1.25
        })
      )
    }
  }

  const pathRe = /<path\b([^>]*)\/?>/gi
  while ((m = pathRe.exec(stripComments)) !== null) {
    const attrs = m[1]
    const d = /d="([^"]*)"/i.exec(attrs)?.[1]
    const bbox = pathDToRoughBBox(d)
    if (bbox && bbox.width > 2 && bbox.height > 2) {
      elements.push(
        baseCommon({
          type: 'rectangle',
          x: bbox.x,
          y: bbox.y,
          width: bbox.width,
          height: bbox.height,
          strokeColor: '#868e96',
          backgroundColor: 'transparent',
          strokeStyle: 'dashed'
        })
      )
    }
  }

  if (elements.length === 0) {
    warnings.push('No convertible primitives found in SVG (try Trace mode with the PDF as background).')
  } else {
    warnings.push(
      'Experimental conversion: review all shapes. Complex paths were approximated as dashed boxes where needed.'
    )
  }

  return { elements, warnings }
}
