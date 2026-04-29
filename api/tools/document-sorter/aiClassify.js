/**
 * Optional LLM classification for diesel refund File 1–7 using taxonomy.md
 */

import { loadTaxonomyMarkdown } from './extractText.js'
import { folderNameForFileNum } from './classify.js'

let openai = null
let openaiInitialized = false

async function getOpenAI() {
  if (openaiInitialized) return openai
  try {
    const openaiModule = await import('openai').catch(() => null)
    if (openaiModule && process.env.OPENAI_API_KEY) {
      openai = new openaiModule.OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    }
  } catch (_) {}
  openaiInitialized = true
  return openai
}

export function mapLLMCategoryToFileNum(fileCategory) {
  if (!fileCategory || typeof fileCategory !== 'string') return null
  const m = fileCategory.match(/File\s*(\d)/i)
  if (!m) return null
  const n = parseInt(m[1], 10)
  if (n >= 1 && n <= 7) return n
  return null
}

/**
 * @param {{ fileName: string, text: string }} input
 * @param {{ model?: string }} options
 * @returns {Promise<{ fileNum: number | null, folderName: string, evidenceType?: string, confidence?: number, summary?: string, method: string, error?: string }>}
 */
export async function classifyWithLLM(input, options = {}) {
  const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const client = await getOpenAI()

  if (!client || !process.env.OPENAI_API_KEY) {
    return {
      fileNum: null,
      folderName: 'Uncategorized',
      method: 'unavailable',
      error: 'OPENAI_API_KEY not configured',
    }
  }

  const taxonomy = loadTaxonomyMarkdown()

  const systemPrompt = `You are an expert on South African diesel refund evidence filing.
Classify the document into exactly one of: File 1, File 2, File 3, File 4, File 5, File 6, or File 7 using the taxonomy below.

TAXONOMY:
${taxonomy || '(taxonomy file missing — use general diesel refund knowledge)'}

Respond with JSON only:
{
  "fileCategory": "File 1" | "File 2" | ... | "File 7",
  "evidenceType": "short label e.g. Invoice, Mining Right",
  "confidence": number 0-100,
  "summary": "one sentence"
}`

  const userPrompt = `File name: ${input.fileName}

Extracted content (may be partial):
${(input.text || '[no extractable text — use filename hints only]').substring(0, 16000)}`

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 800,
    })

    const raw = response.choices[0]?.message?.content || '{}'
    let parsed = {}
    try {
      parsed = JSON.parse(raw)
    } catch {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
    }

    const fileNum = mapLLMCategoryToFileNum(parsed.fileCategory || '')
    const folderName = fileNum != null ? folderNameForFileNum(fileNum) : 'Uncategorized'

    return {
      fileNum,
      folderName,
      evidenceType: parsed.evidenceType,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : undefined,
      summary: parsed.summary,
      method: 'llm',
      model,
    }
  } catch (e) {
    return {
      fileNum: null,
      folderName: 'Uncategorized',
      method: 'error',
      error: e.message || String(e),
    }
  }
}
