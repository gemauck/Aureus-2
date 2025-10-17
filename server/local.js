import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const apiDir = path.join(rootDir, 'api')

function toHandlerPath(urlPath) {
  // Map /api/* to files under api/ with best-effort resolution
  const parts = urlPath.replace(/^\/api\/?/, '').split('/').filter(Boolean)
  if (parts.length === 0) return path.join(apiDir, 'health.js')

  // Candidates in priority order
  const candidates = []
  
  // 1) Consolidated endpoints: api/auth.js, api/clients.js, etc.
  if (parts.length >= 2) {
    const entity = parts[0] // e.g., 'auth', 'clients'
    candidates.push(path.join(apiDir, entity + '.js'))
  }
  
  // 2) Exact nested file: api/a/b/c.js
  candidates.push(path.join(apiDir, ...parts) + '.js')
  
  // 3) Nested index: api/a/b/index.js
  candidates.push(path.join(apiDir, ...parts, 'index.js'))
  
  // 4) Dynamic [id] at last segment: api/a/b/[id].js
  if (parts.length >= 2) {
    const parent = parts.slice(0, -1)
    candidates.push(path.join(apiDir, ...parent, '[id].js'))
  }
  
  // 5) Single-level index fallback: api/a/index.js
  if (parts.length === 1) {
    candidates.push(path.join(apiDir, parts[0], 'index.js'))
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  // Default to 404 by returning a non-existent path; caller will handle
  return candidates[0]
}

function adaptHandler(handler) {
  return async (req, res) => {
    // Create minimal req/res compatible with serverless handler
    // Our handler expects Node req/res; Express provides those
    try {
      await handler(req, res)
    } catch (e) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { code: 'SERVER_ERROR', message: e.message } }))
    }
  }
}

async function dispatchApi(req, res) {
  const handlerPath = toHandlerPath(req.path)
  if (!fs.existsSync(handlerPath)) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } })
    return
  }
  
  // Express already parsed JSON, but our handlers expect raw streams
  // Create a mock stream that provides the parsed body
  const mockReq = Object.create(req)
  mockReq[Symbol.asyncIterator] = async function* () {
    if (req.body && Object.keys(req.body).length > 0) {
      yield Buffer.from(JSON.stringify(req.body))
    }
  }
  
  const mod = await import(pathToFileUrl(handlerPath))
  const handler = mod.default
  return adaptHandler(handler)(mockReq, res)
}

function pathToFileUrl(p) {
  const absolutePath = path.isAbsolute(p) ? p : path.resolve(p)
  const url = new URL('file://')
  url.pathname = absolutePath.split(path.sep).map(encodeURIComponent).join('/')
  return url.href
}

const app = express()
app.use(express.json())

// API routes
app.all('/api/*', dispatchApi)
app.all('/api', dispatchApi)

// Static files (serve index.html and assets from root)
app.use(express.static(rootDir))

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'))
})

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`Local server running on http://localhost:${port}`)
})


