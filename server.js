// Railway ERP Server Entry Point
import 'dotenv/config'
import express from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

// Ensure critical environment variables are set
if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET environment variable is required')
  process.exit(1)
}

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required')
  process.exit(1)
}

console.log('✅ Environment variables validated')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = __dirname
const apiDir = path.join(__dirname, 'api')

function toHandlerPath(urlPath) {
  // Remove /api prefix and split into parts
  const parts = urlPath.replace(/^\/api\/?/, '').split('/').filter(Boolean)
  console.log(`🔍 Parsing URL path: "${urlPath}" -> parts: [${parts.join(', ')}]`)
  
  if (parts.length === 0) {
    console.log(`📄 Empty path, using health handler`)
    return path.join(apiDir, 'health.js')
  }

  const candidates = []
  
  // Direct file matches (e.g., /api/leads -> api/leads.js)
  const directFile = path.join(apiDir, `${parts.join('/')}.js`)
  candidates.push(directFile)
  console.log(`🔍 Checking direct file: ${directFile}`)
  
  // Nested directory matches (e.g., /api/auth/login -> api/auth/login.js)
  if (parts.length > 1) {
    const nestedIndex = path.join(apiDir, ...parts, 'index.js')
    const nestedFile = path.join(apiDir, ...parts.slice(0, -1), `${parts[parts.length - 1]}.js`)
    candidates.push(nestedIndex)
    candidates.push(nestedFile)
    console.log(`🔍 Checking nested files: ${nestedIndex}, ${nestedFile}`)
  }
  
  // Dynamic route matches (e.g., /api/clients/123 -> api/clients/[id].js)
  if (parts.length === 2) {
    const dynamicFile = path.join(apiDir, parts[0], '[id].js')
    candidates.push(dynamicFile)
    console.log(`🔍 Checking dynamic file: ${dynamicFile}`)
  }
  
  // Single part matches (e.g., /api/login -> api/login.js)
  if (parts.length === 1) {
    const singleFile = path.join(apiDir, `${parts[0]}.js`)
    candidates.push(singleFile)
    console.log(`🔍 Checking single file: ${singleFile}`)
  }
  
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      console.log(`✅ Found handler: ${path.relative(apiDir, candidate)} for ${urlPath}`)
      return candidate
    }
  }
  
  console.log(`❌ No handler found for: ${urlPath}`)
  console.log(`❌ Tried candidates: ${candidates.map(c => path.relative(apiDir, c)).join(', ')}`)
  return path.join(apiDir, 'health.js')
}

async function loadHandler(handlerPath) {
  try {
    const module = await import(`file://${handlerPath}`)
    return module.default
  } catch (error) {
    console.error(`Failed to load handler ${handlerPath}:`, error)
    // Return a fallback handler that returns 500 error
    return (req, res) => {
      console.error(`Handler execution failed for ${req.method} ${req.url}`)
      res.status(500).json({ 
        error: 'Handler failed to load', 
        path: req.url,
        timestamp: new Date().toISOString()
      })
    }
  }
}

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// CORS middleware for local development
app.use((req, res, next) => {
  const origin = req.headers.origin
  const allowedOrigins = [
    process.env.APP_URL,
    'http://localhost:3000',
    'http://localhost:3001', 
    'http://localhost:3002',
    'http://localhost:8000',
    'https://abco-erp-2-cnlz.vercel.app',
    'https://abco-erp-2-production.up.railway.app'
  ].filter(Boolean)
  
  // Allow localhost origins for development
  if (origin && (allowedOrigins.includes(origin) || origin.startsWith('http://localhost:'))) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  } else {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0] || '*')
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }
  
  next()
})

// Serve static files from root directory
app.use(express.static(rootDir, {
  index: false, // Don't serve index.html automatically
  dotfiles: 'ignore',
  etag: true,
  lastModified: true,
  maxAge: '1d',
  redirect: false // Disable automatic redirects for trailing slashes
}))

// Explicit mapping for critical endpoints (ensure invite works even if resolution changes)
app.all('/api/users/invite', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'users', 'invite.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    return next(e)
  }
})

// API routes - must come before catch-all route
app.use('/api', async (req, res) => {
  try {
    const handlerPath = toHandlerPath(req.url)
    console.log(`🔍 Railway API: ${req.method} ${req.url} -> ${path.relative(rootDir, handlerPath)}`)
    console.log(`🔍 Railway API: Handler path exists: ${fs.existsSync(handlerPath)}`)
    
    const handler = await loadHandler(handlerPath)
    
    if (req.method === 'OPTIONS') {
      return res.status(204).end()
    }
    
    console.log(`✅ Executing handler for: ${req.method} ${req.url}`)
    
    // Add timeout to prevent hanging requests
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        console.error(`⏰ Request timeout for: ${req.method} ${req.url}`)
        res.status(504).json({ 
          error: 'Request timeout', 
          path: req.url,
          timestamp: new Date().toISOString()
        })
      }
    }, 30000) // 30 second timeout
    
    try {
      await handler(req, res)
      clearTimeout(timeout)
    } catch (handlerError) {
      clearTimeout(timeout)
      throw handlerError
    }
    
  } catch (error) {
    console.error('❌ Railway API Error:', {
      method: req.method,
      url: req.url,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })
    
    // Don't expose internal errors in production
    const isDevelopment = process.env.NODE_ENV === 'development'
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Internal server error', 
        details: isDevelopment ? error.message : 'Contact support if this persists',
        timestamp: new Date().toISOString()
      })
    }
  }
})

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    platform: 'railway',
    version: '1.0.0'
  })
})

// Catch-all route for static files - must come last
// Only serve index.html for non-API routes
app.get('*', (req, res) => {
  // Skip API routes - they should have been handled by the API middleware above
  if (req.url.startsWith('/api/')) {
    console.log(`❌ API route not handled: ${req.method} ${req.url}`)
    return res.status(404).json({ error: 'API endpoint not found' })
  }
  
  // Serve index.html for all other routes (SPA routing)
  console.log(`📄 Serving index.html for: ${req.url}`)
  res.sendFile(path.join(rootDir, 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Railway ERP Server running on port ${PORT}`)
  console.log(`📁 Serving from: ${rootDir}`)
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'production'}`)
  console.log(`📂 API directory: ${apiDir}`)
})

process.on('SIGTERM', () => {
  console.log('🛑 Railway server shutting down...')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('🛑 Railway server shutting down...')
  process.exit(0)
})
