import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..', '..')
const learningFilePath = path.join(rootDir, 'uploads', 'document-sorter-learning.json')

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
  if (!store.users[safeUser]) store.users[safeUser] = []
  const tokens = buildLearningTokens(originalPath)
  if (!tokens.length) return 0
  store.users[safeUser].push({
    tokens,
    fileNum,
    subFolderName: subFolderName || 'Unsorted',
    originalPath,
    createdAt: new Date().toISOString(),
  })
  // keep recent 300 per user
  if (store.users[safeUser].length > 300) {
    store.users[safeUser] = store.users[safeUser].slice(-300)
  }
  writeLearningStore(store)
  return 1
}

export function suggestFromLearning({ userId, originalPath }) {
  const safeUser = String(userId || '').trim() || 'anonymous'
  const store = readLearningStore()
  const examples = store.users?.[safeUser]
  if (!Array.isArray(examples) || examples.length === 0) return null

  const tokenText = ` ${normalizeTokenText(originalPath)} `
  let best = null
  let bestScore = 0
  for (const ex of examples) {
    const tokens = Array.isArray(ex.tokens) ? ex.tokens : []
    let score = 0
    for (const t of tokens) {
      if (tokenText.includes(` ${t} `)) score += t.length <= 5 ? 1 : 2
    }
    if (score > bestScore) {
      best = ex
      bestScore = score
    }
  }
  if (!best || bestScore < 3) return null
  return {
    fileNum: Number(best.fileNum) || 0,
    subFolderName: String(best.subFolderName || 'Unsorted'),
    confidence: Math.min(0.98, 0.5 + bestScore * 0.07),
    reason: `learned:${bestScore}`,
  }
}

