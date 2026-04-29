/**
 * Manual post-sort move API.
 * POST body: { uploadId, outputRelativePath, targetFileNum, targetSubfolderName, learn?: boolean }
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { authRequired } from '../../_lib/authRequired.js'
import { badRequest, ok, serverError } from '../../_lib/response.js'
import { parseJsonBody } from '../../_lib/body.js'
import { folderNameForFileNum } from './classify.js'
import { appendLearningExample, getUserIdFromReq } from './learningStore.js'
import { sanitizeSubfolderName } from './checklistTemplate.js'
import { incrementRunMoveCount, updateRunStatusByUploadId } from './projectStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..', '..')
const outputBase = path.join(rootDir, 'uploads', 'document-sorter-output')

function sanitizeRelPath(p) {
  return String(p || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
}

function writeManifestCsv(manifest, outputDir) {
  const cols = [
    'originalPath',
    'outputRelativePath',
    'folderName',
    'fileNum',
    'subFolderName',
    'subFolderReason',
    'matchedKeyword',
    'matchedBy',
    'classifyConfidence',
    'classifyReason',
    'method',
    'manualAdjusted',
    'manualAdjustedAt',
    'manualAdjustedBy',
    'learnedFromManual',
    'learnedHit',
    'uncompressedSize',
    'collisionDisambiguated',
    'llmConfidence',
    'evidenceType',
    'llmSummary',
    'extractError',
    'aiError',
  ]
  const esc = (v) => {
    if (v == null) return ''
    const s = String(v)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [cols.join(',')]
  for (const row of manifest.files || []) {
    lines.push(cols.map((c) => esc(row[c])).join(','))
  }
  fs.writeFileSync(path.join(outputDir, 'manifest.csv'), lines.join('\n'), 'utf8')
}

function getUniqueTargetPath(absTo) {
  if (!fs.existsSync(absTo)) return absTo
  const dir = path.dirname(absTo)
  const base = path.basename(absTo)
  const ext = path.extname(base)
  const stem = ext ? base.slice(0, -ext.length) : base
  let i = 2
  while (true) {
    const cand = path.join(dir, `${stem}__manual${i}${ext}`)
    if (!fs.existsSync(cand)) return cand
    i++
  }
}

async function handler(req, res) {
  try {
    if (req.method !== 'POST') return badRequest(res, 'Method not allowed')
    const body = await parseJsonBody(req).catch(() => ({}))
    const uploadId = String(body.uploadId || '').trim()
    const rel = sanitizeRelPath(body.outputRelativePath)
    const targetFileNum = Number(body.targetFileNum)
    const targetFolder = folderNameForFileNum(targetFileNum)
    const targetSubfolder = sanitizeSubfolderName(body.targetSubfolderName || 'Unsorted')
    const learn = Boolean(body.learn)
    if (!uploadId || !rel) return badRequest(res, 'uploadId and outputRelativePath required')
    if (!(targetFileNum >= 1 && targetFileNum <= 7)) return badRequest(res, 'targetFileNum must be 1..7')

    const outputDir = path.join(outputBase, uploadId)
    const metaPath = path.join(path.resolve(__dirname, '../..', '..'), 'uploads', 'document-sorter-uploads', uploadId, 'meta.json')
    let meta = {}
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    } catch (_) {}
    const sorterProjectId = String(body.sorterProjectId || meta.sorterProjectId || '').trim()
    const manifestPath = path.join(outputDir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) return badRequest(res, 'manifest.json not found')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const idx = (manifest.files || []).findIndex((f) => sanitizeRelPath(f.outputRelativePath) === rel)
    if (idx < 0) return badRequest(res, 'File not found in manifest')
    const row = manifest.files[idx]

    const absFrom = path.join(outputDir, ...rel.split('/'))
    if (!fs.existsSync(absFrom)) return badRequest(res, 'Source file not found on disk')
    const fileName = path.basename(rel)
    const baseTo = path.join(outputDir, targetFolder, targetSubfolder, fileName)
    const absTo = getUniqueTargetPath(baseTo)
    fs.mkdirSync(path.dirname(absTo), { recursive: true })
    fs.renameSync(absFrom, absTo)

    const relTo = path.relative(outputDir, absTo).split(path.sep).join('/')
    const userId = getUserIdFromReq(req)
    row.outputRelativePath = relTo
    row.fileNum = targetFileNum
    row.folderName = targetFolder
    row.subFolderName = targetSubfolder
    row.subFolderReason = 'manual-adjust'
    row.method = 'manual'
    row.manualAdjusted = true
    row.manualAdjustedAt = new Date().toISOString()
    row.manualAdjustedBy = userId
    if (absTo !== baseTo) row.collisionDisambiguated = true

    if (learn) {
      appendLearningExample({
        userId,
        originalPath: row.originalPath,
        fileNum: targetFileNum,
        subFolderName: targetSubfolder,
      })
      row.learnedFromManual = true
    }

    manifest.generatedAt = new Date().toISOString()
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
    writeManifestCsv(manifest, outputDir)
    if (sorterProjectId) {
      incrementRunMoveCount({ projectId: sorterProjectId, userId, uploadId })
      updateRunStatusByUploadId({
        projectId: sorterProjectId,
        userId,
        uploadId,
        patch: { resultSnapshot: { uploadId, sorterProjectId, runId: meta.runId || undefined, manifestPath: `/uploads/document-sorter-output/${uploadId}/manifest.json`, manifestCsvPath: `/uploads/document-sorter-output/${uploadId}/manifest.csv` } },
      })
    }

    return ok(res, {
      success: true,
      row,
      message: 'File reallocated successfully.',
    })
  } catch (e) {
    console.error('document-sorter move error:', e)
    return serverError(res, 'Move failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

