/**
 * Document Sorter: after all chunks are uploaded, assemble zip and sort into File 1-7.
 * POST body: JSON { uploadId, useAI?: boolean, aiMaxFiles?: number }
 */

import fs from 'fs'
import path from 'path'
import { createReadStream, createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { fileURLToPath } from 'url'
import yauzl from 'yauzl'
import { withHttp } from '../../_lib/withHttp.js'
import { withLogging } from '../../_lib/logger.js'
import { authRequired } from '../../_lib/authRequired.js'
import { badRequest, serverError, ok } from '../../_lib/response.js'
import { parseJsonBody } from '../../_lib/body.js'
import { buildMergedRules, classifyPath, folderNameForFileNum } from './classify.js'
import { extractTextForSorter } from './extractText.js'
import { classifyWithLLM } from './aiClassify.js'
import { CANCEL_FLAG_NAME } from './cancel.js'
import { resolveChecklistSubfolder, sanitizeSubfolderName } from './checklistTemplate.js'
import { getUserIdFromReq, suggestFromLearning } from './learningStore.js'
import { updateRunStatusByUploadId } from './projectStore.js'
import { normalizeUploadId } from './uploadId.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..', '..')
const uploadsBase = path.join(rootDir, 'uploads', 'document-sorter-uploads')
const outputBase = path.join(rootDir, 'uploads', 'document-sorter-output')

const PROGRESS_EVERY = 40
const DEFAULT_AI_MAX = 150
const MAX_AI_BYTES = 18 * 1024 * 1024
const AI_SCOPE_ALL_CAP = 80
const EXTRA_KW_MAX_TOTAL = 80
const LOW_CONFIDENCE_THRESHOLD = 0.58
const CONFIDENCE_LOW = 0.6
const CONFIDENCE_MED = 0.8

/** User JSON: { "3": ["fuel slip"], "6": ["contractor xyz"] } — max ~80 phrases total */
function sanitizeExtraKeywords(raw) {
  const out = {}
  let total = 0
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [key, val] of Object.entries(raw)) {
    const num = parseInt(String(key), 10)
    if (num < 1 || num > 7) continue
    if (!Array.isArray(val)) continue
    const list = []
    for (const item of val) {
      if (total >= EXTRA_KW_MAX_TOTAL) break
      const s = String(item || '')
        .trim()
        .toLowerCase()
        .slice(0, 200)
      if (!s) continue
      list.push(s)
      total++
    }
    if (list.length) out[num] = list
    if (total >= EXTRA_KW_MAX_TOTAL) break
  }
  return out
}

function sanitizeEntryPath(entryPath) {
  const normalized = entryPath.replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = normalized.split('/').filter(Boolean)
  const safe = parts.map((p) => p.replace(/[<>:"|?*]/g, '_')).join(path.sep)
  return safe || 'unnamed'
}

function bucketConfidence(v) {
  const n = Number(v || 0)
  if (n <= 0) return 'none'
  if (n < CONFIDENCE_LOW) return 'low'
  if (n < CONFIDENCE_MED) return 'medium'
  return 'high'
}

function destKey(folderName, safeRelPath) {
  const posix = safeRelPath.split(path.sep).join('/')
  return `${folderName}/${posix}`
}

function disambiguateSafePath(safePath, dupIndex) {
  const dir = path.dirname(safePath)
  const base = path.basename(safePath)
  const ext = path.extname(base)
  const stem = ext ? base.slice(0, -ext.length) : base
  const nu = `${stem}__dup${dupIndex}${ext}`
  return dir === '.' || dir === '' ? nu : path.join(dir, nu)
}

/** @returns {{ safePath: string, disambiguated: boolean }} */
function allocateSafeRelativePath(folderName, safePath, destSeen) {
  let candidate = safePath
  let dup = 2
  let disambiguated = false
  while (true) {
    const key = destKey(folderName, candidate)
    if (!destSeen.has(key)) {
      destSeen.set(key, true)
      return { safePath: candidate, disambiguated }
    }
    disambiguated = true
    candidate = disambiguateSafePath(safePath, dup++)
  }
}

async function assembleZipFromChunks(uploadDir, totalChunks) {
  const archivePath = path.join(uploadDir, 'archive.zip')
  const writeStream = createWriteStream(archivePath)
  const count =
    totalChunks != null
      ? totalChunks
      : (() => {
          let i = 0
          while (fs.existsSync(path.join(uploadDir, `chunk-${i}`))) i++
          return i
        })()

  for (let i = 0; i < count; i++) {
    const chunkPath = path.join(uploadDir, `chunk-${i}`)
    if (!fs.existsSync(chunkPath)) throw new Error(`Missing chunk ${i}`)
    await pipeline(createReadStream(chunkPath), writeStream, { end: false })
  }
  writeStream.end()
  await new Promise((resolve, reject) => {
    writeStream.on('finish', resolve)
    writeStream.on('error', reject)
  })
  return archivePath
}

function openZip(archivePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err)
      resolve(zipfile)
    })
  })
}

