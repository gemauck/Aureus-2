// Railway Server Entry Point
import 'dotenv/config'
// Load .env.local for local development (overrides .env)
import dotenv from 'dotenv'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load .env.local if it exists (for local development)
if (existsSync(join(__dirname, '.env.local'))) {
  dotenv.config({ path: join(__dirname, '.env.local'), override: true })
  console.log('✅ Loaded .env.local for local development')
}

import express from 'express'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'path'
import fs from 'fs'

// Ensure critical environment variables are set
// Allow relaxed requirements in local dev when DEV_LOCAL_NO_DB=true
const isDevNoDb = process.env.DEV_LOCAL_NO_DB === 'true'

if (!process.env.JWT_SECRET) {
  if (isDevNoDb) {
    // Provide a safe default for local-only flows
    process.env.JWT_SECRET = 'dev-local-secret'
    console.warn('⚠️ Using default JWT_SECRET for local dev (DEV_LOCAL_NO_DB=true)')
  } else {
    console.error('❌ JWT_SECRET environment variable is required')
    process.exit(1)
  }
}

if (!process.env.DATABASE_URL) {
  if (isDevNoDb) {
    console.warn('⚠️ DATABASE_URL not set, continuing due to DEV_LOCAL_NO_DB=true')
  } else {
    console.error('❌ DATABASE_URL environment variable is required')
    process.exit(1)
  }
}

console.log('✅ Environment variables validated')

// Note: __filename and __dirname are already defined above
const rootDir = __dirname
const apiDir = path.join(__dirname, 'api')

function toHandlerPath(urlPath) {
  // Strip query parameters and hash from URL path
  const cleanPath = urlPath.split('?')[0].split('#')[0]
  // Remove /api prefix and split into parts
  const parts = cleanPath.replace(/^\/api\/?/, '').split('/').filter(Boolean)
  
  if (parts.length === 0) {
    return path.join(apiDir, 'health.js')
  }

  const candidates = []
  
  // IMPORTANT: Check exact file matches BEFORE dynamic routes
  // This ensures /api/users/heartbeat matches api/users/heartbeat.js, not api/users/[id].js
  
  // Direct file matches (e.g., /api/users/heartbeat -> api/users/heartbeat.js)
  const directFile = path.join(apiDir, `${parts.join('/')}.js`)
  candidates.push(directFile)
  
  // Nested directory matches (e.g., /api/auth/login -> api/auth/login.js)
  if (parts.length > 1) {
    const nestedIndex = path.join(apiDir, ...parts, 'index.js')
    const nestedFile = path.join(apiDir, ...parts.slice(0, -1), `${parts[parts.length - 1]}.js`)
    candidates.push(nestedIndex)
    candidates.push(nestedFile)
  }
  
  // Single part matches (e.g., /api/login -> api/login.js)
  if (parts.length === 1) {
    const singleFile = path.join(apiDir, `${parts[0]}.js`)
    candidates.push(singleFile)
  }
  
  // IMPORTANT: Check dynamic routes BEFORE base file for multi-part paths
  // This ensures /api/users/:id matches api/users/[id].js, not api/users.js
  if (parts.length === 2) {
    const dynamicFile = path.join(apiDir, parts[0], '[id].js')
    if (fs.existsSync(dynamicFile)) {
      candidates.push(dynamicFile)
    }
  }
  
  // Nested dynamic routes (e.g., /api/clients/123/rss-subscription -> api/clients/[id]/rss-subscription.js)
  if (parts.length === 3) {
    const nestedDynamicFile = path.join(apiDir, parts[0], '[id]', `${parts[2]}.js`)
    if (fs.existsSync(nestedDynamicFile)) {
      candidates.push(nestedDynamicFile)
    }
  }
  
  // IMPORTANT: Check base file for multi-part paths AFTER dynamic routes
  // This handles cases like /api/jobcards/:id where jobcards.js handles all routes
  // But only if no dynamic route was found
  if (parts.length > 1) {
    const baseFile = path.join(apiDir, `${parts[0]}.js`)
    if (fs.existsSync(baseFile)) {
      // Only add base file if dynamic route doesn't exist
      const dynamicExists = parts.length === 2 && fs.existsSync(path.join(apiDir, parts[0], '[id].js'))
      if (!dynamicExists) {
        candidates.push(baseFile)
      }
    }
  }
  
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  
  // Only log errors in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`❌ No handler found for: ${urlPath}`)
  }
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

// Trust proxy to work behind Nginx
app.set('trust proxy', 1)

