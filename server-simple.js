// Simplified Railway ERP Server
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(express.static(__dirname))

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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    platform: 'railway',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'production'
  })
})

// Auth endpoints
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('🔐 Login attempt:', req.body.email)
    
    // Import the login handler
    const { default: loginHandler } = await import('./api/auth/login.js')
    await loginHandler(req, res)
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Login failed', details: error.message })
  }
})

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { default: refreshHandler } = await import('./api/auth/refresh.js')
    await refreshHandler(req, res)
  } catch (error) {
    console.error('Refresh error:', error)
    res.status(500).json({ error: 'Refresh failed', details: error.message })
  }
})

app.post('/api/auth/logout', async (req, res) => {
  try {
    const { default: logoutHandler } = await import('./api/auth/logout.js')
    await logoutHandler(req, res)
  } catch (error) {
    console.error('Logout error:', error)
    res.status(500).json({ error: 'Logout failed', details: error.message })
  }
})

// Create admin endpoint
app.post('/api/create-admin', async (req, res) => {
  try {
    const { default: createAdminHandler } = await import('./api/create-admin.js')
    await createAdminHandler(req, res)
  } catch (error) {
    console.error('Create admin error:', error)
    res.status(500).json({ error: 'Create admin failed', details: error.message })
  }
})

// Clients endpoints
app.get('/api/clients', async (req, res) => {
  try {
    const { default: clientsHandler } = await import('./api/clients.js')
    await clientsHandler(req, res)
  } catch (error) {
    console.error('Clients error:', error)
    res.status(500).json({ error: 'Clients failed', details: error.message })
  }
})

app.get('/api/clients/:id', async (req, res) => {
  try {
    const { default: clientHandler } = await import('./api/clients/[id].js')
    await clientHandler(req, res)
  } catch (error) {
    console.error('Client detail error:', error)
    res.status(500).json({ error: 'Client detail failed', details: error.message })
  }
})

// Me endpoint
app.get('/api/me', async (req, res) => {
  try {
    const { default: meHandler } = await import('./api/me.js')
    await meHandler(req, res)
  } catch (error) {
    console.error('Me error:', error)
    res.status(500).json({ error: 'Me failed', details: error.message })
  }
})

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Railway ERP Server running on port ${PORT}`)
  console.log(`📁 Serving from: ${__dirname}`)
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
