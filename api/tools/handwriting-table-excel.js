import { google } from 'googleapis'
import XLSX from 'xlsx'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { authRequired } from '../_lib/authRequired.js'
import { badRequest, ok, serverError, serviceUnavailable } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'

const MAX_BYTES = 25 * 1024 * 1024
const TABLE_CONFIDENCE_THRESHOLD = 0.78
const REVIEW_CONFIDENCE_THRESHOLD = 0.72

function getGoogleConfig() {
  const projectId = process.env.GOOGLE_DOCUMENT_AI_PROJECT_ID || ''
  const location = process.env.GOOGLE_DOCUMENT_AI_LOCATION || 'us'
  const processorId = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID || ''
  const credentialsJson = process.env.GOOGLE_DOCUMENT_AI_CREDENTIALS_JSON || ''

  if (!projectId || !processorId || !credentialsJson) return null

  let credentials = null
  try {
    credentials = JSON.parse(credentialsJson)
  } catch {
    throw new Error('GOOGLE_DOCUMENT_AI_CREDENTIALS_JSON is not valid JSON')
  }

  return { projectId, location, processorId, credentials }
}

function getTextFromAnchor(fullText, textAnchor) {
  if (!fullText || !textAnchor || !Array.isArray(textAnchor.textSegments)) return ''
  const parts = textAnchor.textSegments.map((seg) => {
    const start = Number(seg.startIndex || 0)
    const end = Number(seg.endIndex || 0)
    return fullText.slice(start, end)
  })
  return parts.join('').replace(/\s+/g, ' ').trim()
}

function extractRowsFromTable(docText, table) {
  const headerCells = (table.headerRows || []).flatMap((row) => row.cells || [])
  const header = headerCells.map((cell) => getTextFromAnchor(docText, cell.layout?.textAnchor))
  const bodyRows = (table.bodyRows || []).map((row) =>
    (row.cells || []).map((cell) => getTextFromAnchor(docText, cell.layout?.textAnchor))
  )
  return { header, rows: bodyRows }
}

function averageConfidence(table) {
  const rowLayouts = [...(table.headerRows || []), ...(table.bodyRows || [])]
  const confidences = rowLayouts
    .map((row) => Number(row.layout?.confidence || 0))
    .filter((n) => Number.isFinite(n) && n > 0)
  if (!confidences.length) return 0
  return confidences.reduce((sum, n) => sum + n, 0) / confidences.length
}

function normalizeHeaderName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function canonicalKey(header) {
  const h = normalizeHeaderName(header)
  if (!h) return null
  if (/(date|day)/.test(h)) return 'date'
  if (/(asset|truck|machine|reg|vehicle|equipment)/.test(h)) return 'asset'
  if (/(litre|liter|ltrs|qty|quantity|issued|volume)/.test(h)) return 'litres'
  if (/(operator|driver|issued by|name)/.test(h)) return 'operator'
  if (/(site|pit|area|location)/.test(h)) return 'location'
  if (/(shift)/.test(h)) return 'shift'
  if (/(remarks|comment|note)/.test(h)) return 'remarks'
  return null
}