function writeProgress(outputDir, data) {
  try {
    const p = path.join(outputDir, 'progress.json')
    fs.writeFileSync(p, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 0))
  } catch (e) {
    console.warn('document-sorter progress write:', e.message)
  }
}

function csvEscape(val) {
  if (val == null || val === undefined) return ''
  const s = String(val)
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** Write Excel-friendly manifest beside manifest.json */
function writeManifestCsv(manifest, outputDir) {
  const cols = [
    'originalPath',
    'outputRelativePath',
    'folderName',
    'fileNum',
    'subFolderName',
    'subFolderReason',
    'subFolderConfidence',
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
  const lines = [cols.join(',')]
  for (const f of manifest.files) {
    lines.push(cols.map((c) => csvEscape(f[c])).join(','))
  }
  fs.writeFileSync(path.join(outputDir, 'manifest.csv'), lines.join('\n'), 'utf8')
}

function drainZipEntry(zipfile, entry, cb) {
  zipfile.openReadStream(entry, (err, rs) => {
    if (err) return cb(err)
    rs.on('error', cb)
    rs.on('end', () => cb(null))
    rs.resume()
  })
}

/** Count output documents only (exclude manifest exports & progress). */
function countOutputDocuments(outputDir) {
  let n = 0
  const skip = new Set(['manifest.json', 'manifest.csv', 'progress.json', CANCEL_FLAG_NAME])
  function walk(d) {
    if (!fs.existsSync(d)) return
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, ent.name)
      if (ent.isDirectory()) walk(full)
      else if (ent.isFile() && !skip.has(ent.name)) n++
    }
  }
  walk(outputDir)
  return n
}

