// Production Railway ERP Server with Database
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()
const PORT = process.env.PORT || 3000

// Initialize Prisma
const prisma = new PrismaClient()

// Middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Serve static files with proper MIME types
app.use(express.static(__dirname, {
  setHeaders: (res, path) => {
    if (path.endsWith('.js') || path.endsWith('.jsx')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  }
}))

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

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('🔐 Login attempt:', req.body)
    
    const { email, password } = req.body || {}
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }
    
    // Find user in database
    const user = await prisma.user.findUnique({ 
      where: { email } 
    })
    
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    
    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash)
    
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    
    // Generate JWT token
    const payload = { sub: user.id, email: user.email, role: user.role }
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' })
    
    res.json({ 
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    })
    
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Login failed', details: error.message })
  }
})

// Me endpoint
app.get('/api/me', authRequired, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ 
      where: { id: req.user.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        provider: true,
        lastLoginAt: true
      }
    })
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' })
    }
    
    res.json({ user })
  } catch (error) {
    console.error('Me endpoint error:', error)
    res.status(500).json({ error: 'Failed to get user info', details: error.message })
  }
})

// List clients endpoint
app.get('/api/clients', authRequired, async (req, res) => {
  try {
    console.log('📋 Listing clients for user:', req.user.sub)
    
    const clients = await prisma.client.findMany({ 
      where: { ownerId: req.user.sub },
      orderBy: { createdAt: 'desc' } 
    })
    
    console.log('✅ Found clients:', clients.length)
    res.json({ data: { clients } })
  } catch (error) {
    console.error('Error listing clients:', error)
    res.status(500).json({ error: 'Failed to list clients', details: error.message })
  }
})

// Create client endpoint
app.post('/api/clients', authRequired, async (req, res) => {
  try {
    console.log('📝 Creating client:', req.body)
    
    const clientData = {
      name: req.body.name,
      industry: req.body.industry || 'Other',
      status: req.body.status || 'active',
      revenue: parseFloat(req.body.revenue) || 0,
      lastContact: req.body.lastContact ? new Date(req.body.lastContact) : new Date(),
      address: req.body.address || '',
      website: req.body.website || '',
      notes: req.body.notes || '',
      contacts: Array.isArray(req.body.contacts) ? req.body.contacts : [],
      followUps: Array.isArray(req.body.followUps) ? req.body.followUps : [],
      projectIds: Array.isArray(req.body.projectIds) ? req.body.projectIds : [],
      comments: Array.isArray(req.body.comments) ? req.body.comments : [],
      sites: Array.isArray(req.body.sites) ? req.body.sites : [],
      contracts: Array.isArray(req.body.contracts) ? req.body.contracts : [],
      activityLog: Array.isArray(req.body.activityLog) ? req.body.activityLog : [],
      billingTerms: typeof req.body.billingTerms === 'object' ? req.body.billingTerms : {
        paymentTerms: 'Net 30',
        billingFrequency: 'Monthly',
        currency: 'ZAR',
        retainerAmount: 0,
        taxExempt: false,
        notes: ''
      },
      ownerId: req.user.sub
    }
    
    const client = await prisma.client.create({ data: clientData })
    console.log('✅ Client created:', client.id)
    
    res.json({ data: { client } })
  } catch (error) {
    console.error('Error creating client:', error)
    res.status(500).json({ error: 'Failed to create client', details: error.message })
  }
})

// Update client endpoint
app.patch('/api/clients/:id', authRequired, async (req, res) => {
  try {
    const clientId = req.params.id
    console.log('📝 Updating client:', clientId, req.body)
    
    const updateData = {
      name: req.body.name,
      industry: req.body.industry,
      status: req.body.status,
      revenue: req.body.revenue,
      lastContact: req.body.lastContact ? new Date(req.body.lastContact) : undefined,
      address: req.body.address,
      website: req.body.website,
      notes: req.body.notes,
      contacts: Array.isArray(req.body.contacts) ? req.body.contacts : undefined,
      followUps: Array.isArray(req.body.followUps) ? req.body.followUps : undefined,
      projectIds: Array.isArray(req.body.projectIds) ? req.body.projectIds : undefined,
      comments: Array.isArray(req.body.comments) ? req.body.comments : undefined,
      sites: Array.isArray(req.body.sites) ? req.body.sites : undefined,
      contracts: Array.isArray(req.body.contracts) ? req.body.contracts : undefined,
      activityLog: Array.isArray(req.body.activityLog) ? req.body.activityLog : undefined,
      billingTerms: typeof req.body.billingTerms === 'object' ? req.body.billingTerms : undefined
    }
    
    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key]
      }
    })
    
    const client = await prisma.client.update({
      where: { id: clientId },
      data: updateData
    })
    
    console.log('✅ Client updated:', client.id)
    res.json({ data: { client } })
  } catch (error) {
    console.error('Error updating client:', error)
    res.status(500).json({ error: 'Failed to update client', details: error.message })
  }
})

// Delete client endpoint
app.delete('/api/clients/:id', authRequired, async (req, res) => {
  try {
    const clientId = req.params.id
    console.log('🗑️ Deleting client:', clientId)
    
    await prisma.client.delete({ where: { id: clientId } })
    
    console.log('✅ Client deleted:', clientId)
    res.json({ message: 'Client deleted successfully' })
  } catch (error) {
    console.error('Error deleting client:', error)
    res.status(500).json({ error: 'Failed to delete client', details: error.message })
  }
})

// Get single client endpoint
app.get('/api/clients/:id', authRequired, async (req, res) => {
  try {
    const clientId = req.params.id
    console.log('📖 Getting client:', clientId)
    
    const client = await prisma.client.findUnique({ 
      where: { id: clientId } 
    })
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' })
    }
    
    res.json({ data: { client } })
  } catch (error) {
    console.error('Error getting client:', error)
    res.status(500).json({ error: 'Failed to get client', details: error.message })
  }
})

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