// Security middleware - Helmet sets various HTTP headers for security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdnjs.cloudflare.com", "blob:"],
      scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://unpkg.com"],
      fontSrc: ["'self'", "data:", "https://cdnjs.cloudflare.com"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow embedding
}))

// Rate limiting - prevent brute force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs (increased from 5)
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  // Add retry-after header for better client experience
  handler: (req, res) => {
    // Calculate retry-after based on rate limit info
    const rateLimitInfo = req.rateLimit || {}
    const resetTime = rateLimitInfo.resetTime || Date.now() + authLimiter.windowMs
    const retryAfter = Math.max(0, Math.ceil((resetTime - Date.now()) / 1000))
    
    res.setHeader('Retry-After', retryAfter)
    res.status(429).json({
      error: 'Too many authentication attempts',
      message: 'Please try again later. Too many login attempts detected.',
      retryAfter: retryAfter
    })
  }
})

// Apply rate limiting to auth endpoints
app.use('/api/auth/login', authLimiter)
app.use('/api/auth/2fa/verify', authLimiter)

// General API rate limiting
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per minute
  message: 'Too many requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for calendar-notes (has its own more lenient limiter)
  skip: (req) => {
    const url = req.url || req.originalUrl || ''
    return url.includes('/calendar-notes')
  }
})

// More lenient rate limiting for calendar-notes (to support frequent auto-save)
const calendarNotesLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 300, // Allow 300 requests per minute for auto-save (increased from 100)
  message: 'Too many calendar note requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all requests (including successful saves)
})

// Apply calendar-notes limiter first (before general API limiter)
app.use('/api/calendar-notes', calendarNotesLimiter)

// Apply general API rate limiting (skips calendar-notes)
app.use('/api', apiLimiter)

// Enable gzip compression for all responses to speed up loads
app.use(compression({ threshold: 0 }))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(cookieParser())

// Instruct search engines not to index the site
app.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow')
  next()
})

// CORS middleware for local development
app.use((req, res, next) => {
  let origin = req.headers.origin
  const allowedOrigins = [
    process.env.APP_URL,
    'https://abcoafrica.co.za',
    'http://abcoafrica.co.za',
    'https://www.abcoafrica.co.za',
    'http://www.abcoafrica.co.za',
    // Also include versions with trailing dots (some browsers add these)
    'https://abcoafrica.co.za.',
    'http://abcoafrica.co.za.',
    'https://www.abcoafrica.co.za.',
    'http://www.abcoafrica.co.za.',
    // Localhost for development
    'http://localhost:3000',
    'http://localhost:3001', 
    'http://localhost:3002',
    'http://localhost:8000'
  ].filter(Boolean)
  
  // Normalize origin by removing trailing dots
  if (origin && origin.endsWith('.')) {
    origin = origin.slice(0, -1)
  }
  
  // Always set credentials to true for authenticated requests
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  
  // When credentials are included, we cannot use wildcard origin
  if (origin && (allowedOrigins.includes(origin) || origin.startsWith('http://localhost:'))) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  } else if (origin) {
    // For unknown origins, don't set Access-Control-Allow-Origin at all
    // This will cause the browser to reject the request, which is the correct behavior
    return res.status(403).json({ error: 'CORS policy violation' })
  } else {
    // No origin header (e.g., server-to-server requests)
    // Use HTTPS production URL as default
    const defaultOrigin = process.env.APP_URL || 'https://abcoafrica.co.za'
    res.setHeader('Access-Control-Allow-Origin', defaultOrigin)
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }
  
  next()
})

// Explicit mapping for critical endpoints (ensure invite works even if resolution changes)
app.all('/api/users/invite', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'users', 'invite.js'))
    if (!handler) {
      console.error('❌ Invite handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    return handler(req, res)
  } catch (e) {
    console.error('❌ Error in invite handler:', e)
    // Ensure JSON is returned even on error
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: 'Internal server error',
        message: e.message,
        timestamp: new Date().toISOString()
      })
    }
    return next(e)
  }
})

// Explicit mapping for heartbeat endpoint (ensure it routes correctly)
app.all('/api/users/heartbeat', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'users', 'heartbeat.js'))
    if (!handler) {
      console.error('❌ Heartbeat handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    return handler(req, res)
  } catch (e) {
    console.error('❌ Error in heartbeat handler:', e)
    // Ensure JSON is returned even on error
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: 'Internal server error',
        message: e.message,
        timestamp: new Date().toISOString()
      })
    }
    return next(e)
  }
})

