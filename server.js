// Railway Server Entry Point
import 'dotenv/config'
// Load .env.local for local development (overrides .env)
import dotenv from 'dotenv'
import { existsSync, readFileSync } from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load .env.local ONLY in development (NEVER in production)
// SECURITY: .env.local should never exist on production server as it overrides .env
const isProduction = process.env.NODE_ENV === 'production' || 
                     process.env.NODE_ENV === 'prod' ||
                     !process.env.NODE_ENV || // Default to production if not set
                     process.env.PM2_HOME || // PM2 indicates production
                     process.env.RAILWAY_ENVIRONMENT || // Railway indicates production
                     process.env.VERCEL || // Vercel indicates production
                     process.env.HEROKU_APP_NAME // Heroku indicates production

if (existsSync(join(__dirname, '.env.local'))) {
  if (isProduction) {
    // CRITICAL: .env.local should NEVER exist in production
    console.error('❌ SECURITY ERROR: .env.local file found in PRODUCTION!')
    console.error('   .env.local is for local development only and will override .env')
    console.error('   This file MUST be removed from the production server')
    console.error('   Location:', join(__dirname, '.env.local'))
    console.error('')
    console.error('   To fix: Remove .env.local from the production server')
    console.error('   The deployment scripts should handle this automatically')
    process.exit(1) // Exit immediately to prevent using wrong credentials
  } else {
    // Safe to load in development
    dotenv.config({ path: join(__dirname, '.env.local'), override: true })
    console.log('✅ Loaded .env.local for local development')
  }
}
// Allow test script to force port (e.g. TEST_PORT=3001) so dev-auth server doesn't conflict with main app
if (process.env.TEST_PORT) {
  process.env.PORT = process.env.TEST_PORT
}

import express from 'express'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'

// Load package.json (Node.js v22 compatible)
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'))

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

// Prohibit local database connections (unless explicitly allowed for dev)
// Allow local databases in development mode or when DEV_LOCAL_NO_DB=true
const isDevelopment = process.env.NODE_ENV === 'development' || 
                     process.env.NODE_ENV === 'dev' ||
                     (!process.env.NODE_ENV && !isProduction)

if (process.env.DATABASE_URL && !isDevNoDb && !isDevelopment) {
  const dbUrl = process.env.DATABASE_URL.toLowerCase()
  const isLocalDatabase = 
    dbUrl.includes('localhost') ||
    dbUrl.includes('127.0.0.1') ||
    dbUrl.includes('::1') ||
    dbUrl.includes('0.0.0.0') ||
    (dbUrl.startsWith('postgresql://') && !dbUrl.includes('ondigitalocean.com'))
  
  if (isLocalDatabase) {
    console.error('❌ SECURITY ERROR: Local database connections are prohibited!')
    console.error('   Detected DATABASE_URL:', process.env.DATABASE_URL.substring(0, 100) + '...')
    console.error('   This application must connect to the Digital Ocean production database.')
    console.error('   If you need to use a local database for development, set NODE_ENV=development')
    console.error('   or set DEV_LOCAL_NO_DB=true')
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
  // Retry logic for handler loading (handles transient import failures)
  const MAX_RETRIES = 2
  const RETRY_DELAY = 100 // 100ms delay between retries
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const module = await import(pathToFileURL(handlerPath).href)
      
      if (!module.default) {
        console.error(`❌ Handler ${handlerPath} does not have a default export`)
        throw new Error(`Handler ${handlerPath} does not have a default export`)
      }
      
      return module.default
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES
      
      // Enhanced error logging with full details
      console.error(`❌ Failed to load handler ${handlerPath} (attempt ${attempt}/${MAX_RETRIES}):`, {
        message: error.message,
        name: error.name,
        code: error.code,
        cause: error.cause?.message || error.cause,
        stack: error.stack?.split('\n').slice(0, 10).join('\n'), // First 10 lines of stack
        handlerPath: handlerPath,
        fileExists: fs.existsSync(handlerPath)
      })
      
      // If this is the last attempt, return fallback handler
      if (isLastAttempt) {
        // Log the full error for debugging
        console.error(`❌ Handler ${handlerPath} failed to load after ${MAX_RETRIES} attempts. Full error:`, {
          message: error.message,
          name: error.name,
          code: error.code,
          stack: error.stack
        })
        
        // Return a fallback handler that returns 500 error
        return (req, res) => {
          console.error(`❌ Handler execution failed for ${req.method} ${req.url} (handler: ${handlerPath})`)
          if (!res.headersSent) {
            res.status(500).json({ 
              error: 'Handler failed to load', 
              path: req.url,
              handlerPath: handlerPath,
              timestamp: new Date().toISOString(),
              // Include error details in development
              ...(process.env.NODE_ENV === 'development' ? {
                errorDetails: {
                  message: error.message,
                  name: error.name,
                  code: error.code
                }
              } : {})
            })
          }
        }
      }
      
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt))
    }
  }
}

const app = express()
const PORT = process.env.PORT || 3000

// Application version info for cache-busting and client refresh prompts
// Use dynamic version that changes on each deployment
// Priority: APP_VERSION env var (set by deployment script) > git commit hash > timestamp-based version > package version
const getAppVersion = () => {
  if (process.env.APP_VERSION) {
    // Use the version set by deployment script (format: YYYYMMDD-gitHash)
    return process.env.APP_VERSION
  }
  
  // Try to get git commit hash as fallback (more stable than timestamp)
  try {
    const gitHash = execSync('git rev-parse --short HEAD', { 
      cwd: __dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '')
    return `${date}-${gitHash}`
  } catch (error) {
    // Final fallback: Use timestamp-based version (changes on each server start/restart)
    // This ensures version changes even if git is not available, triggering update notifications
    // Format: package.version-timestamp (e.g., "0.1.20-1734567890123")
    return `${pkg.version}-${Date.now()}`
  }
}
const APP_VERSION = getAppVersion()
const APP_BUILD_TIME = process.env.APP_BUILD_TIME || new Date().toISOString()

// Log version info for debugging
console.log('📦 App Version:', APP_VERSION)
console.log('📦 Build Time:', APP_BUILD_TIME)
console.log('📦 Version endpoint will return:', { version: APP_VERSION, buildTime: APP_BUILD_TIME })

// Trust proxy to work behind Nginx
app.set('trust proxy', 1)

// Security middleware - Helmet sets various HTTP headers for security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdnjs.cloudflare.com", "https://cdn.sheetjs.com", "blob:"],
      scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://unpkg.com", "https://nominatim.openstreetmap.org"],
      fontSrc: ["'self'", "data:", "https://cdnjs.cloudflare.com"],
      // Allow embedded maps from OpenStreetMap
      frameSrc: ["'self'", "https://www.openstreetmap.org"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow embedding
}))

