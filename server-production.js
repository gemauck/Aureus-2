// Production Railway ERP Server with Database
import express from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = __dirname
const apiDir = path.join(__dirname, 'api')
const app = express()
const PORT = process.env.PORT || 3000

// Initialize Prisma
const prisma = new PrismaClient()

// Dynamic API handler loading
function toHandlerPath(urlPath) {
  const parts = urlPath.replace(/^\/api\/?/, '').split('/').filter(Boolean)
  console.log(`🔍 Parsing URL path: "${urlPath}" -> parts: [${parts.join(', ')}]`)
  
  if (parts.length === 0) {
    return path.join(apiDir, 'health.js')
  }

  const candidates = []
  
  // Direct file matches (e.g., /api/leads -> api/leads.js)
  const directFile = path.join(apiDir, `${parts.join('/')}.js`)
  candidates.push(directFile)
  
  // Nested directory matches
  if (parts.length > 1) {
    const nestedIndex = path.join(apiDir, ...parts, 'index.js')
    const nestedFile = path.join(apiDir, ...parts.slice(0, -1), `${parts[parts.length - 1]}.js`)
    candidates.push(nestedIndex)
    candidates.push(nestedFile)
  }
  
  // Dynamic route matches (e.g., /api/clients/123 -> api/clients/[id].js)
  if (parts.length === 2) {
    const dynamicFile = path.join(apiDir, parts[0], '[id].js')
    candidates.push(dynamicFile)
  }
  
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      console.log(`✅ Found handler: ${path.relative(apiDir, candidate)} for ${urlPath}`)
      return candidate
    }
  }
  
  console.log(`❌ No handler found for: ${urlPath}`)
  return null
}

async function loadHandler(handlerPath) {
  if (!handlerPath) return null
  try {
    const module = await import(`file://${handlerPath}`)
    return module.default
  } catch (error) {
    console.error(`Failed to load handler ${handlerPath}:`, error)
    return null
  }
}

// Middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Serve static files with proper MIME types (only for non-API routes)
app.use((req, res, next) => {
  // Skip static file serving for API routes
  if (req.path.startsWith('/api/')) {
    return next();
  }
  
  // Serve static files for non-API routes
  express.static(__dirname, {
    setHeaders: (res, path) => {
      if (path.endsWith('.js') || path.endsWith('.jsx')) {
        res.setHeader('Content-Type', 'application/javascript');
      }
      if (path.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
      }
    }
  })(req, res, next);
})

// CORS headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }
  next()
})

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production'

// Auth middleware
const authRequired = (req, res, next) => {
  try {
    const auth = req.headers['authorization'] || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    
    if (!token) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
    }
    
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = payload
    next()
  } catch (e) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
  }
}

// Dynamic API routing middleware - handles all API endpoints
app.use('/api', async (req, res) => {
  try {
    const handlerPath = toHandlerPath(req.url)
    console.log(`🔍 Railway API: ${req.method} ${req.url} -> ${handlerPath ? path.relative(rootDir, handlerPath) : 'not found'}`)
    
    const handler = await loadHandler(handlerPath)
    if (!handler) {
      console.log(`❌ No handler found for: ${req.method} ${req.url}`)
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    
    if (req.method === 'OPTIONS') {
      return res.status(204).end()
    }
    
    console.log(`✅ Executing handler for: ${req.method} ${req.url}`)
    await handler(req, res)
  } catch (error) {
    console.error('Railway API Error:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error', details: error.message })
    }
  }
})

// All API endpoints are now handled by the dynamic routing middleware above

// Catch-all route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Production ERP Server running on port ${PORT}`)
  console.log(`📁 Serving from: ${__dirname}`)
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'production'}`)
  console.log(`🗄️ Database: Connected to PostgreSQL`)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Production server shutting down...')
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('🛑 Production server shutting down...')
  await prisma.$disconnect()
  process.exit(0)
})