function parseLitres(value) {
  const raw = String(value || '').replace(/,/g, '.').replace(/[^\d.]/g, '')
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function normalizeTables(tables) {
  const normalizedRows = []
  const reviewRows = []

  for (const table of tables) {
    const headers = Array.isArray(table.headers) ? table.headers : []
    const colMap = headers.map((h) => canonicalKey(h))

    for (const row of table.rows || []) {
      const entity = {
        sourceTable: table.title,
        sourceConfidence: table.confidence,
        date: '',
        asset: '',
        litres: null,
        operator: '',
        location: '',
        shift: '',
        remarks: ''
      }

      row.forEach((cell, idx) => {
        const key = colMap[idx]
        if (!key) return
        if (key === 'litres') entity.litres = parseLitres(cell)
        else entity[key] = String(cell || '').trim()
      })

      const requiredMissing = !entity.date || !entity.asset || entity.litres == null
      if (requiredMissing || Number(table.confidence || 0) < REVIEW_CONFIDENCE_THRESHOLD) {
        reviewRows.push(entity)
      } else {
        normalizedRows.push(entity)
      }
    }
  }

  return { normalizedRows, reviewRows }
}

async function processWithGoogleDocumentAI({ buffer, mimeType }) {
  const cfg = getGoogleConfig()
  if (!cfg) return null

  const auth = new google.auth.GoogleAuth({
    credentials: cfg.credentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  })

  const client = await auth.getClient()
  const accessToken = await client.getAccessToken()
  const token = typeof accessToken === 'string' ? accessToken : accessToken?.token
  if (!token) throw new Error('Failed to obtain Google access token')

  const endpoint = `https://${cfg.location}-documentai.googleapis.com/v1/projects/${cfg.projectId}/locations/${cfg.location}/processors/${cfg.processorId}:process`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      skipHumanReview: true,
      rawDocument: {
        mimeType,
        content: buffer.toString('base64')
      }
    })
  })

  if (!response.ok) {
    const errBody = await response.text().catch(() => '')
    throw new Error(`Google Document AI failed (${response.status}): ${errBody.slice(0, 400)}`)
  }

  const payload = await response.json()
  const doc = payload.document || {}
  const fullText = doc.text || ''
  const pages = Array.isArray(doc.pages) ? doc.pages : []
  const tables = []

  pages.forEach((page, pageIndex) => {
    ;(page.tables || []).forEach((tbl, tableIndex) => {
      const extracted = extractRowsFromTable(fullText, tbl)
      const confidence = averageConfidence(tbl)
      if (!extracted.rows.length) return
      tables.push({
        id: `p${pageIndex + 1}_t${tableIndex + 1}`,
        title: `Page ${pageIndex + 1} Table ${tableIndex + 1}`,
        headers: extracted.header.length ? extracted.header : extracted.rows[0].map((_, i) => `Column ${i + 1}`),
        rows: extracted.rows,
        confidence
      })
    })
  })

  return {
    method: 'google-document-ai',
    tables,
    metadata: {
      pageCount: pages.length,
      tableCount: tables.length
    }
  }
}

async function processWithOpenAIFallback({ buffer, mimeType }) {
  if (!process.env.OPENAI_API_KEY) return null
  const openaiModule = await import('openai').catch(() => null)
  if (!openaiModule) return null

  const openai = new openaiModule.OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const base64Image = buffer.toString('base64')

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 4000,
    messages: [
      {
        role: 'system',
        content: 'Extract handwritten document tables accurately and output valid JSON only.'
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract all handwritten tables from this document. Return JSON: {"tables":[{"title":"...","headers":["..."],"rows":[["..."]],"confidence":0.0}]}'
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
              detail: 'high'
            }
          }
        ]
      }
    ]
  })

  const raw = completion.choices?.[0]?.message?.content || '{}'
  const parsed = JSON.parse(raw)
  const tables = Array.isArray(parsed.tables) ? parsed.tables : []
  return {
    method: 'openai-fallback',
    tables: tables.map((t, idx) => ({
      id: `fallback_t${idx + 1}`,
      title: t.title || `Fallback Table ${idx + 1}`,
      headers: Array.isArray(t.headers) ? t.headers : [],
      rows: Array.isArray(t.rows) ? t.rows : [],
      confidence: Number(t.confidence || 0.7)
    })),
    metadata: { tableCount: tables.length }
  }
}