// Explicit mapping for invitation endpoints (no auth required)
app.all('/api/users/invitation-details', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'users', 'invitation-details.js'))
    if (!handler) {
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    return handler(req, res)
  } catch (e) {
    console.error('❌ Error in invitation-details handler:', e)
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: 'Internal server error',
        message: e.message,
        timestamp: new Date().toISOString()
      })
    }
    return next(e)
  }
})

app.all('/api/users/accept-invitation', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'users', 'accept-invitation.js'))
    if (!handler) {
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    return handler(req, res)
  } catch (e) {
    console.error('❌ Error in accept-invitation handler:', e)
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: 'Internal server error',
        message: e.message,
        timestamp: new Date().toISOString()
      })
    }
    return next(e)
  }
})

// Explicit mapping for change-password endpoint
app.all('/api/users/change-password', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'users', 'change-password.js'))
    if (!handler) {
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    return handler(req, res)
  } catch (e) {
    console.error('❌ Error in change-password handler:', e)
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: 'Internal server error',
        message: e.message,
        timestamp: new Date().toISOString()
      })
    }
    return next(e)
  }
})

// Explicit mapping for invitation management (update, delete, resend /api/users/invitation/[id])
app.all('/api/users/invitation/:id', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'users', 'invitation.js'))
    if (!handler) {
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    return handler(req, res)
  } catch (e) {
    console.error('❌ Error in invitation handler:', e)
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: 'Internal server error',
        message: e.message,
        timestamp: new Date().toISOString()
      })
    }
    return next(e)
  }
})

// Explicit mapping for opportunities list and create operations (GET, POST /api/opportunities)
app.all('/api/opportunities', async (req, res, next) => {
  try {
    console.log('🔍 Opportunities route matched:', {
      method: req.method,
      url: req.url,
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : []
    })
    
    const handler = await loadHandler(path.join(apiDir, 'opportunities.js'))
    if (!handler) {
      console.error('❌ Opportunities handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    
    // Ensure handler result is awaited
    const result = handler(req, res)
    if (result && typeof result.then === 'function') {
      await result
    }
    return result
  } catch (e) {
    console.error('❌ Error in opportunities handler:', {
      error: e.message,
      errorName: e.name,
      stack: e.stack,
      url: req.url,
      method: req.method
    })
    if (!res.headersSent && !res.writableEnded) {
      return res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? e.message : 'Failed to process request',
        timestamp: new Date().toISOString()
      })
    }
    return next(e)
  }
})

// Explicit mapping for opportunities by client endpoint
app.all('/api/opportunities/client/:clientId', async (req, res, next) => {
  try {
    console.log('🔍 Opportunities by client route matched:', {
      method: req.method,
      url: req.url,
      clientId: req.params.clientId,
      params: req.params,
      hasParams: !!req.params,
      paramKeys: req.params ? Object.keys(req.params) : []
    })
    
    // Ensure req.params is set and clientId is available
    if (!req.params) {
      req.params = {}
    }
    // Ensure clientId is set from route param (Express should set this automatically, but add fallback)
    if (!req.params.clientId) {
      // Extract from URL as fallback
      const urlPath = req.url.split('?')[0].split('#')[0]
      const pathSegments = urlPath.split('/').filter(Boolean)
      const clientIdIndex = pathSegments.indexOf('client')
      if (clientIdIndex >= 0 && pathSegments[clientIdIndex + 1]) {
        req.params.clientId = pathSegments[clientIdIndex + 1]
        console.log('🔧 Extracted clientId from URL:', req.params.clientId)
      }
    }
    
    const handler = await loadHandler(path.join(apiDir, 'opportunities.js'))
    if (!handler) {
      console.error('❌ Opportunities handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    
    // Ensure handler result is awaited
    const result = handler(req, res)
    if (result && typeof result.then === 'function') {
      await result
    }
    return result
  } catch (e) {
    console.error('❌ Error in opportunities by client handler:', {
      error: e.message,
      errorName: e.name,
      stack: e.stack,
      clientId: req.params?.clientId,
      url: req.url,
      method: req.method
    })
    if (!res.headersSent && !res.writableEnded) {
      return res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? e.message : 'Failed to process request',
        timestamp: new Date().toISOString()
      })
    }
    return next(e)
  }
})

// Explicit mapping for contacts endpoints
app.all('/api/contacts/client/:clientId/:contactId?', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'contacts.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    return next(e)
  }
})

