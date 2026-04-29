/**
 * Extract plain text from common document types for diesel sorter AI pass.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let cachedTaxonomy = null
export function loadTaxonomyMarkdown() {
  if (cachedTaxonomy) return cachedTaxonomy
  const p = path.join(__dirname, 'taxonomy.md')
  try {
    cachedTaxonomy = fs.readFileSync(p, 'utf8')
  } catch {
    cachedTaxonomy = ''
  }
  return cachedTaxonomy
}

function parseExcelBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  let textContent = ''
  workbook.SheetNames.forEach((sheetName, index) => {
    const worksheet = workbook.Sheets[sheetName]
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })
    textContent += `\n--- Sheet ${index + 1}: ${sheetName} ---\n`
    jsonData.forEach((row, rowIndex) => {
      if (Array.isArray(row)) {
        const rowText = row.filter((cell) => cell !== null && cell !== undefined && cell !== '').join(' | ')
        if (rowText.trim()) textContent += `Row ${rowIndex + 1}: ${rowText}\n`
      }
    })
  })
  return textContent
}

/**
 * @param {Buffer} buffer
 * @param {string} fileName
 * @returns {Promise<{ text: string, truncated: boolean, error?: string }>}
 */
export async function extractTextForSorter(buffer, fileName) {
  const ext = path.extname(fileName || '').toLowerCase()

  try {
    if (ext === '.xlsx' || ext === '.xls') {
      const text = parseExcelBuffer(buffer)
      return truncateResult(text)
    }
    if (ext === '.csv' || ext === '.txt') {
      return truncateResult(buffer.toString('utf-8'))
    }
    if (ext === '.pdf') {
      const pdfParse = await import('pdf-parse').catch(() => null)
      if (!pdfParse?.default) {
        return { text: '', truncated: false, error: 'pdf-parse not available' }
      }
      const data = await pdfParse.default(buffer)
      return truncateResult((data?.text || '').trim())
    }
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext)) {
      return {
        text: '',
        truncated: false,
        error: 'Image file — no text extraction in sorter (filename-based only for AI)',
      }
    }
    const asText = buffer.toString('utf-8')
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(asText.slice(0, Math.min(512, asText.length)))) {
      return { text: '', truncated: false, error: 'Binary or unsupported type' }
    }
    return truncateResult(asText)
  } catch (e) {
    return { text: '', truncated: false, error: e.message || String(e) }
  }
}

const MAX_CHARS = 15000

function truncateResult(text) {
  const t = (text || '').trim()
  if (t.length <= MAX_CHARS) return { text: t, truncated: false }
  return { text: t.substring(0, MAX_CHARS) + '\n\n[Content truncated]', truncated: true }
}
