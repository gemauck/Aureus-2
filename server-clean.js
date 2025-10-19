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

// Refresh token endpoint
app.post('/api/auth/refresh', (req, res) => {
  try {
    console.log('🔄 Refresh token request received')
    
    // For now, just return a new token (in production, validate refresh token)
    const newToken = 'refreshed-access-token-' + Date.now()
    
    res.json({
      accessToken: newToken,
      user: {
        id: '1',
        email: 'admin@abcotronics.com',
        name: 'Admin User',
        role: 'ADMIN'
      }
    })
  } catch (error) {
    console.error('Refresh error:', error)
    res.status(500).json({ error: 'Token refresh failed' })
  }
})

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  try {
    console.log('🔓 Logout request received')
    res.json({
      message: 'Logged out successfully'
    })
  } catch (error) {
    console.error('Logout error:', error)
    res.status(500).json({ error: 'Logout failed' })
  }
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

// User management endpoints
app.get('/api/users', (req, res) => {
  res.json({
    data: {
      users: [],
      invitations: []
    }
  })
})

app.post('/api/users/invite', (req, res) => {
  try {
    console.log('📧 Sending invitation:', req.body)
    const { email, name, role } = req.body
    
    if (!email || !name) {
      return res.status(400).json({ error: 'Email and name are required' })
    }
    
    // Mock successful invitation
    res.json({
      data: {
        invitation: {
          id: Date.now().toString(),
          email,
          name,
          role: role || 'user',
          status: 'pending',
          createdAt: new Date().toISOString()
        }
      }
    })
  } catch (error) {
    console.error('Error sending invitation:', error)
    res.status(500).json({ error: 'Failed to send invitation', details: error.message })
  }
})

// Clients endpoints
app.get('/api/clients', (req, res) => {
  // For now, return empty clients array
  // In production, this would fetch from database
  res.json({
    data: {
      clients: []
    }
  })
})

