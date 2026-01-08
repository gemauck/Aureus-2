import fs from 'fs'
import path from 'path'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { authRequired } from '../_lib/authRequired.js'
import { badRequest, serverError, ok } from '../_lib/response.js'
import { parseJsonBody } from '../_lib/body.js'
import XLSX from 'xlsx'

// Initialize OpenAI client (optional - can use other LLM providers)
let openai = null
let openaiInitialized = false

async function initializeOpenAI() {
  if (openaiInitialized) return openai
  
  try {
    // Try to load OpenAI SDK if available
    const openaiModule = await import('openai').catch(() => null)
    if (openaiModule && process.env.OPENAI_API_KEY) {
      openai = new openaiModule.OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      })
      openaiInitialized = true
      return openai
    }
  } catch (e) {
    console.warn('OpenAI SDK not available. LLM analysis will use fallback method.')
  }
  
  openaiInitialized = true
  return null
}

/**
 * Parse Excel file to extract text content
 */
function parseExcelFile(buffer) {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    let textContent = ''
    
    workbook.SheetNames.forEach((sheetName, index) => {
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })
      
      textContent += `\n--- Sheet ${index + 1}: ${sheetName} ---\n`
      jsonData.forEach((row, rowIndex) => {
        if (Array.isArray(row)) {
          const rowText = row.filter(cell => cell !== null && cell !== undefined && cell !== '').join(' | ')
          if (rowText.trim()) {
            textContent += `Row ${rowIndex + 1}: ${rowText}\n`
          }
        } else {
          textContent += `Row ${rowIndex + 1}: ${JSON.stringify(row)}\n`
        }
      })
    })
    
    return textContent
  } catch (error) {
    throw new Error(`Failed to parse Excel file: ${error.message}`)
  }
}

/**
 * Parse text file
 */
function parseTextFile(buffer) {
  return buffer.toString('utf-8')
}

/**
 * Extract text from file based on type
 */
async function extractFileContent(fileBuffer, fileName, mimeType) {
  const ext = path.extname(fileName).toLowerCase()
  
  if (ext === '.xlsx' || ext === '.xls' || mimeType?.includes('spreadsheet')) {
    return parseExcelFile(fileBuffer)
  } else if (ext === '.txt' || ext === '.csv' || mimeType?.includes('text')) {
    return parseTextFile(fileBuffer)
  } else if (ext === '.pdf' || mimeType?.includes('pdf')) {
    // PDF parsing would require pdf-parse or similar library
    // For now, return a message indicating PDF support needs to be added
    throw new Error('PDF parsing not yet implemented. Please convert PDF to text first.')
  } else {
    // Try to parse as text
    try {
      return parseTextFile(fileBuffer)
    } catch (e) {
      throw new Error(`Unsupported file type: ${ext || mimeType}`)
    }
  }
}

/**
 * Analyze content using LLM
 */
async function analyzeWithLLM(content, fileName, options = {}) {
  const { useLLM = true, model = 'gpt-4o-mini' } = options
  
  // Initialize OpenAI if not already done
  if (useLLM && !openaiInitialized) {
    await initializeOpenAI()
  }
  
  if (!useLLM || !openai || !process.env.OPENAI_API_KEY) {
    // Fallback to basic analysis
    return {
      analysis: 'LLM analysis not available. Please configure OPENAI_API_KEY environment variable.',
      method: 'fallback',
      content: content.substring(0, 1000) + (content.length > 1000 ? '...' : '')
    }
  }

  const systemPrompt = `You are an expert evaluator for diesel refund evidence documents in South Africa. 
Your task is to analyze documents and determine if they qualify as evidence for diesel refund claims.

Analyze the provided document content and provide a comprehensive evaluation in JSON format with the following structure:
{
  "isValid": boolean,
  "evidenceType": "string (e.g., 'Asset Register - Mining Assets', 'Invoice', 'Delivery Note')",
  "fileCategory": "string (e.g., 'File 1', 'File 2', 'File 3', 'File 4', 'File 5', 'File 6', 'File 7')",
  "relevanceScore": number (0-100),
  "criteria": {
    "hasRequiredFields": boolean,
    "hasValidDates": boolean,
    "hasValidAmounts": boolean,
    "hasSupportingDocuments": boolean,
    "isComplete": boolean
  },
  "issues": ["array of issues found"],
  "recommendations": ["array of recommendations"],
  "metadata": {
    "detectedFields": ["array of detected field names"],
    "detectedDates": ["array of detected dates"],
    "detectedAmounts": ["array of detected amounts"],
    "detectedEntities": ["array of detected company/person names"]
  },
  "summary": "brief summary of the document",
  "confidence": number (0-100, confidence in the analysis)
}

Focus on:
- Classifying the document according to the 7-file structure for diesel refund claims
- Identifying missing required fields
- Detecting dates, amounts, and entities
- Providing actionable recommendations
- Assessing completeness and validity`

  const userPrompt = `Analyze the following document for diesel refund evidence evaluation:

File Name: ${fileName}

Document Content:
${content.substring(0, 15000)}${content.length > 15000 ? '\n\n[Content truncated for length]' : ''}

Provide your analysis in the JSON format specified.`

  try {
    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3, // Lower temperature for more consistent analysis
      max_tokens: 2000
    })

    const analysisText = response.choices[0]?.message?.content || '{}'
    let analysis = {}
    
    try {
      analysis = JSON.parse(analysisText)
    } catch (e) {
      // If JSON parsing fails, try to extract JSON from the response
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Failed to parse LLM response as JSON')
      }
    }

    return {
      ...analysis,
      method: 'llm',
      model: model,
      rawResponse: analysisText
    }
  } catch (error) {
    console.error('LLM analysis error:', error)
    throw new Error(`LLM analysis failed: ${error.message}`)
  }
}