// Explicit mapping for manufacturing endpoints (inventory, boms, production-orders, stock-movements, suppliers)
app.all('/api/manufacturing/:resource/:id?', async (req, res, next) => {
  try {
    // Only log in development to reduce production overhead
    if (process.env.NODE_ENV === 'development') {
      console.log('🏭 Manufacturing API:', {
        method: req.method,
        url: req.url,
        params: req.params,
        resource: req.params.resource
      })
    }
    const handler = await loadHandler(path.join(apiDir, 'manufacturing.js'))
    if (!handler) {
      console.error('❌ Manufacturing handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    return handler(req, res)
  } catch (e) {
    console.error('❌ Manufacturing API error:', e)
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: 'Internal server error',
        message: e.message,
        timestamp: new Date().toISOString()
      })
    }
    return next(e)
  }
})

// Explicit mapping for sites endpoints
app.all('/api/sites/client/:clientId/:siteId?', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'sites.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    return next(e)
  }
})

// Explicit mapping for clients list and create operations (GET, POST /api/clients)
app.all('/api/clients', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'clients.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    return next(e)
  }
})

// Explicit mapping for client RSS subscription endpoints (GET, POST /api/clients/[id]/rss-subscription)
app.all('/api/clients/:id/rss-subscription', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'clients', '[id]', 'rss-subscription.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    // Attach client ID to req.params for nested route handlers
    req.params = { ...req.params, id: req.params.id }
    return handler(req, res)
  } catch (e) {
    console.error('❌ RSS Subscription API error:', e)
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: 'Internal server error',
        message: e.message,
        timestamp: new Date().toISOString()
      })
    }
    return next(e)
  }
})

// Explicit mapping for client tags endpoints (GET, POST, DELETE /api/clients/[id]/tags)
app.all('/api/clients/:id/tags', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'clients', '[id]', 'tags.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    // Pass the client ID as a param
    req.params = req.params || {}
    return handler(req, res)
  } catch (e) {
    return next(e)
  }
})

// Explicit mapping for clients operations with ID (GET, PATCH, DELETE /api/clients/[id])
app.all('/api/clients/:id', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'clients', '[id].js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    return next(e)
  }
})

// Explicit mapping for project list operations (GET, POST /api/projects)
app.all('/api/projects', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'projects.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    return next(e)
  }
})

// Explicit mapping for project operations with ID (GET, PUT, DELETE /api/projects/[id])
app.all('/api/projects/:id', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'projects.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    return next(e)
  }
})

// Explicit mapping for user operations with ID (GET, PUT, DELETE /api/users/[id])
// IMPORTANT: This must come BEFORE /api/users route so Express matches it first
app.all('/api/users/:id', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'users', '[id].js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    // Attach user ID to req.params for the handler
    req.params = req.params || {}
    return handler(req, res)
  } catch (e) {
    console.error('❌ Users [id] API error:', e)
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: 'Internal server error',
        message: e.message,
        timestamp: new Date().toISOString()
      })
    }
    return next(e)
  }
})

// Explicit mapping for users list operations (GET, POST /api/users)
app.all('/api/users', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'users.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    return next(e)
  }
})

// Explicit mapping for individual opportunity operations (GET, PUT, DELETE /api/opportunities/[id])
// This route is handled by the dynamic route resolution below

