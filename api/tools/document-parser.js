import fs from 'fs'
import path from 'path'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { authRequired } from '../_lib/authRequired.js'
import { badRequest, serverError, ok } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'

// Initialize OpenAI client for advanced parsing
let openai = null
let openaiInitialized = false

async function initializeOpenAI() {
  if (openaiInitialized) return openai
  
  try {
    const openaiModule = await import('openai').catch(() => null)
    if (openaiModule && process.env.OPENAI_API_KEY) {
      openai = new openaiModule.OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      })
      openaiInitialized = true
      return openai
    }
  } catch (e) {
    console.warn('OpenAI SDK not available. Will use basic OCR only.')
  }
  
  openaiInitialized = true
  return null
}

/**
 * Extract text from image using Tesseract (basic OCR)
 * This is a fallback when cloud APIs are not available
 */
async function extractTextWithTesseract(imageBuffer) {
  try {
    // Try to use Tesseract via child process or library
    // For now, return a placeholder - in production you'd use tesseract.js or similar
    throw new Error('Tesseract OCR not implemented on server. Use client-side or cloud API.')
  } catch (error) {
    throw new Error(`Tesseract OCR failed: ${error.message}`)
  }
}

/**
 * Extract text and structure from image using OpenAI Vision API
 */
async function extractWithOpenAIVision(imageBuffer, mimeType, options = {}) {
  const { mode = 'comprehensive', extractTables = true, extractStructuredData = true } = options
  
  if (!openai) {
    await initializeOpenAI()
  }
  
  if (!openai || !process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API not configured. Please set OPENAI_API_KEY environment variable.')
  }

  // Convert buffer to base64
  const base64Image = imageBuffer.toString('base64')
  
  // Build prompt based on mode
  let systemPrompt = 'You are an expert document parser. Extract all text and information from the provided document image.'
  let userPrompt = 'Extract all text from this document, including any handwritten text. '
  
  if (mode === 'handwriting') {
    userPrompt += 'Focus especially on handwritten text, even if it is messy or difficult to read. '
  }
  
  if (extractStructuredData) {
    userPrompt += 'Also identify and extract any structured data such as: names, dates, numbers, addresses, email addresses, phone numbers, amounts, invoice numbers, etc. '
  }
  
  if (extractTables) {
    userPrompt += 'If you detect any tables, extract them with their headers and rows. '
  }
  
  userPrompt += 'Return your response as JSON with the following structure: { "extractedText": "all text content", "structuredData": { "key": "value pairs" }, "tables": [ { "title": "table name", "headers": ["col1", "col2"], "rows": [["row1col1", "row1col2"]] } ], "metadata": { "detectedFields": ["field names"], "detectedDates": ["dates"], "detectedAmounts": ["amounts"], "detectedEntities": ["names/companies"] } }'

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // Use vision-capable model
      messages: [
        { role: 'system', content: systemPrompt },
        { 
          role: 'user', 
          content: [
            { type: 'text', text: userPrompt },
            { 
              type: 'image_url', 
              image_url: { 
                url: `data:${mimeType};base64,${base64Image}`,
                detail: 'high' // High detail for better handwriting recognition
              } 
            }
          ]
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1, // Low temperature for accurate extraction
      max_tokens: 4000
    })

    const content = response.choices[0]?.message?.content || '{}'
    let parsed = {}
    
    try {
      parsed = JSON.parse(content)
    } catch (e) {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        // Fallback: return as plain text
        parsed = {
          extractedText: content,
          structuredData: {},
          tables: [],
          metadata: {}
        }
      }
    }

    return {
      ...parsed,
      method: 'openai-vision',
      model: 'gpt-4o'
    }
  } catch (error) {
    console.error('OpenAI Vision API error:', error)
    throw new Error(`OpenAI Vision extraction failed: ${error.message}`)
  }
}

/**
 * Extract text from PDF
 */