// Rate limiting removed - no 15 minute login restriction
// Note: Consider implementing other security measures if needed

// General API rate limiting
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 450, // Limit each IP to 450 requests per minute (notifications/tasks polling + CRM; 250 was too low)
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

// Document request reply webhook MUST run before express.json() so we get raw body for signature verification
// Use app.all so GET (reachability check) and POST (Resend webhook) both hit the handler.
// Limit 50mb so replies with large attachments (e.g. 11MB+) don't get rejected or crash the body parser.
app.all('/api/inbound/document-request-reply', express.text({ type: '*/*', limit: '50mb' }), async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'inbound', 'document-request-reply.js'))
    if (!handler) {
      console.error('❌ Document request reply webhook handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    return handler(req, res)
  } catch (e) {
    console.error('❌ Error in document-request-reply webhook:', e)
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? e.message : 'Failed to process webhook',
        timestamp: new Date().toISOString()
      })
    }
    return next(e)
  }
})

// Document request reply debug (diagnostic: recent sent + comments)
app.get('/api/inbound/document-request-reply-debug', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'inbound', 'document-request-reply-debug.js'))
    if (!handler) {
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    return handler(req, res)
  } catch (e) {
    console.error('document-request-reply-debug error:', e)
    if (!res.headersSent) {
      return res.status(500).json({ error: e.message || 'Failed' })
    }
    return next(e)
  }
})

// Email delivery status webhook (Resend/SendGrid). Must run before express.json() for signature verification.
app.all('/api/inbound/email-delivery-status', express.text({ type: '*/*', limit: '5mb' }), async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'inbound', 'email-delivery-status.js'))
    if (!handler) {
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    return handler(req, res)
  } catch (e) {
    console.error('email-delivery-status webhook error:', e)
    if (!res.headersSent) {
      return res.status(500).json({ error: e.message || 'Failed' })
    }
    return next(e)
  }
})

// Increased limit to 100mb to support POA Review file uploads (50MB files + base64 encoding overhead)
app.use(express.json({ limit: '100mb' }))
app.use(express.urlencoded({ extended: true, limit: '100mb' }))
app.use(cookieParser())

// Lightweight version endpoint for clients to detect new deployments
app.get('/version', (req, res) => {
  // Ensure clients always revalidate this endpoint
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  res.json({
    version: APP_VERSION,
    buildTime: APP_BUILD_TIME,
  })
})

// Database health check (no auth) – use for diagnostics when /api/clients returns 500
const dbHealthHandler = async (req, res) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'db-health.js'))
    const out = handler(req, res)
    if (out && typeof out.then === 'function') await out
  } catch (e) {
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Database or server error',
        message: e.message,
        code: e.code,
        hint: 'Check DATABASE_URL and that PostgreSQL is running.',
        timestamp: new Date().toISOString()
      })
    }
  }
}
app.get('/api/db-health', dbHealthHandler)
// Alias for troubleshooting doc (browser snippet uses this URL)
app.get('/api/test-db-connection', dbHealthHandler)

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
    if (!handler) {
      console.error('❌ Contacts handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    const result = handler(req, res)
    if (result && typeof result.then === 'function') {
      await result
    }
    return result
  } catch (e) {
    console.error('❌ Contacts API error:', {
      message: e.message,
      name: e.name,
      code: e.code,
      url: req.url,
      method: req.method,
      params: req.params,
      stack: e.stack?.substring(0, 500)
    })
    if (!res.headersSent && !res.writableEnded) {
      const isDbError = e.code === 'P1001' || e.code === 'P1002' || e.code === 'P1008' || 
                       e.code === 'P1017' || e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED' ||
                       e.code === 'ENOTFOUND' || e.name === 'PrismaClientInitializationError' ||
                       e.message?.includes("Can't reach database server")
      
      return res.status(isDbError ? 503 : 500).json({ 
        error: isDbError ? 'Database connection error' : 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? e.message : 'Failed to process request',
        timestamp: new Date().toISOString()
      })
    }
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
    // Ensure req.params is set for the handler (clientId is required for add site)
    if (!req.params) req.params = {}
    if (!req.params.clientId && req.url) {
      const pathSegments = req.url.split('?')[0].split('/').filter(Boolean)
      const clientIdx = pathSegments.indexOf('client')
      if (clientIdx >= 0 && pathSegments[clientIdx + 1]) req.params.clientId = pathSegments[clientIdx + 1]
      if (clientIdx >= 0 && pathSegments[clientIdx + 2]) req.params.siteId = pathSegments[clientIdx + 2]
    }
    const handler = await loadHandler(path.join(apiDir, 'sites.js'))
    if (!handler) {
      console.error('❌ Sites handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    const result = handler(req, res)
    if (result && typeof result.then === 'function') await result
    return result
  } catch (e) {
    console.error('❌ Error in sites handler:', e)
    if (!res.headersSent) {
      // GET /api/sites/client/:id must never 500 — return empty sites so UI does not retry/rate-limit
      const isGetSitesList = req.method === 'GET' && req.params && req.params.clientId && !req.params.siteId
      if (isGetSitesList) {
        return res.status(200).json({ data: { sites: [] } })
      }
      return res.status(500).json({
        error: 'Internal server error',
        message: e.message,
        details: process.env.NODE_ENV === 'development' ? e.stack : undefined,
        timestamp: new Date().toISOString()
      })
    }
    return next(e)
  }
})

// Explicit mapping for helpdesk endpoints
app.all('/api/helpdesk/:id?/:action?', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'helpdesk.js'))
    if (!handler) {
      console.error('❌ Helpdesk handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    
    // Ensure handler result is awaited
    const result = handler(req, res)
    if (result && typeof result.then === 'function') {
      await result
    }
    return result
  } catch (e) {
    console.error('❌ Error in helpdesk handler:', {
      error: e.message,
      errorName: e.name,
      stack: e.stack,
      url: req.url,
      method: req.method
    })
    if (!res.headersSent && !res.writableEnded) {
      return res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? e.message : 'Failed to process helpdesk request',
        timestamp: new Date().toISOString()
      })
    }
    return next(e)
  }
})