// API routes - must come before catch-all route
app.use('/api', async (req, res) => {
  let timeout = null
  try {
    const handlerPath = toHandlerPath(req.url)
    console.log(`🔍 Loading handler for ${req.method} ${req.url} -> ${handlerPath}`)
    
    // Extract ID from URL for dynamic routes (e.g., /api/leads/[id] or /api/clients/[id])
    // This ensures req.params.id is available for handlers that expect it
    if (handlerPath.includes('[id].js')) {
      const urlPath = req.url.split('?')[0].split('#')[0]
      const pathSegments = urlPath.replace(/^\/api\/?/, '').split('/').filter(Boolean)
      if (pathSegments.length >= 2) {
        req.params = req.params || {}
        req.params.id = pathSegments[pathSegments.length - 1]
      }
    }
    
    const handler = await loadHandler(handlerPath)
    
    if (req.method === 'OPTIONS') {
      return res.status(204).end()
    }
    
    // Add timeout to prevent hanging requests
    timeout = setTimeout(() => {
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
      // Wrap handler execution with better error handling
      const handlerPromise = handler(req, res)
      
      // Ensure handler is a promise
      if (handlerPromise && typeof handlerPromise.then === 'function') {
        await handlerPromise
      }
      
      clearTimeout(timeout)
      
      // Check if response was sent
      if (!res.headersSent && !res.writableEnded) {
        console.warn(`⚠️ Handler for ${req.method} ${req.url} did not send a response`)
        // Don't send another response if headers were already sent
      }
    } catch (handlerError) {
      clearTimeout(timeout)
      
      // Log detailed error information
      console.error('❌ Handler execution error:', {
        method: req.method,
        url: req.url,
        handlerPath,
        error: handlerError.message,
        errorName: handlerError.name,
        errorCode: handlerError.code,
        stack: handlerError.stack,
        headersSent: res.headersSent,
        writableEnded: res.writableEnded
      })
      
      // Only send error if response hasn't been sent
      if (!res.headersSent && !res.writableEnded) {
        const isDevelopment = process.env.NODE_ENV === 'development'
        res.status(500).json({ 
          error: 'Internal server error', 
          details: isDevelopment ? handlerError.message : 'Contact support if this persists',
          errorCode: handlerError.code,
          timestamp: new Date().toISOString()
        })
      } else {
        console.error('⚠️ Cannot send error response - headers already sent or response ended')
      }
      
      // Re-throw to be caught by outer catch block
      throw handlerError
    }
    
  } catch (error) {
    if (timeout) clearTimeout(timeout)
    
    console.error('❌ Railway API Error:', {
      method: req.method,
      url: req.url,
      error: error.message,
      errorName: error.name,
      errorCode: error.code,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      headersSent: res.headersSent,
      writableEnded: res.writableEnded
    })
    
    // Don't expose internal errors in production
    const isDevelopment = process.env.NODE_ENV === 'development'
    if (!res.headersSent && !res.writableEnded) {
      res.status(500).json({ 
        error: 'Internal server error', 
        details: isDevelopment ? error.message : 'Contact support if this persists',
        errorCode: error.code,
        timestamp: new Date().toISOString()
      })
    } else {
      console.error('⚠️ Cannot send error response - headers already sent or response ended')
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

// Global error handler middleware - must be after all routes but before static files
app.use((err, req, res, next) => {
  console.error('❌ Express Error Handler:', {
    method: req.method,
    url: req.url,
    error: err.message,
    stack: err.stack
  })
  
  // Always return JSON for API routes
  if (req.url.startsWith('/api/')) {
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: err.message,
        timestamp: new Date().toISOString()
      })
    }
  } else {
    next(err)
  }
})

// Serve static files from root directory with HTTP/2-safe headers
// MUST be after API routes to avoid serving HTML for API endpoints
app.use(express.static(rootDir, {
  index: false, // Don't serve index.html automatically
  dotfiles: 'ignore',
  etag: true,
  lastModified: true,
  maxAge: '7d', // Cache for 7 days for better performance
  redirect: false, // Disable automatic redirects for trailing slashes
  setHeaders: (res, path, stat) => {
    // CRITICAL: Set all headers BEFORE any data is written (HTTP/2 requirement)
    // This prevents ERR_HTTP2_PROTOCOL_ERROR
    
    // Set content type first
    if (path.endsWith('.jsx')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
      // No caching for JSX files (they're dynamic)
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
    } else if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
      // In production, cache bundled assets in /dist for 30 days
      if (process.env.NODE_ENV === 'development') {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate')
      } else if (path.includes('/dist/')) {
        res.setHeader('Cache-Control', 'public, max-age=2592000, immutable') // 30 days for bundled assets
      } else {
        res.setHeader('Cache-Control', 'public, max-age=604800') // 7 days for other JS
      }
    } else if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8')
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable') // 30 days
    } else if (path.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache, must-revalidate')
    } else if (path.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i)) {
      // Images: cache for 1 year
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    } else if (path.match(/\.(woff|woff2|ttf|eot)$/i)) {
      // Fonts: cache for 1 year
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    }
    
    // Do NOT set Content-Length manually here.
    // When upstream (e.g., Nginx) applies gzip/brotli under HTTP/2, a manual
    // Content-Length can cause ERR_HTTP2_PROTOCOL_ERROR due to length mismatch.
    // Let Express/proxy determine the correct transfer semantics.
    
    // Additional HTTP/2 safe headers
    res.setHeader('X-Content-Type-Options', 'nosniff')
  }
}))

// Catch-all route for static files - must come last
// Only serve index.html for non-API routes
app.get('*', (req, res) => {
  // Skip API routes - they should have been handled by the API middleware above
  if (req.url.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' })
  }
  
  // Serve index.html for all other routes (SPA routing)
  res.sendFile(path.join(rootDir, 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Railway Server running on port ${PORT}`)
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
