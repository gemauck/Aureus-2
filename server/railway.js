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
    candidates.push(path.join(apiDir, `${parts[0]}.js`))
  }
  if (parts.length === 1) {
    candidates.push(path.join(apiDir, `${parts[0]}.js`))
  }
  
  // 2) Dynamic routes: api/[id].js
  if (parts.length === 2) {
    candidates.push(path.join(apiDir, '[id].js'))
  }
  
  // 3) Nested: api/auth/login.js, etc.
  if (parts.length >= 2) {
    candidates.push(path.join(apiDir, ...parts.slice(0, -1), `${parts[parts.length - 1]}.js`))
  }
  
  // 4) Index files: api/clients/index.js
  candidates.push(path.join(apiDir, ...parts, 'index.js'))
  
  // Find first existing file
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  
  // Fallback to health endpoint
  return path.join(apiDir, 'health.js')
}

async function loadHandler(handlerPath) {
  try {
    const module = await import(`file://${handlerPath}`)
    return module.default
  } catch (error) {
    console.error(`Failed to load handler ${handlerPath}:`, error)
    return null
  }
}

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Serve static files
app.use(express.static(rootDir))

// Explicit mapping for critical endpoints
app.all('/api/users/invite', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'users', 'invite.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    return next(e)
  }
})

// API routes
app.use('/api/*', async (req, res) => {
  try {
    const handlerPath = toHandlerPath(req.url)
    console.log(`🔍 Railway API: ${req.method} ${req.url} -> ${path.relative(rootDir, handlerPath)}`)
    
    const handler = await loadHandler(handlerPath)
    if (!handler) {
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    
    // Add Railway-specific headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    
    if (req.method === 'OPTIONS') {
      return res.status(204).end()
    }
    
    await handler(req, res)
  } catch (error) {
    console.error('Railway API Error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    platform: 'railway'
  })
})

// Serve the main application
app.get('*', (req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'))
})

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Railway ERP Server running on port ${PORT}`)
  console.log(`📁 Serving from: ${rootDir}`)
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'production'}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Railway server shutting down...')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('🛑 Railway server shutting down...')
  process.exit(0)
})
