// Clean Railway ERP Server - No external dependencies
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

// Me endpoint
app.get('/api/me', (req, res) => {
  // For testing, return the admin user
  res.json({
    id: '1',
    email: 'admin@abcotronics.com',
    name: 'Admin User',
    role: 'ADMIN'
  })
})

// Simple login endpoint - no external dependencies
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('🔐 Login attempt:', req.body)
    
    const { email, password } = req.body || {}
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }
    
    // Simple hardcoded check for testing
    if (email === 'admin@abcotronics.com' && password === 'admin123') {
      res.json({ 
        accessToken: 'test-access-token-' + Date.now(),
        user: {
          id: '1',
          email: 'admin@abcotronics.com',
          name: 'Admin User',
          role: 'ADMIN'
        },
        message: 'Login successful!'
      })
    } else {
      res.status(401).json({ error: 'Invalid credentials' })
    }
    
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Login failed', details: error.message })
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
