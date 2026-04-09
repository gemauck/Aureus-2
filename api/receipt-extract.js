// POST /api/receipt-extract — authenticated receipt/invoice/slip extraction (OpenAI vision or pdf-parse + text model)
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import OpenAI, { APIConnectionError, APIError } from 'openai'
import { authRequired } from './_lib/authRequired.js'
import { badRequest, ok, serverError, serviceUnavailable } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

const ALLOWED_UPLOAD_FOLDER = 'receipt-capture'
const MAX_DOC_BYTES = 20 * 1024 * 1024
const MAX_PDF_TEXT_CHARS = 100000

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

function resolveSafeUploadFile(publicPath) {
  if (!publicPath || typeof publicPath !== 'string') return null
  const trimmed = publicPath.split('?')[0].trim()
  if (!trimmed.startsWith('/uploads/')) return null
  const rel = trimmed.replace(/^\/uploads\//, '')
  const segments = rel.split('/').filter(Boolean)
  if (segments.length < 2) return null
  if (segments[0] !== ALLOWED_UPLOAD_FOLDER) return null
  for (const s of segments) {
    if (s === '..' || s.includes('..') || s.includes('\0')) return null
  }
  const full = path.join(rootDir, 'uploads', ...segments)
  const resolved = path.resolve(full)
  const uploadsRoot = path.resolve(rootDir, 'uploads')
  if (!resolved.startsWith(uploadsRoot + path.sep)) return null
  return resolved
}

function mimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.heic' || ext === '.heif') return 'image/heic'
  return 'image/jpeg'
}

function kindFromMime(mime) {
  const m = (mime || '').split(';')[0].trim().toLowerCase()
  if (m === 'application/pdf') return 'pdf'
  return 'image'
}

async function loadDocumentForExtraction(body) {
  if (body.imageBase64 && typeof body.imageBase64 === 'string') {
    const raw = body.imageBase64.replace(/^data:[^;]+;base64,/i, '')
    const buf = Buffer.from(raw, 'base64')
    if (buf.length < 32 || buf.length > MAX_DOC_BYTES) {
      return { error: 'Invalid file size (32B–20MB)' }
    }
    const mimeMatch = String(body.imageBase64).match(/^data:([^;]+);base64,/i)
    const mime = mimeMatch
      ? mimeMatch[1].split(';')[0].trim()
      : typeof body.mimeType === 'string'
        ? body.mimeType.split(';')[0].trim()
        : 'image/jpeg'
    const k = kindFromMime(mime)
    if (k === 'pdf') return { kind: 'pdf', buffer: buf, mimeType: 'application/pdf' }
    if (!/^image\//i.test(mime)) {
      return { error: 'Unsupported file type (use an image or PDF)' }
    }
    return { kind: 'image', buffer: buf, mimeType: mime }
  }

  const imageUrl = body.imageUrl || body.uploadedUrl
  if (!imageUrl || typeof imageUrl !== 'string') {
    return { error: 'Provide imageUrl (/uploads/receipt-capture/...) or imageBase64' }
  }

  const filePath = resolveSafeUploadFile(imageUrl)
  if (!filePath || !fs.existsSync(filePath)) {
    return { error: 'Invalid or missing file (use folder receipt-capture)' }
  }

  const buf = fs.readFileSync(filePath)
  if (buf.length < 32 || buf.length > MAX_DOC_BYTES) {
    return { error: 'File size invalid (max 20MB)' }
  }
  const mime = mimeFromPath(filePath)
  const k = kindFromMime(mime)
  if (k === 'pdf') return { kind: 'pdf', buffer: buf, mimeType: 'application/pdf' }
  return { kind: 'image', buffer: buf, mimeType: mime }
}

function normalizeReceipt(parsed) {
  const docType = String(parsed.documentType || 'other').toLowerCase()
  const documentType = ['invoice', 'receipt', 'payment_slip', 'other'].includes(docType) ? docType : 'other'
  const lineItems = Array.isArray(parsed.lineItems) ? parsed.lineItems : []
  const cleanLines = lineItems
    .map((row) => ({
      description: String(row.description || '').trim(),
      amount: Number.isFinite(parseFloat(row.amount)) ? parseFloat(row.amount) : 0
    }))
    .filter((row) => row.description || row.amount > 0)

  return {
    vendor: String(parsed.vendor || '').trim(),
    documentDate: String(parsed.documentDate || '').trim().slice(0, 32),
    currency: String(parsed.currency || 'ZAR')
      .trim()
      .slice(0, 8),
    documentType,
    subtotal: Number.isFinite(parseFloat(parsed.subtotal)) ? parseFloat(parsed.subtotal) : 0,
    taxAmount: Number.isFinite(parseFloat(parsed.taxAmount)) ? parseFloat(parsed.taxAmount) : 0,
    total: Number.isFinite(parseFloat(parsed.total)) ? parseFloat(parsed.total) : 0,
    paymentMethodHint: String(parsed.paymentMethodHint || '').trim(),
    lineItems: cleanLines,
    rawNotes: String(parsed.rawNotes || '').trim().slice(0, 2000)
  }
}