function buildWorkbook({ tables, normalizedRows, reviewRows }) {
  const wb = XLSX.utils.book_new()

  tables.forEach((table, idx) => {
    const sheetData = [table.headers, ...table.rows]
    const sheet = XLSX.utils.aoa_to_sheet(sheetData)
    const sheetName = (`Table_${idx + 1}`).slice(0, 31)
    XLSX.utils.book_append_sheet(wb, sheet, sheetName)
  })

  const consolidated = normalizedRows.map((r) => ({
    Date: r.date,
    Asset: r.asset,
    Litres: r.litres,
    Operator: r.operator,
    Location: r.location,
    Shift: r.shift,
    Remarks: r.remarks,
    SourceTable: r.sourceTable,
    SourceConfidence: r.sourceConfidence
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(consolidated), 'Consolidated')

  if (reviewRows.length) {
    const review = reviewRows.map((r) => ({
      Date: r.date,
      Asset: r.asset,
      Litres: r.litres,
      Operator: r.operator,
      Location: r.location,
      Shift: r.shift,
      Remarks: r.remarks,
      SourceTable: r.sourceTable,
      SourceConfidence: r.sourceConfidence
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(review), 'ReviewNeeded')
  }

  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
}

async function handler(req, res) {
  try {
    if (req.method !== 'POST') return badRequest(res, 'Method not allowed')
    const payload = await parseJsonBody(req)
    const file = payload?.file || {}
    const dataUrl = file.dataUrl || ''

    if (!dataUrl.startsWith('data:')) return badRequest(res, 'Invalid file payload')

    const match = dataUrl.match(/^data:(.*?);base64,(.*)$/)
    if (!match) return badRequest(res, 'Invalid dataUrl format')

    const mimeType = match[1] || file.type || 'application/octet-stream'
    if (!mimeType.startsWith('image/') && !mimeType.includes('pdf')) {
      return badRequest(res, 'Only image and PDF files are supported')
    }

    const buffer = Buffer.from(match[2], 'base64')
    if (buffer.length > MAX_BYTES) return badRequest(res, 'File too large (max 25MB)')

    const googleResult = await processWithGoogleDocumentAI({ buffer, mimeType }).catch((e) => ({
      error: e
    }))

    let extraction = null
    let fallbackUsed = false
    let warnings = []

    if (googleResult && !googleResult.error && Array.isArray(googleResult.tables) && googleResult.tables.length) {
      extraction = googleResult
    } else {
      const openAiFallback = await processWithOpenAIFallback({ buffer, mimeType }).catch((e) => ({ error: e }))
      if (openAiFallback && !openAiFallback.error && Array.isArray(openAiFallback.tables) && openAiFallback.tables.length) {
        extraction = openAiFallback
        fallbackUsed = true
      } else if (googleResult?.error) {
        warnings.push(`Primary extraction failed: ${googleResult.error.message}`)
      }
    }

    if (!extraction) {
      if (!getGoogleConfig()) {
        return serviceUnavailable(
          res,
          'Google Document AI is not configured. Set GOOGLE_DOCUMENT_AI_PROJECT_ID, GOOGLE_DOCUMENT_AI_LOCATION, GOOGLE_DOCUMENT_AI_PROCESSOR_ID and GOOGLE_DOCUMENT_AI_CREDENTIALS_JSON.'
        )
      }
      return serverError(res, 'No tables could be extracted from the document')
    }

    const confidentTables = extraction.tables.filter(
      (t) => Number(t.confidence || 0) >= TABLE_CONFIDENCE_THRESHOLD || extraction.method === 'openai-fallback'
    )
    const tablesForOutput = confidentTables.length ? confidentTables : extraction.tables
    const { normalizedRows, reviewRows } = normalizeTables(tablesForOutput)
    const workbookBase64 = buildWorkbook({ tables: tablesForOutput, normalizedRows, reviewRows })
    const originalName = String(file.name || 'handwriting-document')
    const downloadName = originalName.replace(/\.[^.]+$/, '') + '-tables.xlsx'

    return ok(res, {
      success: true,
      method: extraction.method,
      fallbackUsed,
      warnings,
      tables: tablesForOutput,
      normalizedRows,
      reviewRows,
      workbook: {
        fileName: downloadName,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        base64: workbookBase64
      },
      metadata: {
        ...(extraction.metadata || {}),
        extractedAt: new Date().toISOString()
      }
    })
  } catch (e) {
    console.error('handwriting-table-excel error:', e)
    return serverError(res, 'Failed to process handwritten tables', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