// Explicit mapping for helpdesk stats endpoint
app.all('/api/helpdesk/stats', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'helpdesk.js'))
    if (!handler) {
      console.error('❌ Helpdesk handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    
    // Ensure handler result is awaited
    const result = handler(req, res)
    if (result && typeof result.then === 'function') {
      await result
    }
    return result
  } catch (e) {
    console.error('❌ Error in helpdesk stats handler:', {
      error: e.message,
      errorName: e.name,
      stack: e.stack,
      url: req.url,
      method: req.method
    })
    if (!res.headersSent && !res.writableEnded) {
      return res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? e.message : 'Failed to process helpdesk request',
        timestamp: new Date().toISOString()
      })
    }
    return next(e)
  }
})

// Email webhook endpoint for helpdesk (no auth required - uses webhook secret)
app.all('/api/helpdesk/email-webhook', async (req, res, next) => {
  try {
    // Use express.urlencoded and express.json middleware for webhook payloads
    const handler = await loadHandler(path.join(apiDir, 'helpdesk', 'email-webhook.js'))
    if (!handler) {
      console.error('❌ Helpdesk email webhook handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    return handler(req, res)
  } catch (e) {
    console.error('❌ Error in helpdesk email webhook handler:', e)
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? e.message : 'Failed to process email webhook',
        timestamp: new Date().toISOString()
      })
    }
    return next(e)
  }
})

// Gmail API watcher endpoint (checks Gmail for new emails)
app.post('/api/helpdesk/gmail-watcher', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'helpdesk', 'gmail-watcher.js'))
    if (!handler) {
      console.error('❌ Gmail watcher handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    return handler(req, res)
  } catch (e) {
    console.error('❌ Error in Gmail watcher handler:', e)
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? e.message : 'Failed to check Gmail',
        timestamp: new Date().toISOString()
      })
    }
    return next(e)
  }
})

// Gmail OAuth endpoints
app.get('/api/helpdesk/gmail-auth', async (req, res, next) => {
  try {
    const { handleGmailAuth } = await import(path.join(apiDir, 'helpdesk', 'gmail-auth.js'))
    if (handleGmailAuth) {
      return handleGmailAuth(req, res)
    }
    return res.status(404).json({ error: 'Gmail auth handler not found' })
  } catch (e) {
    console.error('❌ Error in Gmail auth handler:', e)
    return res.status(500).json({ error: 'Internal server error', message: e.message })
  }
})

app.get('/api/helpdesk/gmail-callback', async (req, res, next) => {
  try {
    const { handleGmailCallback } = await import(path.join(apiDir, 'helpdesk', 'gmail-auth.js'))
    if (handleGmailCallback) {
      return handleGmailCallback(req, res)
    }
    return res.status(404).json({ error: 'Gmail callback handler not found' })
  } catch (e) {
    console.error('❌ Error in Gmail callback handler:', e)
    return res.status(500).json({ error: 'Internal server error', message: e.message })
  }
})

