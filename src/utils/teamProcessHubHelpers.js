/**
 * Pure helpers for Teams Process Hub import routing (unit-tested).
 */

export function isDrawioXml(text) {
  if (!text || typeof text !== 'string') return false
  const t = text.trim()
  return t.includes('<mxfile') || t.includes('mxGraphModel') || t.includes('<diagram ')
}

export function sniffImportKind(fileName, headText, headBytes) {
  const lower = (fileName || '').toLowerCase()
  if (lower.endsWith('.zip')) return 'zip'
  if (lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.svg')) return 'svg'
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'excel'
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) return 'word'
  if (lower.endsWith('.drawio') || lower.endsWith('.xml')) {
    const headSlice = (headText || '').trimStart().slice(0, 1024)
    if (headSlice && /<svg[\s>/]/i.test(headSlice)) return 'svg'
    if (headText && isDrawioXml(headText)) return 'drawio'
    return lower.endsWith('.drawio') ? 'drawio' : 'xml'
  }
  if (headBytes && headBytes.length >= 4) {
    if (headBytes[0] === 0x25 && headBytes[1] === 0x50 && headBytes[2] === 0x44 && headBytes[3] === 0x46) return 'pdf'
    if (headBytes[0] === 0x50 && headBytes[1] === 0x4b) return 'zip'
  }
  if (headText && isDrawioXml(headText)) return 'drawio'
  const headSlice = (headText || '').trimStart().slice(0, 1024)
  if (headSlice && /<svg[\s>/]/i.test(headSlice)) return 'svg'
  return 'unknown'
}

export function sanitizeImportTitle(fileName) {
  const base = (fileName || '').replace(/^.*[/\\]/, '').replace(/\.[^.]+$/, '')
  return base.replace(/[_-]+/g, ' ').trim() || 'Imported'
}
