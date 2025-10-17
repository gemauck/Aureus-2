// Railway ERP Entry Point
import express from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const apiDir = path.join(rootDir, 'api')

function toHandlerPath(urlPath) {
  const parts = urlPath.replace(/^\/api\/?/, '').split('/').filter(Boolean)
  if (parts.length === 0) return path.join(apiDir, 'health.js')

  const candidates = []
  if (parts.length >= 2) {
    candidates.push(path.join(apiDir, `${parts[0]}.js`))
  }
  if (parts.length === 1) {
    candidates.push(path.join(apiDir, `${parts[0]}.js`))
  }
  if (parts.length === 2) {
    candidates.push(path.join(apiDir, '[id].js'))
  }
  if (parts.length >= 2) {
    candidates.push(path.join(apiDir, ...parts.slice(0, -1), `${parts[parts.length - 1]}.js`))
  }
  candidates.push(path.join(apiDir, ...parts, 'index.js'))
  
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  
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

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(express.static(rootDir))

app.use('/api/*', async (req, res) => {
  try {
    const handlerPath = toHandlerPath(req.url)
    console.log(`🔍 Railway API: ${req.method} ${req.url} -> ${path.relative(rootDir, handlerPath)}`)
    
    const handler = await loadHandler(handlerPath)
    if (!handler) {
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    
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

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    platform: 'railway'
  })
})

app.get('*', (req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Railway ERP Server running on port ${PORT}`)
  console.log(`📁 Serving from: ${rootDir}`)
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'production'}`)
})

process.on('SIGTERM', () => {
  console.log('🛑 Railway server shutting down...')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('🛑 Railway server shutting down...')
  process.exit(0)
})