async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return badRequest(res, 'Method not allowed')
    }

    const payload = await parseJsonBody(req)
    
    // Support both file upload and direct content
    let content = ''
    let fileName = 'unknown'
    let mimeType = 'text/plain'

    if (payload.file) {
      // File upload via data URL
      const { name, dataUrl, type } = payload.file
      
      if (!dataUrl || !dataUrl.startsWith('data:')) {
        return badRequest(res, 'Invalid file data URL')
      }

      // Parse data URL
      const match = dataUrl.match(/^data:(.*?);base64,(.*)$/)
      if (!match) {
        return badRequest(res, 'Invalid dataUrl format')
      }

      mimeType = match[1] || type || 'application/octet-stream'
      const base64 = match[2]
      const buffer = Buffer.from(base64, 'base64')

      // Security: restrict max size (20MB for LLM analysis)
      const MAX_BYTES = 20 * 1024 * 1024
      if (buffer.length > MAX_BYTES) {
        return badRequest(res, 'File too large (max 20MB)')
      }

      fileName = name || 'uploaded-file'
      
      // Extract content from file
      content = await extractFileContent(buffer, fileName, mimeType)
    } else if (payload.content) {
      // Direct text/JSON content
      content = typeof payload.content === 'string' 
        ? payload.content 
        : JSON.stringify(payload.content, null, 2)
      fileName = payload.fileName || 'text-input'
    } else {
      return badRequest(res, 'Either file or content must be provided')
    }

    // Analyze with LLM
    const useLLM = payload.useLLM !== false // Default to true
    const model = payload.model || process.env.OPENAI_MODEL || 'gpt-4o-mini'
    
    let analysis
    try {
      analysis = await analyzeWithLLM(content, fileName, {
        useLLM,
        model
      })
    } catch (llmError) {
      console.error('LLM analysis error:', llmError)
      // If LLM fails and useLLM is true, still return fallback
      if (useLLM) {
        analysis = await analyzeWithLLM(content, fileName, {
          useLLM: false,
          model
        })
        analysis.error = `LLM analysis failed: ${llmError.message}. Using fallback evaluation.`
      } else {
        throw llmError
      }
    }

    // Merge with basic evaluation if LLM is not used
    if (analysis.method === 'fallback') {
      // Use the existing client-side evaluator logic as fallback
      // For now, return a basic structure
      analysis.isValid = false
      analysis.evidenceType = 'Unknown'
      analysis.fileCategory = 'Unclassified'
      analysis.relevanceScore = 0
      analysis.criteria = {
        hasRequiredFields: false,
        hasValidDates: false,
        hasValidAmounts: false,
        hasSupportingDocuments: false,
        isComplete: false
      }
      analysis.issues = ['LLM analysis not configured. Please set OPENAI_API_KEY environment variable.']
      analysis.recommendations = ['Configure OpenAI API key to enable intelligent document analysis.']
      analysis.metadata = {
        detectedFields: [],
        detectedDates: [],
        detectedAmounts: [],
        detectedEntities: []
      }
    }

    return ok(res, {
      success: true,
      fileName,
      analysis,
      contentLength: content.length,
      timestamp: new Date().toISOString()
    })
  } catch (e) {
    console.error('Evidence analysis error:', e)
    return serverError(res, 'Analysis failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