function openAiErrorDetail(error) {
  if (error instanceof APIError) {
    const inner = error.error
    if (inner && typeof inner === 'object' && typeof inner.message === 'string') {
      return inner.message
    }
    return typeof error.message === 'string' ? error.message : String(error)
  }
  return typeof error?.message === 'string' ? error.message : String(error)
}

async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return badRequest(res, 'Method not allowed')
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        error: {
          code: 'NO_OPENAI',
          message: 'Receipt extraction is not configured on this server'
        }
      })
    }

    const body = await parseJsonBody(req)
    const loaded = await loadDocumentForExtraction(body)
    if (loaded.error) {
      return badRequest(res, loaded.error)
    }

    const systemPrompt = `You extract structured data from photos or scans of receipts, invoices, payment slips, and card machine slips.
Return ONLY valid JSON (no markdown) with this exact shape:
{"vendor":"","documentDate":"","currency":"ZAR","documentType":"invoice|receipt|payment_slip|other","subtotal":0,"taxAmount":0,"total":0,"paymentMethodHint":"","lineItems":[{"description":"","amount":0}],"rawNotes":""}
Rules:
- vendor: merchant/supplier name if visible.
- documentDate: ISO date YYYY-MM-DD if you can infer; else "".
- currency: ISO code (e.g. ZAR).
- documentType: best fit.
- subtotal/taxAmount/total: numbers from the document; if only total visible, put it in total and set subtotal/tax to 0 if unknown.
- paymentMethodHint: card/cash/EFT etc. if shown.
- lineItems: main line rows if visible; else one line with description "Total" and amount = total.
- rawNotes: any reference numbers (not full card numbers — mask middle digits if present).`

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const model = process.env.RECEIPT_EXTRACT_VISION_MODEL || 'gpt-4o-mini'

    let completion
    if (loaded.kind === 'pdf') {
      let text = ''
      try {
        const pdfParseMod = await import('pdf-parse')
        const pdfParse = pdfParseMod.default || pdfParseMod
        const parsed = await pdfParse(loaded.buffer)
        text = String(parsed?.text || '').trim()
      } catch (parseErr) {
        console.warn('receipt-extract: pdf-parse failed', parseErr?.message)
        return badRequest(
          res,
          'Could not read this PDF. It may be encrypted or corrupt. Try another file or upload a photo.'
        )
      }
      if (!text || text.length < 12) {
        return badRequest(
          res,
          'No extractable text in this PDF (scanned/image-only PDFs are not supported here). Upload a photo or a text-based PDF.'
        )
      }
      const clipped =
        text.length > MAX_PDF_TEXT_CHARS ? `${text.slice(0, MAX_PDF_TEXT_CHARS)}\n...[truncated]` : text

      completion = await openai.chat.completions.create({
        model: process.env.RECEIPT_EXTRACT_TEXT_MODEL || model,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `${systemPrompt}\nThe user message is plain text extracted from a PDF.`
          },
          {
            role: 'user',
            content: `Extract structured receipt data from this text:\n\n${clipped}`
          }
        ]
      })
    } else {
      const b64 = loaded.buffer.toString('base64')
      const dataUrl = `data:${loaded.mimeType};base64,${b64}`

      completion = await openai.chat.completions.create({
        model,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract structured data from this receipt or invoice image.' },
              { type: 'image_url', image_url: { url: dataUrl } }
            ]
          }
        ]
      })
    }

    const rawText = completion?.choices?.[0]?.message?.content
    if (!rawText || typeof rawText !== 'string') {
      return serverError(res, 'Empty model response', 'OPENAI_EMPTY')
    }

    let parsed
    try {
      parsed = JSON.parse(rawText)
    } catch {
      return serverError(res, 'Model returned non-JSON', rawText.slice(0, 200))
    }

    const extraction = normalizeReceipt(parsed)
    return ok(res, { extraction })
  } catch (error) {
    const detail = openAiErrorDetail(error)
    console.error('receipt-extract error:', detail, error)

    if (error instanceof APIConnectionError) {
      return serviceUnavailable(
        res,
        'Could not reach the extraction service. Try again shortly.',
        'OPENAI_CONNECTION'
      )
    }

    if (error instanceof APIError) {
      const st = error.status
      if (st === 401) {
        return serviceUnavailable(
          res,
          'Receipt extraction is not available. Ask your administrator to verify OPENAI_API_KEY.',
          'OPENAI_UNAUTHORIZED'
        )
      }
      if (st === 403) {
        return serviceUnavailable(res, 'Receipt extraction is not available for this deployment.', 'OPENAI_FORBIDDEN')
      }
      if (st === 429) {
        return serviceUnavailable(res, 'Receipt extraction is busy. Wait a moment and try again.', 'OPENAI_RATE_LIMIT')
      }
      if (st === 400 || st === 422) {
        return badRequest(res, 'Could not extract from this document', detail)
      }
      if (st >= 500) {
        return serviceUnavailable(res, 'Extraction had a temporary error. Try again.', 'OPENAI_UPSTREAM')
      }
    }

    return serverError(res, 'Receipt extraction failed', detail)
  }
}

export default withHttp(withLogging(authRequired(handler)))