// Explicit mapping for audit-logs operations (GET, POST /api/audit-logs)
app.all('/api/audit-logs', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'audit-logs.js'))
    if (!handler) {
      console.error('❌ Audit-logs handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    const result = handler(req, res)
    if (result && typeof result.then === 'function') {
      await result
    }
    return result
  } catch (e) {
    console.error('❌ Error in audit-logs handler:', e)
    console.error('❌ Error stack:', e.stack)
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

// Explicit mapping for feedback operations (GET, POST /api/feedback)
app.all('/api/feedback', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'feedback.js'))
    if (!handler) {
      console.error('❌ Feedback handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    const result = handler(req, res)
    if (result && typeof result.then === 'function') {
      await result
    }
    return result
  } catch (e) {
    console.error('❌ Error in feedback handler:', e)
    console.error('❌ Error stack:', e.stack)
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

// Explicit mapping for feedback reply operations (POST /api/feedback/:id/replies)
app.all('/api/feedback/:id/replies', async (req, res, next) => {
  try {
    // Extract feedback ID from URL
    const urlPath = req.url.split('?')[0].split('#')[0]
    const pathSegments = urlPath.replace(/^\/api\/?/, '').split('/').filter(Boolean)
    if (pathSegments.length >= 3 && pathSegments[0] === 'feedback') {
      req.params = req.params || {}
      req.params.id = pathSegments[1]
    }
    
    const handler = await loadHandler(path.join(apiDir, 'feedback.js'))
    if (!handler) {
      console.error('❌ Feedback handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    const result = handler(req, res)
    if (result && typeof result.then === 'function') {
      await result
    }
    return result
  } catch (e) {
    console.error('❌ Error in feedback reply handler:', e)
    console.error('❌ Error stack:', e.stack)
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

// Explicit mapping for clients list and create operations (GET, POST /api/clients)
app.all('/api/clients', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'clients.js'))
    if (!handler) {
      console.error('❌ Clients handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    // Await the handler to properly catch async errors
    const result = await handler(req, res)
    return result
  } catch (e) {
    console.error('❌ Error in clients handler:', e)
    console.error('❌ Error stack:', e.stack)
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

// Explicit mapping for individual lead operations (GET, PATCH, DELETE /api/leads/:id)
// IMPORTANT: This must come BEFORE /api/leads route so Express matches it first
app.all('/api/leads/:id', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'leads', '[id].js'))
    if (!handler) {
      console.error('❌ Leads [id] handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    // Attach lead ID to req.params for the handler
    req.params = req.params || {}
    const result = handler(req, res)
    if (result && typeof result.then === 'function') {
      await result
    }
    return result
  } catch (e) {
    console.error('❌ Error in leads [id] handler:', e)
    console.error('❌ Error stack:', e.stack)
    console.error('❌ Error details:', {
      message: e.message,
      name: e.name,
      code: e.code,
      url: req.url,
      method: req.method,
      leadId: req.params?.id
    })
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

// Explicit mapping for leads list and create operations (GET, POST /api/leads)
app.all('/api/leads', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'leads.js'))
    if (!handler) {
      console.error('❌ Leads handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    const result = handler(req, res)
    if (result && typeof result.then === 'function') {
      await result
    }
    return result
  } catch (e) {
    console.error('❌ Error in leads handler:', e)
    console.error('❌ Error stack:', e.stack)
    console.error('❌ Error details:', {
      message: e.message,
      name: e.name,
      code: e.code,
      url: req.url,
      method: req.method
    })
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

// Explicit mapping for meeting-notes operations (GET, POST, PUT, DELETE /api/meeting-notes)
app.all('/api/meeting-notes', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'meeting-notes.js'))
    if (!handler) {
      console.error('❌ Meeting-notes handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    const result = handler(req, res)
    if (result && typeof result.then === 'function') {
      await result
    }
    return result
  } catch (e) {
    console.error('❌ Error in meeting-notes handler:', e)
    console.error('❌ Error stack:', e.stack)
    console.error('❌ Error details:', {
      message: e.message,
      name: e.name,
      code: e.code,
      url: req.url,
      method: req.method,
      query: req.query,
      hasBody: !!req.body
    })
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

// Explicit mapping for client groups list endpoint (GET /api/clients/groups)
// MUST come BEFORE /api/clients/:id/groups so Express matches it first
app.all('/api/clients/groups', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'clients', 'groups.js'))
    if (!handler) {
      console.error('❌ Groups handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    const result = handler(req, res)
    if (result && typeof result.then === 'function') {
      await result
    }
    return result
  } catch (e) {
    console.error('❌ Groups API error:', {
      message: e.message,
      name: e.name,
      code: e.code,
      url: req.url,
      method: req.method,
      stack: e.stack?.substring(0, 500)
    })
    if (!res.headersSent && !res.writableEnded) {
      const isDbError = e.code === 'P1001' || e.code === 'P1002' || e.code === 'P1008' || 
                       e.code === 'P1017' || e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED' ||
                       e.code === 'ENOTFOUND' || e.name === 'PrismaClientInitializationError' ||
                       e.message?.includes("Can't reach database server")
      
      return res.status(isDbError ? 503 : 500).json({ 
        error: isDbError ? 'Database connection error' : 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? e.message : 'Failed to process request',
        timestamp: new Date().toISOString()
      })
    }
    return next(e)
  }
})

// Explicit mapping for group members endpoint (GET /api/clients/groups/:groupId/members)
// MUST come BEFORE /api/clients/groups/:groupId so Express matches it first
app.all('/api/clients/groups/:groupId/members', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'clients', 'groups.js'))
    if (!handler) {
      console.error('❌ Groups handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    // Attach groupId to req.params for the handler
    req.params = req.params || {}
    const result = handler(req, res)
    if (result && typeof result.then === 'function') {
      await result
    }
    return result
  } catch (e) {
    console.error('❌ Groups API error:', {
      message: e.message,
      name: e.name,
      code: e.code,
      url: req.url,
      method: req.method,
      params: req.params,
      stack: e.stack?.substring(0, 500)
    })
    if (!res.headersSent && !res.writableEnded) {
      const isDbError = e.code === 'P1001' || e.code === 'P1002' || e.code === 'P1008' || 
                       e.code === 'P1017' || e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED' ||
                       e.code === 'ENOTFOUND' || e.name === 'PrismaClientInitializationError' ||
                       e.message?.includes("Can't reach database server")
      
      return res.status(isDbError ? 503 : 500).json({ 
        error: isDbError ? 'Database connection error' : 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? e.message : 'Failed to process request',
        timestamp: new Date().toISOString()
      })
    }
    return next(e)
  }
})

// Explicit mapping for delete group endpoint (DELETE /api/clients/groups/:groupId)
// MUST come BEFORE /api/clients/:id/groups so Express matches it first
app.all('/api/clients/groups/:groupId', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'clients', 'groups.js'))
    if (!handler) {
      console.error('❌ Groups handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    // Attach groupId to req.params for the handler
    req.params = req.params || {}
    const result = handler(req, res)
    if (result && typeof result.then === 'function') {
      await result
    }
    return result
  } catch (e) {
    console.error('❌ Groups API error:', {
      message: e.message,
      name: e.name,
      code: e.code,
      url: req.url,
      method: req.method,
      params: req.params,
      stack: e.stack?.substring(0, 500)
    })
    if (!res.headersSent && !res.writableEnded) {
      const isDbError = e.code === 'P1001' || e.code === 'P1002' || e.code === 'P1008' || 
                       e.code === 'P1017' || e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED' ||
                       e.code === 'ENOTFOUND' || e.name === 'PrismaClientInitializationError' ||
                       e.message?.includes("Can't reach database server")
      
      return res.status(isDbError ? 503 : 500).json({ 
        error: isDbError ? 'Database connection error' : 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? e.message : 'Failed to process request',
        timestamp: new Date().toISOString()
      })
    }
    return next(e)
  }
})

// Explicit mapping for client groups endpoints (GET, POST, DELETE /api/clients/:id/groups)
app.all('/api/clients/:id/groups/:groupId?', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'clients', 'groups.js'))
    if (!handler) {
      console.error('❌ Groups handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    // Attach client ID and groupId to req.params for the handler
    req.params = req.params || {}
    const result = handler(req, res)
    if (result && typeof result.then === 'function') {
      await result
    }
    return result
  } catch (e) {
    console.error('❌ Groups API error:', {
      message: e.message,
      name: e.name,
      code: e.code,
      url: req.url,
      method: req.method,
      params: req.params,
      stack: e.stack?.substring(0, 500)
    })
    if (!res.headersSent && !res.writableEnded) {
      const isDbError = e.code === 'P1001' || e.code === 'P1002' || e.code === 'P1008' || 
                       e.code === 'P1017' || e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED' ||
                       e.code === 'ENOTFOUND' || e.name === 'PrismaClientInitializationError' ||
                       e.message?.includes("Can't reach database server")
      
      return res.status(isDbError ? 503 : 500).json({ 
        error: isDbError ? 'Database connection error' : 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? e.message : 'Failed to process request',
        timestamp: new Date().toISOString()
      })
    }
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

// Explicit mapping for client KYC (PATCH /api/clients/:id/kyc) – dedicated save so KYC persists on tab switch/refresh
app.all('/api/clients/:id/kyc', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'clients', '[id]', 'kyc.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    req.params = { ...req.params, id: req.params.id }
    const result = handler(req, res)
    if (result && typeof result.then === 'function') await result
    return result
  } catch (e) {
    console.error('❌ KYC API error:', e)
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error', message: e.message })
    }
    return next(e)
  }
})

// Explicit mapping for tags endpoints with ID (GET, PATCH, DELETE /api/tags/:id)
app.all('/api/tags/:id', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'tags.js'))
    if (!handler) {
      console.error('❌ Tags handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    return handler(req, res)
  } catch (e) {
    console.error('❌ Error in tags handler:', e)
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

// Explicit mapping for tags endpoints without ID (GET, POST /api/tags)
app.all('/api/tags', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'tags.js'))
    if (!handler) {
      console.error('❌ Tags handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    return handler(req, res)
  } catch (e) {
    console.error('❌ Error in tags handler:', e)
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
    if (!handler) {
      console.error('❌ Client tags handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    // Pass the client ID as a param
    req.params = req.params || {}
    return handler(req, res)
  } catch (e) {
    console.error('❌ Error in client tags handler:', e)
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

// Explicit mapping for clients operations with ID (GET, PATCH, DELETE /api/clients/[id])
app.all('/api/clients/:id', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'clients', '[id].js'))
    if (!handler) {
      console.error('❌ Client [id] handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    const result = handler(req, res)
    if (result && typeof result.then === 'function') {
      await result
    }
    return result
  } catch (e) {
    console.error('❌ Error in client [id] handler:', e)
    console.error('❌ Error stack:', e.stack)
    console.error('❌ Error details:', {
      message: e.message,
      name: e.name,
      code: e.code,
      url: req.url,
      method: req.method,
      params: req.params
    })
    if (!res.headersSent && !res.writableEnded) {
      const isDbError = e.code === 'P1001' || e.code === 'P1002' || e.code === 'P1008' || 
                       e.code === 'P1017' || e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED' ||
                       e.code === 'ENOTFOUND' || e.name === 'PrismaClientInitializationError' ||
                       e.message?.includes("Can't reach database server")
      
      return res.status(isDbError ? 503 : 500).json({ 
        error: isDbError ? 'Database connection error' : 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? e.message : 'Failed to process request',
        timestamp: new Date().toISOString()
      })
    }
    return next(e)
  }
})

// Explicit mapping for jobcards endpoints (GET, POST /api/jobcards)
// IMPORTANT: This must come BEFORE the catch-all route
app.all('/api/jobcards/:id?', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'jobcards.js'))
    if (!handler) {
      console.error('❌ Jobcards handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    const result = handler(req, res)
    if (result && typeof result.then === 'function') {
      await result
    }
    return result
  } catch (e) {
    console.error('❌ Jobcards API error:', {
      message: e.message,
      name: e.name,
      code: e.code,
      url: req.url,
      method: req.method,
      params: req.params,
      stack: e.stack?.substring(0, 500)
    })
    if (!res.headersSent && !res.writableEnded) {
      const isDbError = e.code === 'P1001' || e.code === 'P1002' || e.code === 'P1008' || 
                       e.code === 'P1017' || e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED' ||
                       e.code === 'ENOTFOUND' || e.name === 'PrismaClientInitializationError' ||
                       e.message?.includes("Can't reach database server")
      
      return res.status(isDbError ? 503 : 500).json({ 
        error: isDbError ? 'Database connection error' : 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? e.message : 'Failed to process request',
        timestamp: new Date().toISOString()
      })
    }
    return next(e)
  }
})

// Explicit mapping for project list operations (GET, POST /api/projects)
app.all('/api/projects', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'projects.js'))
    if (!handler) {
      console.error('❌ Projects handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    return handler(req, res)
  } catch (e) {
    console.error('❌ Error in projects handler:', e)
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

// Explicit mapping for project operations with ID (GET, PUT, DELETE /api/projects/[id])
app.all('/api/projects/:id', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'projects', '[id].js'))
    if (!handler) {
      console.error('❌ Projects [id] handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    return handler(req, res)
  } catch (e) {
    console.error('❌ Error in projects handler:', e)
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

// Explicit mapping for time-entries (GET list / POST create, and GET/PUT/DELETE by id) – connected to DB
app.all('/api/time-entries', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'time-entries.js'))
    if (!handler) {
      console.error('❌ Time-entries handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    return handler(req, res)
  } catch (e) {
    console.error('❌ Error in time-entries handler:', e)
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
app.all('/api/time-entries/:id', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'time-entries.js'))
    if (!handler) {
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    return handler(req, res)
  } catch (e) {
    console.error('❌ Error in time-entries handler:', e)
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

// Explicit mapping for document-collection-templates list and create operations (GET, POST /api/document-collection-templates)
app.all('/api/document-collection-templates', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'document-collection-templates.js'))
    if (!handler) {
      console.error('❌ Document collection templates handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    return handler(req, res)
  } catch (e) {
    console.error('❌ Error in document-collection-templates handler:', e)
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

// Explicit mapping for document-collection-templates operations with ID (GET, PUT, DELETE /api/document-collection-templates/:id)
app.all('/api/document-collection-templates/:id', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'document-collection-templates', '[id].js'))
    if (!handler) {
      console.error('❌ Document collection templates [id] handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    // Ensure req.params.id is set for the handler
    req.params = req.params || {}
    req.params.id = req.params.id || req.url.split('/').pop()
    return handler(req, res)
  } catch (e) {
    console.error('❌ Error in document-collection-templates [id] handler:', e)
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

// Weekly FMS Review now uses document-collection-templates (same as Monthly FMS Review)
// Removed weekly-fms-review-templates routes - they are no longer needed

// Explicit mapping for user tasks list and create operations (GET, POST /api/user-tasks)
app.all('/api/user-tasks', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'user-tasks.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    return next(e)
  }
})

// Explicit mapping for user task operations with ID (GET, PUT, DELETE /api/user-tasks/[id])
app.all('/api/user-tasks/:id', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'user-tasks.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    return next(e)
  }
})

// Explicit mapping for user task tags list and create operations (GET, POST /api/user-task-tags)
app.all('/api/user-task-tags', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'user-task-tags.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    return next(e)
  }
})

// Explicit mapping for user task tag operations with ID (GET, PUT, DELETE /api/user-task-tags/[id])
app.all('/api/user-task-tags/:id', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'user-task-tags.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    return next(e)
  }
})

// Explicit mapping for user notes list and create operations (GET, POST /api/user-notes)
app.all('/api/user-notes', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'user-notes.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    return next(e)
  }
})

