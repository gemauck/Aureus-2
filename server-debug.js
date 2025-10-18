// Simple test endpoint for debugging
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

// Simple test login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('🔐 Login attempt:', req.body)
    
    const { email, password } = req.body || {}
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }
    
    // For now, just return success to test the endpoint
    res.json({ 
      message: 'Login endpoint working',
      received: { email, password: '***' },
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Login failed', details: error.message })
  }
})

// Create admin endpoint
app.post('/api/create-admin', async (req, res) => {
  try {
    console.log('👤 Creating admin user...')
    
    // Import Prisma
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
    
    // Check if admin user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: 'admin@abcotronics.com' }
    })
    
    if (existingUser) {
      console.log('✅ Admin user already exists')
      return res.json({ 
        message: 'Admin user already exists',
        user: {
          email: existingUser.email,
          name: existingUser.name,
          role: existingUser.role
        }
      })
    }
    
    // Create admin user
    const bcrypt = await import('bcryptjs')
    const passwordHash = await bcrypt.hash('admin123', 10)
    
    const user = await prisma.user.create({
      data: {
        email: 'admin@abcotronics.com',
        name: 'Admin User',
        passwordHash,
        role: 'ADMIN'
      }
    })
    
    console.log('✅ Admin user created successfully!')
    
    res.json({ 
      message: 'Admin user created successfully',
      credentials: {
        email: 'admin@abcotronics.com',
        password: 'admin123'
      },
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    })
    
    await prisma.$disconnect()
    
  } catch (error) {
    console.error('❌ Error creating admin user:', error)
    res.status(500).json({ error: 'Failed to create admin user', details: error.message })
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