async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return badRequest(res, 'Method not allowed')
    }

    const payload = await parseJsonBody(req).catch(() => ({}))
    const uploadId = normalizeUploadId(payload.uploadId)
    const useAI = Boolean(payload.useAI)
    const aiScope = payload.aiScope === 'all' ? 'all' : 'uncategorized'
    let aiMaxFiles = Math.min(
      Math.max(1, parseInt(String(payload.aiMaxFiles ?? DEFAULT_AI_MAX), 10) || DEFAULT_AI_MAX),
      500,
    )
    const aiRowsCap = aiScope === 'all' ? Math.min(aiMaxFiles, AI_SCOPE_ALL_CAP) : aiMaxFiles

    const extraKwSanitized = sanitizeExtraKeywords(payload.extraKeywords)
    const classifyRules = buildMergedRules(extraKwSanitized)
    const userId = getUserIdFromReq(req)

    if (!uploadId) {
      return badRequest(res, 'uploadId required')
    }

    const uploadDir = path.join(uploadsBase, uploadId)
    if (!fs.existsSync(uploadDir)) {
      return badRequest(res, 'Upload session not found')
    }

    let meta = {}
    try {
      meta = JSON.parse(fs.readFileSync(path.join(uploadDir, 'meta.json'), 'utf8'))
    } catch (_) {}
    const sorterProjectId = String(payload.sorterProjectId || meta.sorterProjectId || '').trim()

    let totalChunks =
      meta.totalChunks ?? (meta.lastChunkIndex != null ? meta.lastChunkIndex + 1 : null)
    if (totalChunks != null) {
      for (let i = 0; i < totalChunks; i++) {
        if (!fs.existsSync(path.join(uploadDir, `chunk-${i}`))) {
          return badRequest(res, `Chunk ${i} missing. Upload all chunks before processing.`)
        }
      }
    } else {
      let i = 0
      while (fs.existsSync(path.join(uploadDir, `chunk-${i}`))) i++
      if (i === 0) return badRequest(res, 'No chunks found. Upload at least one chunk.')
      totalChunks = i
    }

    const outputDir = path.join(outputBase, uploadId)
    if (sorterProjectId) {
      updateRunStatusByUploadId({
        projectId: sorterProjectId,
        userId,
        uploadId,
        patch: { status: 'processing', startedAt: new Date().toISOString() },
      })
    }

    fs.mkdirSync(outputDir, { recursive: true })

    const cancelFlagPath = path.join(outputDir, CANCEL_FLAG_NAME)
    if (fs.existsSync(cancelFlagPath)) {
      try {
        fs.unlinkSync(cancelFlagPath)
      } catch (_) {}
    }

    writeProgress(outputDir, {
      status: 'running',
      phase: 'extract',
      processed: 0,
      total: null,
      message: 'Starting…',
    })

    const stats = {
      totalFiles: 0,
      totalBytes: 0,
      byFile: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
      bySubfolder: {},
      confidenceBreakdown: { none: 0, low: 0, medium: 0, high: 0 },
      learnedHits: 0,
    }

    const manifest = {
      version: 1,
      uploadId,
      generatedAt: new Date().toISOString(),
      files: [],
      ...(Object.keys(extraKwSanitized).length > 0 ? { extraKeywords: extraKwSanitized } : {}),
      ...(useAI ? { aiScope } : {}),
    }

    const destSeen = new Map()
    let collisionsResolved = 0

    const archivePath = await assembleZipFromChunks(uploadDir, totalChunks)
    const zipfile = await openZip(archivePath)

    /** Phase 1: count file entries */
    let inputFileCount = 0
    await new Promise((resolve, reject) => {
      zipfile.readEntry()
      zipfile.on('entry', (entry) => {
        if (/\/$/.test(entry.fileName)) {
          zipfile.readEntry()
          return
        }
        inputFileCount++
        zipfile.readEntry()
      })
      zipfile.on('end', resolve)
      zipfile.on('error', reject)
    })
    zipfile.close()

    writeProgress(outputDir, {
      status: 'running',
      phase: 'extract',
      processed: 0,
      total: inputFileCount,
      message: `Extracting ${inputFileCount} files…`,
    })

    const zipfile2 = await openZip(archivePath)
    let processed = 0
    let cancelledMidProcess = false

    await new Promise((resolve, reject) => {
      zipfile2.readEntry()
      zipfile2.on('entry', (entry) => {
        if (/\/$/.test(entry.fileName)) {
          zipfile2.readEntry()
          return
        }

        if (cancelledMidProcess || fs.existsSync(cancelFlagPath)) {
          cancelledMidProcess = true
          drainZipEntry(zipfile2, entry, (err) => {
            if (err) return reject(err)
            zipfile2.readEntry()
          })
          return
        }

        const origPath = entry.fileName
        const learned = suggestFromLearning({ userId, originalPath: origPath })
        let fileNum
        let folderName
        let matchedKeyword
        let matchedBy
        let confidence
        let classifyReason
        let learnedHit = false

        if (learned && learned.fileNum >= 1 && learned.fileNum <= 7) {
          fileNum = learned.fileNum
          folderName = folderNameForFileNum(fileNum)
          matchedKeyword = null
          matchedBy = 'learned'
          confidence = learned.confidence
          classifyReason = learned.reason
          learnedHit = true
          stats.learnedHits++
        } else {
          const classified = classifyPath(origPath, { rules: classifyRules })
          fileNum = classified.fileNum
          folderName = classified.folderName
          matchedKeyword = classified.matchedKeyword
          matchedBy = classified.matchedBy
          confidence = classified.confidence
          classifyReason = classified.classifyReason
        }

        const sub = resolveChecklistSubfolder(fileNum, origPath)
        const subFolderName = sanitizeSubfolderName(sub.subFolderName || 'Unsorted')
        const folderWithSub = path.join(folderName, subFolderName)
        let safePath = sanitizeEntryPath(origPath)
        const alloc = allocateSafeRelativePath(folderWithSub, safePath, destSeen)
        safePath = alloc.safePath
        if (alloc.disambiguated) collisionsResolved++

        const dir = path.join(outputDir, folderName, subFolderName)
        const outPath = path.join(dir, safePath)
        const outputRelativePath = path.posix.join(
          folderName.replace(/\\/g, '/'),
          subFolderName.replace(/\\/g, '/'),
          safePath.split(path.sep).join('/'),
        )

        fs.mkdirSync(path.dirname(outPath), { recursive: true })

        stats.totalFiles++
        stats.totalBytes += entry.uncompressedSize || 0
        stats.byFile[fileNum] = (stats.byFile[fileNum] || 0) + 1
        const subKey = `${fileNum}:${subFolderName}`
        stats.bySubfolder[subKey] = (stats.bySubfolder[subKey] || 0) + 1
        stats.confidenceBreakdown[bucketConfidence(confidence)] += 1

        manifest.files.push({
          originalPath: origPath,
          outputRelativePath,
          folderName,
          fileNum,
          subFolderName,
          subFolderReason: sub.subFolderReason,
          subFolderConfidence: sub.subFolderConfidence,
          matchedKeyword,
          matchedBy,
          classifyConfidence: confidence,
          classifyReason,
          method: 'rules',
          learnedHit,
          uncompressedSize: entry.uncompressedSize || 0,
          collisionDisambiguated: alloc.disambiguated,
        })

        zipfile2.openReadStream(entry, (err, readStream) => {
          if (err) {
            zipfile2.readEntry()
            return reject(err)
          }
          const ws = createWriteStream(outPath)
          pipeline(readStream, ws)
            .then(() => {
              processed++
              if (processed % PROGRESS_EVERY === 0 || processed === inputFileCount) {
                writeProgress(outputDir, {
                  status: 'running',
                  phase: 'extract',
                  processed,
                  total: inputFileCount,
                  message: `Extracted ${processed}/${inputFileCount}`,
                })
              }
              zipfile2.readEntry()
            })
            .catch((e) => {
              zipfile2.readEntry()
              reject(e)
            })
        })
      })
      zipfile2.on('end', () => resolve())
      zipfile2.on('error', reject)
    })

    zipfile2.close()

    if (cancelledMidProcess) {
      try {
        fs.unlinkSync(cancelFlagPath)
      } catch (_) {}
      manifest.generatedAt = new Date().toISOString()
      fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
      writeManifestCsv(manifest, outputDir)
      writeProgress(outputDir, {
        status: 'cancelled',
        phase: 'extract',
        processed,
        total: inputFileCount,
        message: 'Cancelled by user.',
      })
      const outputDocCount = countOutputDocuments(outputDir)
      const sumByFile = Object.entries(stats.byFile).reduce((s, [, v]) => s + v, 0)
      const baseUrl = `/uploads/document-sorter-output/${uploadId}`
      const cancelledResponse = {
        outputPath: outputDir,
        baseUrl,
        uploadId,
        sorterProjectId: sorterProjectId || undefined,
        runId: meta.runId || undefined,
        stats,
        cancelled: true,
        verification: {
          inputFiles: inputFileCount,
          manifestRows: manifest.files.length,
          outputFiles: outputDocCount,
          statsSumByCategory: sumByFile,
          match:
            manifest.files.length === outputDocCount &&
            manifest.files.length === sumByFile &&
            manifest.files.length === processed,
          collisionsResolved,
          partialRun: true,
        },
        manifestPath: `${baseUrl}/manifest.json`,
        manifestCsvPath: `${baseUrl}/manifest.csv`,
        extraKeywordsApplied: Object.keys(extraKwSanitized).length > 0,
        message: 'Sorting cancelled after the current file. Partial output is available.',
      }
      if (sorterProjectId) {
        updateRunStatusByUploadId({
          projectId: sorterProjectId,
          userId,
          uploadId,
          patch: { status: 'cancelled', resultSnapshot: cancelledResponse },
        })
      }
      return ok(res, {
        ...cancelledResponse,
      })
    }

    let aiProcessed = 0
    let aiSkipped = 0
    let aiCancelled = false

    const runAiPass =
      useAI &&
      (aiScope === 'all'
        ? manifest.files.length > 0
        : manifest.files.some(
            (f) =>
              f.fileNum === 0 ||
              f.subFolderReason === 'fallback-unsorted' ||
              (typeof f.classifyConfidence === 'number' && f.classifyConfidence > 0 && f.classifyConfidence < LOW_CONFIDENCE_THRESHOLD),
          ))

    if (runAiPass) {
      const aiTargets =
        aiScope === 'all'
          ? manifest.files.slice(0, aiRowsCap)
          : manifest.files
              .filter(
                (f) =>
                  f.fileNum === 0 ||
                  f.subFolderReason === 'fallback-unsorted' ||
                  (typeof f.classifyConfidence === 'number' &&
                    f.classifyConfidence > 0 &&
                    f.classifyConfidence < LOW_CONFIDENCE_THRESHOLD),
              )
              .slice(0, aiRowsCap)

      writeProgress(outputDir, {
        status: 'running',
        phase: 'ai',
        processed: 0,
        total: aiTargets.length,
        message:
          aiScope === 'all'
            ? `AI on first ${aiTargets.length} files (may override path rules; max ${AI_SCOPE_ALL_CAP})…`
            : 'AI classification for uncategorized files…',
      })

      for (let i = 0; i < aiTargets.length; i++) {
        if (fs.existsSync(cancelFlagPath)) {
          aiCancelled = true
          break
        }
        const row = aiTargets[i]
        const absFrom = path.join(outputDir, ...row.outputRelativePath.split('/'))
        try {
          if (!fs.existsSync(absFrom)) {
            aiSkipped++
            continue
          }
          const st = fs.statSync(absFrom)
          if (st.size > MAX_AI_BYTES) {
            aiSkipped++
            continue
          }
          const buf = fs.readFileSync(absFrom)
          const baseName = path.basename(row.originalPath)
          const extracted = await extractTextForSorter(buf, baseName)
          const ai = await classifyWithLLM(
            { fileName: row.originalPath, text: extracted.text || '' },
            {},
          )

          const prevNum = row.fileNum

          if (ai.fileNum == null || ai.fileNum < 1 || ai.fileNum > 7) {
            row.aiError = ai.error || 'Could not classify'
            aiSkipped++
          } else {
            const targetNum = ai.fileNum

            if (
              aiScope === 'all' &&
              targetNum === prevNum &&
              prevNum >= 1 &&
              prevNum <= 7
            ) {
              row.llmConfidence = ai.confidence
              row.llmSummary = ai.summary
              row.evidenceType = ai.evidenceType
              row.extractError = extracted.error || undefined
              row.method = 'rules_llm_confirm'
              row.classifyReason = `${row.classifyReason || 'rule'}; llm_confirm`
            } else {
              const newFolder = folderNameForFileNum(targetNum)
              const nextSub = resolveChecklistSubfolder(targetNum, row.originalPath)
              const newSub = sanitizeSubfolderName(nextSub.subFolderName || 'Unsorted')
              let relSafe = sanitizeEntryPath(row.originalPath)
              const alloc2 = allocateSafeRelativePath(path.join(newFolder, newSub), relSafe, destSeen)
              relSafe = alloc2.safePath
              if (alloc2.disambiguated) collisionsResolved++

              const absTo = path.join(outputDir, newFolder, newSub, relSafe)
              fs.mkdirSync(path.dirname(absTo), { recursive: true })
              fs.renameSync(absFrom, absTo)

              stats.byFile[prevNum] = Math.max(0, (stats.byFile[prevNum] || 0) - 1)
              stats.byFile[targetNum] = (stats.byFile[targetNum] || 0) + 1
              const oldSubKey = `${prevNum}:${row.subFolderName || 'Unsorted'}`
              stats.bySubfolder[oldSubKey] = Math.max(0, (stats.bySubfolder[oldSubKey] || 0) - 1)
              const newSubKey = `${targetNum}:${newSub}`
              stats.bySubfolder[newSubKey] = (stats.bySubfolder[newSubKey] || 0) + 1

              row.fileNum = targetNum
              row.folderName = newFolder
              row.subFolderName = newSub
              row.subFolderReason = nextSub.subFolderReason
              row.subFolderConfidence = nextSub.subFolderConfidence
              row.outputRelativePath = path.posix.join(
                newFolder.replace(/\\/g, '/'),
                newSub.replace(/\\/g, '/'),
                relSafe.split(path.sep).join('/'),
              )
              row.method = 'llm'
              row.matchedKeyword = null
              row.matchedBy = 'llm'
              row.llmConfidence = ai.confidence
              row.llmSummary = ai.summary
              row.evidenceType = ai.evidenceType
              row.extractError = extracted.error || undefined
            }
          }
        } catch (e) {
          row.aiError = e.message || String(e)
          aiSkipped++
        }

        aiProcessed++
        writeProgress(outputDir, {
          status: 'running',
          phase: 'ai',
          processed: aiProcessed,
          total: aiTargets.length,
          message: `AI ${aiProcessed}/${aiTargets.length}`,
        })
      }
      if (aiCancelled) {
        try {
          fs.unlinkSync(cancelFlagPath)
        } catch (_) {}
        manifest.generatedAt = new Date().toISOString()
        fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
        writeManifestCsv(manifest, outputDir)
        writeProgress(outputDir, {
          status: 'cancelled',
          phase: 'ai',
          processed: aiProcessed,
          total: aiTargets.length,
          message: 'Cancelled during AI pass.',
        })
        const outputDocCount = countOutputDocuments(outputDir)
        const sumByFile = Object.entries(stats.byFile).reduce((s, [, v]) => s + v, 0)
        const baseUrl = `/uploads/document-sorter-output/${uploadId}`
        const aiCancelledResponse = {
          outputPath: outputDir,
          baseUrl,
          uploadId,
          sorterProjectId: sorterProjectId || undefined,
          runId: meta.runId || undefined,
          stats,
          cancelled: true,
          verification: {
            inputFiles: inputFileCount,
            manifestRows: manifest.files.length,
            outputFiles: outputDocCount,
            statsSumByCategory: sumByFile,
            match: false,
            collisionsResolved,
            partialRun: true,
          },
          ai: {
            processed: aiProcessed,
            skipped: aiSkipped,
            maxRequested: aiMaxFiles,
            scope: aiScope,
            cappedAt: aiRowsCap,
          },
          extraKeywordsApplied: Object.keys(extraKwSanitized).length > 0,
          manifestPath: `${baseUrl}/manifest.json`,
          manifestCsvPath: `${baseUrl}/manifest.csv`,
          message: 'Processing cancelled during AI classification.',
        }
        if (sorterProjectId) {
          updateRunStatusByUploadId({
            projectId: sorterProjectId,
            userId,
            uploadId,
            patch: { status: 'cancelled', resultSnapshot: aiCancelledResponse },
          })
        }
        return ok(res, {
          ...aiCancelledResponse,
        })
      }
    }

    const manifestPath = path.join(outputDir, 'manifest.json')
    manifest.generatedAt = new Date().toISOString()
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
    writeManifestCsv(manifest, outputDir)

    const outputDocCount = countOutputDocuments(outputDir)
    const sumByFile = Object.entries(stats.byFile).reduce((s, [, v]) => s + v, 0)
    const verification = {
      inputFiles: inputFileCount,
      manifestRows: manifest.files.length,
      outputFiles: outputDocCount,
      statsSumByCategory: sumByFile,
      statsBySubfolder: stats.bySubfolder,
      confidenceBreakdown: stats.confidenceBreakdown,
      learnedHits: stats.learnedHits,
      match:
        inputFileCount === manifest.files.length &&
        manifest.files.length === outputDocCount &&
        sumByFile === inputFileCount,
      collisionsResolved,
    }

    const uncategorizedPaths = manifest.files
      .filter((f) => f.fileNum === 0)
      .map((f) => f.originalPath)
      .slice(0, 20)

    writeProgress(outputDir, {
      status: 'complete',
      phase: 'done',
      processed: inputFileCount,
      total: inputFileCount,
      message: 'Done',
      verification,
    })

    const baseUrl = `/uploads/document-sorter-output/${uploadId}`
    const successResponse = {
      outputPath: outputDir,
      baseUrl,
      uploadId,
      sorterProjectId: sorterProjectId || undefined,
      runId: meta.runId || undefined,
      stats,
      verification,
      uncategorizedSample: uncategorizedPaths,
      extraKeywordsApplied: Object.keys(extraKwSanitized).length > 0,
      ai:
        useAI
          ? {
              processed: aiProcessed,
              skipped: aiSkipped,
              maxRequested: aiMaxFiles,
              scope: aiScope,
              cappedAt: aiRowsCap,
            }
          : undefined,
      manifestPath: `${baseUrl}/manifest.json`,
      manifestCsvPath: `${baseUrl}/manifest.csv`,
      message: verification.match
        ? `Sorted ${stats.totalFiles} files. All counts reconciled.`
        : `Processed ${stats.totalFiles} files — verification mismatch; check manifest.`,
    }
    if (sorterProjectId) {
      updateRunStatusByUploadId({
        projectId: sorterProjectId,
        userId,
        uploadId,
        patch: {
          status: verification.match ? 'complete' : 'complete_with_warnings',
          verification,
          stats,
          resultSnapshot: successResponse,
        },
      })
    }
    return ok(res, successResponse)
  } catch (e) {
    console.error('document-sorter process error:', e)
    return serverError(res, 'Process failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