// Explicit mapping for user note share operations (POST /api/user-notes/[id]/share)
app.all('/api/user-notes/:id/share', async (req, res, next) => {
  try {
    req.params = req.params || {}
    req.params.id = req.params.id || req.url.split('/').slice(-2, -1)[0]
    const handler = await loadHandler(path.join(apiDir, 'user-notes.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    return next(e)
  }
})

// Explicit mapping for user note operations with ID (GET, PUT, DELETE /api/user-notes/[id])
app.all('/api/user-notes/:id', async (req, res, next) => {
  try {
    // Skip if it's a share route
    const urlPath = req.url.split('?')[0].split('#')[0]
    if (urlPath.includes('/share')) {
      return next()
    }
    const handler = await loadHandler(path.join(apiDir, 'user-notes.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    return next(e)
  }
})

// Explicit mapping for leave application operations with ID (GET, PATCH, PUT, DELETE /api/leave-platform/applications/:id)
// Must be before specific action routes (approve, reject, cancel) to avoid conflicts
app.all('/api/leave-platform/applications/:id', async (req, res, next) => {
  try {
    // Skip if it's a nested route (approve, reject, cancel)
    const urlPath = req.url.split('?')[0].split('#')[0]
    if (urlPath.includes('/approve') || urlPath.includes('/reject') || urlPath.includes('/cancel')) {
      return next()
    }
    req.params = req.params || {}
    req.params.id = req.params.id || urlPath.split('/').pop()
    const handler = await loadHandler(path.join(apiDir, 'leave-platform', 'applications', '[id].js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    return next(e)
  }
})

// Explicit mapping for leave platform approval/rejection endpoints
app.all('/api/leave-platform/applications/:id/approve', async (req, res, next) => {
  try {
    req.params = req.params || {}
    req.params.id = req.params.id || req.url.split('/').slice(-2, -1)[0]
    const handler = await loadHandler(path.join(apiDir, 'leave-platform', 'applications', '[id]', 'approve.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    return next(e)
  }
})

app.all('/api/leave-platform/applications/:id/reject', async (req, res, next) => {
  try {
    req.params = req.params || {}
    req.params.id = req.params.id || req.url.split('/').slice(-2, -1)[0]
    const handler = await loadHandler(path.join(apiDir, 'leave-platform', 'applications', '[id]', 'reject.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    return next(e)
  }
})

app.all('/api/leave-platform/applications/:id/cancel', async (req, res, next) => {
  try {
    req.params = req.params || {}
    req.params.id = req.params.id || req.url.split('/').slice(-2, -1)[0]
    const handler = await loadHandler(path.join(apiDir, 'leave-platform', 'applications', '[id]', 'cancel.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    return next(e)
  }
})

// Explicit mapping for leave platform base endpoints
app.all('/api/leave-platform/applications', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'leave-platform', 'applications.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    console.error('❌ Leave Platform applications API error:', e)
    return next(e)
  }
})

app.all('/api/leave-platform/balances', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'leave-platform', 'balances.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    console.error('❌ Leave Platform balances API error:', e)
    return next(e)
  }
})

app.all('/api/leave-platform/approvers', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'leave-platform', 'approvers.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    console.error('❌ Leave Platform approvers API error:', e)
    return next(e)
  }
})

app.all('/api/leave-platform/birthdays', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'leave-platform', 'birthdays.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    console.error('❌ Leave Platform birthdays API error:', e)
    return next(e)
  }
})

app.all('/api/leave-platform/departments', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'leave-platform', 'departments.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    console.error('❌ Leave Platform departments API error:', e)
    return next(e)
  }
})

app.all('/api/leave-platform/import-balances', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'leave-platform', 'import-balances.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    console.error('❌ Leave Platform import-balances API error:', e)
    return next(e)
  }
})

