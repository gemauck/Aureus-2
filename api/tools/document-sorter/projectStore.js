import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..', '..')
const uploadsDir = path.join(rootDir, 'uploads')
const storeDir = path.join(uploadsDir, 'document-sorter-projects')
const storePath = path.join(storeDir, 'index.json')

function nowIso() {
  return new Date().toISOString()
}

function sanitizeProjectName(name) {
  const n = String(name || '').trim().replace(/\s+/g, ' ')
  if (!n) return 'Untitled Sorter Project'
  return n.slice(0, 140)
}

function ensureStoreShape(store) {
  if (!store || typeof store !== 'object') return { version: 1, projects: {} }
  if (!store.projects || typeof store.projects !== 'object') store.projects = {}
  if (!store.version) store.version = 1
  return store
}

export function readProjectStore() {
  try {
    if (!fs.existsSync(storePath)) return { version: 1, projects: {} }
    return ensureStoreShape(JSON.parse(fs.readFileSync(storePath, 'utf8')))
  } catch (_) {
    return { version: 1, projects: {} }
  }
}

export function writeProjectStore(store) {
  fs.mkdirSync(storeDir, { recursive: true })
  fs.writeFileSync(storePath, JSON.stringify(ensureStoreShape(store), null, 2), 'utf8')
}

function ensureProjectShape(project) {
  if (!project || typeof project !== 'object') return null
  if (!Array.isArray(project.runs)) project.runs = []
  if (!project.uiState || typeof project.uiState !== 'object') project.uiState = {}
  return project
}

export function createSorterProject({ userId, name }) {
  const store = readProjectStore()
  const id = `dsp-${randomUUID()}`
  const now = nowIso()
  store.projects[id] = {
    id,
    name: sanitizeProjectName(name),
    createdBy: String(userId || 'anonymous'),
    createdAt: now,
    updatedAt: now,
    activeRunId: null,
    runs: [],
    uiState: {},
  }
  writeProjectStore(store)
  return store.projects[id]
}

export function getSorterProject({ projectId }) {
  const store = readProjectStore()
  return ensureProjectShape(store.projects?.[projectId]) || null
}

export function listSorterProjectsByUser({ userId }) {
  const uid = String(userId || 'anonymous')
  const store = readProjectStore()
  return Object.values(store.projects || {})
    .map((p) => ensureProjectShape(p))
    .filter((p) => p && p.createdBy === uid)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .map((p) => {
      const latestRun = (p.runs || []).slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || null
      return {
        id: p.id,
        name: p.name,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        activeRunId: p.activeRunId || null,
        runsCount: (p.runs || []).length,
        latestRun: latestRun
          ? {
              runId: latestRun.runId,
              uploadId: latestRun.uploadId,
              status: latestRun.status,
              updatedAt: latestRun.updatedAt,
            }
          : null,
      }
    })
}

function assertProjectOwner(project, userId) {
  return project && project.createdBy === String(userId || 'anonymous')
}

export function attachUploadRunToProject({ projectId, userId, uploadId, fileName }) {
  const store = readProjectStore()
  const project = ensureProjectShape(store.projects?.[projectId])
  if (!assertProjectOwner(project, userId)) return null
  const now = nowIso()
  const runId = `dsr-${randomUUID()}`
  const run = {
    runId,
    uploadId: String(uploadId),
    fileName: String(fileName || ''),
    status: 'uploaded',
    createdAt: now,
    updatedAt: now,
    resultSnapshot: null,
    moveCount: 0,
  }
  project.runs.push(run)
  project.activeRunId = runId
  project.updatedAt = now
  writeProjectStore(store)
  return { runId, sorterProjectId: project.id }
}

export function updateRunStatusByUploadId({ projectId, userId, uploadId, patch = {} }) {
  const store = readProjectStore()
  const project = ensureProjectShape(store.projects?.[projectId])
  if (!assertProjectOwner(project, userId)) return null
  const run = (project.runs || []).find((r) => String(r.uploadId) === String(uploadId))
  if (!run) return null
  Object.assign(run, patch, { updatedAt: nowIso() })
  project.updatedAt = run.updatedAt
  if (run.status === 'complete' || run.status === 'cancelled') {
    run.completedAt = run.completedAt || run.updatedAt
  }
  writeProjectStore(store)
  return run
}

export function updateProjectUiState({ projectId, userId, uiState }) {
  const store = readProjectStore()
  const project = ensureProjectShape(store.projects?.[projectId])
  if (!assertProjectOwner(project, userId)) return null
  project.uiState = {
    ...(project.uiState || {}),
    ...(uiState && typeof uiState === 'object' ? uiState : {}),
    updatedAt: nowIso(),
  }
  project.updatedAt = nowIso()
  writeProjectStore(store)
  return project.uiState
}

export function getProjectUiState({ projectId, userId }) {
  const project = getSorterProject({ projectId })
  if (!assertProjectOwner(project, userId)) return null
  return project.uiState || {}
}

export function getProjectRuns({ projectId, userId }) {
  const project = getSorterProject({ projectId })
  if (!assertProjectOwner(project, userId)) return null
  return (project.runs || []).slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
}

export function getProjectSummary({ projectId, userId }) {
  const project = getSorterProject({ projectId })
  if (!assertProjectOwner(project, userId)) return null
  const runs = getProjectRuns({ projectId, userId }) || []
  return {
    id: project.id,
    name: project.name,
    createdBy: project.createdBy,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    activeRunId: project.activeRunId,
    runsCount: runs.length,
    latestRun: runs[0] || null,
  }
}

export function incrementRunMoveCount({ projectId, userId, uploadId }) {
  const project = getSorterProject({ projectId })
  if (!assertProjectOwner(project, userId)) return null
  const store = readProjectStore()
  const target = ensureProjectShape(store.projects?.[projectId])
  const run = (target.runs || []).find((r) => String(r.uploadId) === String(uploadId))
  if (!run) return null
  run.moveCount = Number(run.moveCount || 0) + 1
  run.updatedAt = nowIso()
  target.updatedAt = run.updatedAt
  writeProjectStore(store)
  return run
}
