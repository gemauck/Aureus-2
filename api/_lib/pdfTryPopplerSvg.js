import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

/**
 * Try pdftocairo (Poppler) to produce SVG for page 1. Requires `pdftocairo` on PATH (e.g. apt install poppler-utils).
 * @param {Buffer} pdfBuffer
 * @returns {string|null} SVG markup or null if unavailable / failed
 */
export function tryPdfBufferToSvgPoppler(pdfBuffer) {
  if (!pdfBuffer || pdfBuffer.length < 8) return null
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfpop-'))
  const pdfPath = path.join(dir, 'input.pdf')
  const outPrefix = path.join(dir, 'out')
  try {
    fs.writeFileSync(pdfPath, pdfBuffer)
    execFileSync('pdftocairo', ['-svg', '-f', '1', '-l', '1', pdfPath, outPrefix], {
      stdio: 'ignore',
      timeout: 60000
    })
    const svgPath = `${outPrefix}.svg`
    if (fs.existsSync(svgPath)) {
      return fs.readFileSync(svgPath, 'utf8')
    }
  } catch (_) {
    return null
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch (_) {}
  }
  return null
}