// Public API endpoints for job card form (no authentication required)
app.all('/api/public/clients', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'public', 'clients.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    console.error('❌ Public clients API error:', e)
    return next(e)
  }
})

app.all('/api/public/users', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'public', 'users.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    console.error('❌ Public users API error:', e)
    return next(e)
  }
})

app.all('/api/public/inventory', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'public', 'inventory.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    console.error('❌ Public inventory API error:', e)
    return next(e)
  }
})

app.all('/api/public/locations', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'public', 'locations.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    console.error('❌ Public locations API error:', e)
    return next(e)
  }
})

app.all('/api/public/service-forms', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'public', 'service-forms.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    console.error('❌ Public service-forms API error:', e)
    return next(e)
  }
})

// Public API endpoint for job card submission (no authentication required)
app.all('/api/public/jobcards', async (req, res, next) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'public', 'jobcards.js'))
    if (!handler) return res.status(404).json({ error: 'API endpoint not found' })
    return handler(req, res)
  } catch (e) {
    console.error('❌ Public jobcards API error:', e)
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
    if (!handler) {
      console.error('❌ Users handler not found')
      return res.status(404).json({ error: 'API endpoint not found' })
    }
    return handler(req, res)
  } catch (e) {
    console.error('❌ Error in users handler:', e)
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

// Explicit mapping for individual opportunity operations (GET, PUT, DELETE /api/opportunities/[id])
// This route is handled by the dynamic route resolution below

// POA Review: explicit routes so handlers load reliably (avoids dynamic path resolution issues)
app.post('/api/poa-review/process-excel', async (req, res) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'poa-review', 'process-excel.js'))
    return handler(req, res)
  } catch (e) {
    console.error('❌ POA Review process-excel handler error:', e)
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Handler failed to load', path: req.url, timestamp: new Date().toISOString() })
    }
    throw e
  }
})
app.post('/api/poa-review/process-batch', async (req, res) => {
  try {
    const handler = await loadHandler(path.join(apiDir, 'poa-review', 'process-batch.js'))
    return handler(req, res)
  } catch (e) {
    console.error('❌ POA Review process-batch handler error:', e)
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Handler failed to load', path: req.url, timestamp: new Date().toISOString() })
    }
    throw e
  }
})