async function extractTextFromPDF(pdfBuffer) {
  try {
    // Try to use pdf-parse or similar library
    const pdfParse = await import('pdf-parse').catch(() => null)
    
    if (pdfParse) {
      const data = await pdfParse.default(pdfBuffer)
      return {
        extractedText: data.text,
        structuredData: {},
        tables: [],
        metadata: {
          pages: data.numpages,
          info: data.info
        },
        method: 'pdf-parse'
      }
    } else {
      throw new Error('PDF parsing library not available. Please install pdf-parse.')
    }
  } catch (error) {
    throw new Error(`PDF extraction failed: ${error.message}`)
  }
}

/**
 * Process document based on type and mode
 */
async function processDocument(fileBuffer, fileName, mimeType, options = {}) {
  const { mode = 'comprehensive', extractTables = true, extractStructuredData = true } = options
  
  const ext = path.extname(fileName).toLowerCase()
  
  // Handle PDFs
  if (ext === '.pdf' || mimeType?.includes('pdf')) {
    try {
      return await extractTextFromPDF(fileBuffer)
    } catch (error) {
      // If PDF parsing fails, try to convert first page to image and use vision API
      console.warn('PDF parsing failed, attempting alternative method:', error.message)
      throw new Error('PDF processing requires pdf-parse library. Please install it or convert PDF to image first.')
    }
  }
  
  // Handle images
  if (mimeType?.startsWith('image/')) {
    // Try OpenAI Vision first (best for handwriting)
    if (mode === 'comprehensive' || mode === 'handwriting') {
      try {
        return await extractWithOpenAIVision(fileBuffer, mimeType, { mode, extractTables, extractStructuredData })
      } catch (error) {
        console.warn('OpenAI Vision failed, trying fallback:', error.message)
        // Fall through to basic OCR
      }
    }
    
    // Fallback to basic OCR (Tesseract)
    if (mode === 'basic' || !openai) {
      try {
        return await extractTextWithTesseract(fileBuffer)
      } catch (error) {
        throw new Error(`OCR extraction failed: ${error.message}. Please configure OpenAI API for advanced parsing.`)
      }
    }
    
    // If we get here, try OpenAI anyway
    try {
      return await extractWithOpenAIVision(fileBuffer, mimeType, { mode, extractTables, extractStructuredData })
    } catch (error) {
      throw new Error(`Document parsing failed: ${error.message}`)
    }
  }
  
  throw new Error(`Unsupported file type: ${ext || mimeType}`)
}

async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return badRequest(res, 'Method not allowed')
    }

    const payload = await parseJsonBody(req)
    
    if (!payload.file) {
      return badRequest(res, 'File is required')
    }

    const { name, dataUrl, type } = payload.file
    
    if (!dataUrl || !dataUrl.startsWith('data:')) {
      return badRequest(res, 'Invalid file data URL')
    }

    // Parse data URL
    const match = dataUrl.match(/^data:(.*?);base64,(.*)$/)
    if (!match) {
      return badRequest(res, 'Invalid dataUrl format')
    }

    const mimeType = match[1] || type || 'application/octet-stream'
    const base64 = match[2]
    const buffer = Buffer.from(base64, 'base64')

    // Security: restrict max size (50MB)
    const MAX_BYTES = 50 * 1024 * 1024
    if (buffer.length > MAX_BYTES) {
      return badRequest(res, 'File too large (max 50MB)')
    }

    const fileName = name || 'uploaded-document'
    const mode = payload.mode || 'comprehensive'
    const extractTables = payload.extractTables !== false
    const extractStructuredData = payload.extractStructuredData !== false

    // Process document
    const result = await processDocument(buffer, fileName, mimeType, {
      mode,
      extractTables,
      extractStructuredData
    })

    return ok(res, {
      success: true,
      fileName,
      extractedText: result.extractedText || '',
      structuredData: result.structuredData || {},
      tables: result.tables || [],
      metadata: {
        ...(result.metadata || {}),
        method: result.method || 'unknown',
        model: result.model || null,
        fileSize: buffer.length,
        mimeType: mimeType,
        mode: mode
      },
      timestamp: new Date().toISOString()
    })
  } catch (e) {
    console.error('Document parser error:', e)
    return serverError(res, 'Document parsing failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
