import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..', '..')
const learningFilePath = path.join(rootDir, 'uploads', 'document-sorter-learning.json')
const POP_ALIASES = ['pop', 'p o p', 'p.o.p', 'proof of payment', 'proof of payments', 'proof of paument', 'proof of payement']

function normalizeTokenText(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildLearningTokens(filePath) {
  const text = normalizeTokenText(filePath)
  const tokens = text.split(' ').filter((t) => t.length >= 4)
  return [...new Set(tokens)].slice(0, 10)
}

export function getUserIdFromReq(req) {
  return String(req?.user?.sub || req?.user?.id || '').trim() || 'anonymous'
}

export function readLearningStore() {
  try {
    if (!fs.existsSync(learningFilePath)) return { version: 1, users: {} }
    const raw = fs.readFileSync(learningFilePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { version: 1, users: {} }
    if (!parsed.users || typeof parsed.users !== 'object') parsed.users = {}
    return parsed
  } catch (_) {
    return { version: 1, users: {} }
  }
}

export function writeLearningStore(store) {
  const dir = path.dirname(learningFilePath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(learningFilePath, JSON.stringify(store, null, 2), 'utf8')
}

export function appendLearningExample({ userId, originalPath, fileNum, subFolderName }) {
  const safeUser = String(userId || '').trim() || 'anonymous'
  const store = readLearningStore()
  if (!store.users[safeUser]) store.users[safeUser] = { rules: [] }
  if (Array.isArray(store.users[safeUser])) {
    store.users[safeUser] = { rules: store.users[safeUser] }
  }
  if (!Array.isArray(store.users[safeUser].rules)) {
    store.users[safeUser].rules = []
  }

  const tokens = buildLearningTokens(originalPath)
  if (!tokens.length) return 0

  const normalizedOriginal = normalizeTokenText(originalPath)
  const aliases = [...new Set([...tokens, ...(normalizedOriginal.includes('pop') || normalizedOriginal.includes('proof') ? POP_ALIASES : [])].map((v) => normalizeTokenText(v)).filter(Boolean))]
  const targetFileNum = Number(fileNum) || 0
  const targetSubFolder = subFolderName || 'Unsorted'
  const rules = store.users[safeUser].rules

  const existingIdx = rules.findIndex((r) => Number(r.fileNum) === targetFileNum && String(r.subFolderName || 'Unsorted') === targetSubFolder)
  const now = new Date().toISOString()
  if (existingIdx >= 0) {
    const prev = rules[existingIdx] || {}
    const prevAliases = Array.isArray(prev.aliases) ? prev.aliases : []
    const prevTokens = Array.isArray(prev.tokens) ? prev.tokens : []
    rules[existingIdx] = {
      ...prev,
      fileNum: targetFileNum,
      subFolderName: targetSubFolder,
      aliases: [...new Set([...prevAliases, ...aliases])].slice(0, 32),
      tokens: [...new Set([...prevTokens, ...tokens])].slice(0, 16),
      examples: (Number(prev.examples) || 0) + 1,
      originalPath,
      updatedAt: now,
      createdAt: prev.createdAt || now,
    }
  } else {
    rules.push({
      aliases: aliases.slice(0, 32),
      tokens: tokens.slice(0, 16),
      fileNum: targetFileNum,
      subFolderName: targetSubFolder,
      originalPath,
      examples: 1,
      createdAt: now,
      updatedAt: now,
    })
  }

  // keep recent 300 per user
  if (rules.length > 300) {
    store.users[safeUser].rules = rules.slice(-300)
  }
  writeLearningStore(store)
  return 1
}

export function suggestFromLearning({ userId, originalPath }) {
  const safeUser = String(userId || '').trim() || 'anonymous'
  const store = readLearningStore()
  const raw = store.users?.[safeUser]
  const rules = Array.isArray(raw) ? raw : raw?.rules
  if (!Array.isArray(rules) || rules.length === 0) return null

  const tokenText = ` ${normalizeTokenText(originalPath)} `
  const contractorContext = tokenText.includes(' contractor ')
  let best = null
  let bestScore = 0
  for (const ex of rules) {
    const tokens = [...(Array.isArray(ex.tokens) ? ex.tokens : []), ...(Array.isArray(ex.aliases) ? ex.aliases : [])]
    let score = 0
    for (const t of tokens) {
      if (tokenText.includes(` ${t} `)) score += t.includes(' ') ? 3 : t.length <= 5 ? 1 : 2
    }
    if (score > bestScore) {
      best = ex
      bestScore = score
    }
  }
  if (!best || bestScore < 2) return null
  if (
    contractorContext &&
    Number(best.fileNum) === 3 &&
    String(best.subFolderName || '').toLowerCase().includes('proof of payment')
  ) {
    return null
  }
  return {
    fileNum: Number(best.fileNum) || 0,
    subFolderName: String(best.subFolderName || 'Unsorted'),
    confidence: Math.min(0.98, 0.5 + bestScore * 0.07),
    reason: `learned:${bestScore}`,
  }
}