app.post('/api/clients', (req, res) => {
  try {
    console.log('📝 Creating client:', req.body)
    
    // Generate a unique ID for the new client
    const newClient = {
      id: Date.now().toString(), // Simple ID generation
      ...req.body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    
    // In production, this would save to database
    // For now, just return the created client
    res.json({
      data: {
        client: newClient
      }
    })
  } catch (error) {
    console.error('Error creating client:', error)
    res.status(500).json({ error: 'Failed to create client', details: error.message })
  }
})

app.get('/api/clients/:id', (req, res) => {
  try {
    const clientId = req.params.id
    console.log('📖 Getting client:', clientId)
    
    // In production, this would fetch from database
    res.json({
      data: {
        client: {
          id: clientId,
          name: 'Sample Client',
          email: 'client@example.com'
        }
      }
    })
  } catch (error) {
    console.error('Error getting client:', error)
    res.status(500).json({ error: 'Failed to get client', details: error.message })
  }
})

app.patch('/api/clients/:id', (req, res) => {
  try {
    const clientId = req.params.id
    console.log('📝 Updating client:', clientId, req.body)
    
    // In production, this would update in database
    res.json({
      data: {
        client: {
          id: clientId,
          ...req.body,
          updatedAt: new Date().toISOString()
        }
      }
    })
  } catch (error) {
    console.error('Error updating client:', error)
    res.status(500).json({ error: 'Failed to update client', details: error.message })
  }
})

app.delete('/api/clients/:id', (req, res) => {
  try {
    const clientId = req.params.id
    console.log('🗑️ Deleting client:', clientId)
    
    // In production, this would delete from database
    res.json({
      message: 'Client deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting client:', error)
    res.status(500).json({ error: 'Failed to delete client', details: error.message })
  }
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

// Leads endpoints
app.get('/api/leads', (req, res) => {
  console.log('📋 Fetching leads')
  res.json({
    data: []
  })
})

app.post('/api/leads', (req, res) => {
  try {
    console.log('📝 Creating lead:', req.body)
    const newLead = {
      id: Date.now().toString(),
      ...req.body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    res.json({
      data: newLead
    })
  } catch (error) {
    console.error('Error creating lead:', error)
    res.status(500).json({ error: 'Failed to create lead', details: error.message })
  }
})

app.put('/api/leads/:id', (req, res) => {
  try {
    const leadId = req.params.id
    console.log('📝 Updating lead:', leadId, req.body)
    const updatedLead = {
      id: leadId,
      ...req.body,
      updatedAt: new Date().toISOString()
    }
    res.json({
      data: updatedLead
    })
  } catch (error) {
    console.error('Error updating lead:', error)
    res.status(500).json({ error: 'Failed to update lead', details: error.message })
  }
})

app.delete('/api/leads/:id', (req, res) => {
  try {
    const leadId = req.params.id
    console.log('🗑️ Deleting lead:', leadId)
    res.json({
      data: {
        message: 'Lead deleted successfully'
      }
    })
  } catch (error) {
    console.error('Error deleting lead:', error)
    res.status(500).json({ error: 'Failed to delete lead', details: error.message })
  }
})

// Projects endpoints
app.get('/api/projects', (req, res) => {
  console.log('📋 Fetching projects')
  res.json({
    data: []
  })
})

app.post('/api/projects', (req, res) => {
  try {
    console.log('📝 Creating project:', req.body)
    const newProject = {
      id: Date.now().toString(),
      ...req.body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    res.json({
      data: newProject
    })
  } catch (error) {
    console.error('Error creating project:', error)
    res.status(500).json({ error: 'Failed to create project', details: error.message })
  }
})

app.put('/api/projects/:id', (req, res) => {
  try {
    const projectId = req.params.id
    console.log('📝 Updating project:', projectId, req.body)
    const updatedProject = {
      id: projectId,
      ...req.body,
      updatedAt: new Date().toISOString()
    }
    res.json({
      data: updatedProject
    })
  } catch (error) {
    console.error('Error updating project:', error)
    res.status(500).json({ error: 'Failed to update project', details: error.message })
  }
})

app.delete('/api/projects/:id', (req, res) => {
  try {
    const projectId = req.params.id
    console.log('🗑️ Deleting project:', projectId)
    res.json({
      data: {
        message: 'Project deleted successfully'
      }
    })
  } catch (error) {
    console.error('Error deleting project:', error)
    res.status(500).json({ error: 'Failed to delete project', details: error.message })
  }
})

// Invoices endpoints
app.get('/api/invoices', (req, res) => {
  console.log('📋 Fetching invoices')
  res.json({
    data: []
  })
})

app.post('/api/invoices', (req, res) => {
  try {
    console.log('📝 Creating invoice:', req.body)
    const newInvoice = {
      id: Date.now().toString(),
      ...req.body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    res.json({
      data: newInvoice
    })
  } catch (error) {
    console.error('Error creating invoice:', error)
    res.status(500).json({ error: 'Failed to create invoice', details: error.message })
  }
})

app.put('/api/invoices/:id', (req, res) => {
  try {
    const invoiceId = req.params.id
    console.log('📝 Updating invoice:', invoiceId, req.body)
    const updatedInvoice = {
      id: invoiceId,
      ...req.body,
      updatedAt: new Date().toISOString()
    }
    res.json({
      data: updatedInvoice
    })
  } catch (error) {
    console.error('Error updating invoice:', error)
    res.status(500).json({ error: 'Failed to update invoice', details: error.message })
  }
})

app.delete('/api/invoices/:id', (req, res) => {
  try {
    const invoiceId = req.params.id
    console.log('🗑️ Deleting invoice:', invoiceId)
    res.json({
      data: {
        message: 'Invoice deleted successfully'
      }
    })
  } catch (error) {
    console.error('Error deleting invoice:', error)
    res.status(500).json({ error: 'Failed to delete invoice', details: error.message })
  }
})

// Time entries endpoints
app.get('/api/time-entries', (req, res) => {
  console.log('📋 Fetching time entries')
  res.json({
    data: []
  })
})

app.post('/api/time-entries', (req, res) => {
  try {
    console.log('📝 Creating time entry:', req.body)
    const newTimeEntry = {
      id: Date.now().toString(),
      ...req.body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    res.json({
      data: newTimeEntry
    })
  } catch (error) {
    console.error('Error creating time entry:', error)
    res.status(500).json({ error: 'Failed to create time entry', details: error.message })
  }
})

app.put('/api/time-entries/:id', (req, res) => {
  try {
    const timeEntryId = req.params.id
    console.log('📝 Updating time entry:', timeEntryId, req.body)
    const updatedTimeEntry = {
      id: timeEntryId,
      ...req.body,
      updatedAt: new Date().toISOString()
    }
    res.json({
      data: updatedTimeEntry
    })
  } catch (error) {
    console.error('Error updating time entry:', error)
    res.status(500).json({ error: 'Failed to update time entry', details: error.message })
  }
})

app.delete('/api/time-entries/:id', (req, res) => {
  try {
    const timeEntryId = req.params.id
    console.log('🗑️ Deleting time entry:', timeEntryId)
    res.json({
      data: {
        message: 'Time entry deleted successfully'
      }
    })
  } catch (error) {
    console.error('Error deleting time entry:', error)
    res.status(500).json({ error: 'Failed to delete time entry', details: error.message })
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