// API routes - must come before catch-all route
app.use('/api', async (req, res) => {
  let timeout = null
  try {
    const handlerPath = toHandlerPath(req.url)
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔍 Loading handler for ${req.method} ${req.url} -> ${handlerPath}`)
    }
    
    // Extract ID from URL for dynamic routes (e.g., /api/leads/[id] or /api/projects/[id]/document-sections-v2)
    // This ensures req.params.id is available for handlers that expect it
    if (handlerPath.includes('[id]')) {
      const urlPath = (req.originalUrl || req.url || '').split('?')[0].split('#')[0]
      const pathSegments = urlPath.replace(/^\/api\/?/, '').replace(/^\//, '').split('/').filter(Boolean)
      const relPath = path.relative(apiDir, handlerPath)
      const pathParts = relPath.split(path.sep)
      const idSegmentIndex = pathParts.findIndex((p) => p === '[id]')
      if (idSegmentIndex >= 0 && pathSegments[idSegmentIndex]) {
        req.params = req.params || {}
        req.params.id = pathSegments[idSegmentIndex]
      } else if (pathSegments.length >= 2) {
        req.params = req.params || {}
        req.params.id = pathSegments[pathSegments.length - 1]
      }
    }
    
    const handler = await loadHandler(handlerPath)
    
    if (req.method === 'OPTIONS') {
      return res.status(204).end()
    }
    
    // Add timeout to prevent hanging requests
    // POA Review processing can take up to 5 minutes, so give it more time
    const isPOAReview = req.url.includes('/poa-review/process') || req.url.includes('/poa-review/process-batch') || req.url.includes('/poa-review/process-excel');
    const timeoutDuration = isPOAReview ? 360000 : 30000; // 6 minutes for POA Review, 30 seconds for others
    
    timeout = setTimeout(() => {
      if (!res.headersSent) {
        console.error(`⏰ Request timeout for: ${req.method} ${req.url}`)
        res.status(504).json({ 
          error: 'Request timeout', 
          path: req.url,
          timestamp: new Date().toISOString()
        })
      }
    }, timeoutDuration)
    
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
        
        // Check for database connection errors
        const isDbError = handlerError.code === 'P1001' || handlerError.code === 'P1002' || 
                         handlerError.code === 'P1008' || handlerError.code === 'P1017' || 
                         handlerError.code === 'ETIMEDOUT' || handlerError.code === 'ECONNREFUSED' ||
                         handlerError.code === 'ENOTFOUND' || handlerError.name === 'PrismaClientInitializationError' ||
                         handlerError.message?.includes("Can't reach database server")
        
        const errorResponse = {
          error: 'Internal server error',
          errorCode: handlerError.code || 'UNKNOWN',
          errorName: handlerError.name || 'Error',
          timestamp: new Date().toISOString()
        }
        
        if (isDbError) {
          errorResponse.error = 'Database connection error'
          errorResponse.details = isDevelopment 
            ? `Database connection failed: ${handlerError.message}`
            : 'Database server is unreachable. Please check server logs.'
        } else {
          errorResponse.details = isDevelopment 
            ? handlerError.message 
            : 'Contact support if this persists'
        }
        
        res.status(500).json(errorResponse)
      } else {
        console.error('⚠️ Cannot send error response - headers already sent or response ended')
      }
      
      // Re-throw to be caught by outer catch block
      throw handlerError
    }
    
  } catch (error) {
    if (timeout) clearTimeout(timeout)
    
    // Enhanced error logging with database connection detection
    const isDbError = error.code === 'P1001' || error.code === 'P1002' || error.code === 'P1008' || 
                      error.code === 'P1017' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' ||
                      error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN' ||
                      error.name === 'PrismaClientInitializationError' ||
                      error.message?.includes("Can't reach database server") ||
                      error.message?.includes("Can't reach database")
    
    if (isDbError) {
      console.error('🔌 Database connection error detected in catch-all handler')
    }
    
    console.error('❌ Railway API Error:', {
      method: req.method,
      url: req.url,
      error: error.message,
      errorName: error.name,
      errorCode: error.code,
      isDbError,
      stack: error.stack?.substring(0, 1000), // Limit stack trace length
      timestamp: new Date().toISOString(),
      headersSent: res.headersSent,
      writableEnded: res.writableEnded
    })
    
    // Don't expose internal errors in production
    const isDevelopment = process.env.NODE_ENV === 'development'
    
    if (!res.headersSent && !res.writableEnded) {
      const errorResponse = {
        error: isDbError ? 'DATABASE_CONNECTION_ERROR' : 'Internal server error',
        message: isDbError 
          ? 'Database connection failed. The database server is unreachable.'
          : (isDevelopment ? error.message : 'Contact support if this persists'),
        timestamp: new Date().toISOString()
      }
      
      if (isDevelopment && error.code) {
        errorResponse.errorCode = error.code
      }
      
      res.status(500).json(errorResponse)
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
    version: APP_VERSION
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

// Shared static headers helper for HTTP/2-safe responses
function setHttp2SafeStaticHeaders(res, path) {
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
    // Always revalidate JS so deployments propagate instantly
    res.setHeader('Cache-Control', 'no-cache, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
  } else if (path.endsWith('.css')) {
    res.setHeader('Content-Type', 'text/css; charset=utf-8')
    // Always revalidate CSS to prevent stale styles after deploy
    res.setHeader('Cache-Control', 'no-cache, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
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

// Serve /uploads/* from rootDir/uploads FIRST - explicit route so attachment links
// open the file in a new tab, never the SPA (fixes "revert to dashboard" when clicking attachments)
const uploadsDir = path.join(rootDir, 'uploads')
const uploadSubdirs = ['doc-collection-comments', 'monthly-fms-comments', 'weekly-fms-comments', 'document-sorter-uploads', 'document-sorter-output', 'poa-review-outputs', 'poa-review-inputs', 'poa-review-temp']
for (const d of uploadSubdirs) {
  try { fs.mkdirSync(path.join(uploadsDir, d), { recursive: true }) } catch (_) { /* ignore */ }
}
app.get(/^\/uploads\//, (req, res) => {
  const pathname = (req.originalUrl || req.url || '').split('?')[0]
  let subPath = (pathname.replace(/^\/uploads\/?/, '') || '').replace(/^\//, '')
  try {
    subPath = decodeURIComponent(subPath)
  } catch (_) {
    return res.status(400).type('text/plain').send('Bad request')
  }
  if (subPath.includes('..')) {
    return res.status(403).type('text/plain').send('Forbidden')
  }
  const filePath = path.join(uploadsDir, subPath)
  const resolved = path.resolve(filePath)
  const uploadsResolved = path.resolve(uploadsDir)
  if (!resolved.startsWith(uploadsResolved)) {
    return res.status(403).type('text/plain').send('Forbidden')
  }
  res.sendFile(resolved, (err) => {
    if (err) {
      if (!res.headersSent) res.status(404).type('text/plain').send('File not found')
    }
  })
})

// Serve Vite Projects bundle and CSS from /vite-projects
// Requires: npm run build:vite-projects (outputs to dist/vite-projects/)
app.use(
  '/vite-projects',
  express.static(path.join(rootDir, 'dist', 'vite-projects'), {
    index: false,
    dotfiles: 'ignore',
    etag: true,
    lastModified: true,
    maxAge: '7d',
    redirect: false,
    setHeaders: (res, filePath, stat) => {
      setHttp2SafeStaticHeaders(res, filePath)
    }
  })
)

// Serve static files from root directory with HTTP/2-safe headers
// MUST be after API routes to avoid serving HTML for API endpoints
app.use(
  express.static(rootDir, {
    index: false, // Don't serve index.html automatically
    dotfiles: 'ignore',
    etag: true,
    lastModified: true,
    maxAge: '7d', // Cache for 7 days for better performance
    redirect: false, // Disable automatic redirects for trailing slashes
    setHeaders: (res, filePath, stat) => {
      setHttp2SafeStaticHeaders(res, filePath)
    }
  })
)

// Catch-all route for static files - must come last
// Only serve index.html for non-API routes
app.get('*', (req, res) => {
  // Skip API routes - they should have been handled by the API middleware above
  if (req.url.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' })
  }
  // Never serve SPA for /uploads/* - attachments must get file or 404 (handled above)
  const pathname = (req.url || '').split('?')[0]
  if (pathname.startsWith('/uploads/')) {
    return res.status(404).type('text/plain').send('File not found')
  }
  // Never serve index.html for /vite-projects/* - return 404 so browser doesn't get HTML as JS/CSS (MIME type error)
  if (pathname.startsWith('/vite-projects/')) {
    return res.status(404).type('text/plain').setHeader('Cache-Control', 'no-store').send('Vite asset not found. Ensure npm run build:vite-projects ran and dist/vite-projects/ is deployed.')
  }

  // Force fresh HTML for root: redirect / to /?v=BUILD_VERSION so browser never uses cached index.html
  if (pathname === '/' || pathname === '') {
    const hasVersion = req.query && (req.query.v || req.query.nocache || req.query._)
    if (!hasVersion) {
      let buildVersion = ''
      try {
        const versionPath = path.join(rootDir, 'dist', 'build-version.json')
        if (existsSync(versionPath)) {
          const raw = readFileSync(versionPath, 'utf8')
          const data = JSON.parse(raw)
          buildVersion = data.version ? String(data.version) : String(Date.now())
        } else {
          buildVersion = String(Date.now())
        }
      } catch (_) {
        buildVersion = String(Date.now())
      }
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
      res.setHeader('Pragma', 'no-cache')
      return res.redirect(302, `/?v=${encodeURIComponent(buildVersion)}`)
    }
  }

  // CRITICAL: Set no-cache headers for index.html to prevent stale deployments
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  
  // Serve index.html for all other routes (SPA routing)
  res.sendFile(path.join(rootDir, 'index.html'))
})

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Railway Server running on port ${PORT}`)
  console.log(`📁 Serving from: ${rootDir}`)
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'production'}`)
  console.log(`📂 API directory: ${apiDir}`)
  
  // Setup daily leave notification cron job (runs at 8:00 AM daily)
  if (process.env.ENABLE_LEAVE_EMAIL_NOTIFICATIONS !== 'false') {
    try {
      const cron = (await import('node-cron')).default
      const { sendDailyLeaveNotifications } = await import('./api/leave-platform/daily-email-notification.js')
      
      // Schedule daily at 8:00 AM (South African time)
      cron.schedule('0 8 * * *', async () => {
        console.log('📧 Running daily leave notification job...')
        try {
          await sendDailyLeaveNotifications()
          console.log('✅ Daily leave notification job completed')
        } catch (error) {
          console.error('❌ Daily leave notification job failed:', error)
        }
      }, {
        timezone: 'Africa/Johannesburg'
      })
      
      console.log('✅ Daily leave notification cron job scheduled (8:00 AM daily)')
    } catch (error) {
      console.warn('⚠️ Failed to setup leave notification cron job:', error.message)
      console.warn('   Set ENABLE_LEAVE_EMAIL_NOTIFICATIONS=false to disable')
    }
  } else {
    console.log('ℹ️ Leave email notifications disabled (ENABLE_LEAVE_EMAIL_NOTIFICATIONS=false)')
  }
})

process.on('SIGTERM', () => {
  console.log('🛑 Railway server shutting down...')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('🛑 Railway server shutting down...')
  process.exit(0)
})
