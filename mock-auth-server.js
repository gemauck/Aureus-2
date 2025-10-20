// Mock Authentication Server for Testing
// This provides a simple authentication system without requiring a database

import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const app = express()
const PORT = process.env.PORT || 3001

// Mock users (in a real app, these would be in a database)
const mockUsers = [
  {
    id: '1',
    email: 'amin@abcotronics.com',
    name: 'Amin User',
    passwordHash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password123
    role: 'ADMIN',
    status: 'active'
  },
  {
    id: '2',
    email: 'admin@abcotronics.com',
    name: 'Admin User',
    passwordHash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // admin123
    role: 'ADMIN',
    status: 'active'
  }
]

// JWT secret (in production, use a secure secret)
const JWT_SECRET = 'your-secret-key'

app.use(express.json())

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }
  next()
})

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }
    
    // Find user
    const user = mockUsers.find(u => u.email === email)
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    
    // Check password
    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    )
    
    res.json({ accessToken: token })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Refresh token endpoint
app.post('/api/auth/refresh', (req, res) => {
  // For simplicity, just return a new token
  const token = jwt.sign(
    { sub: '1', email: 'amin@abcotronics.com', role: 'ADMIN' },
    JWT_SECRET,
    { expiresIn: '24h' }
  )
  res.json({ accessToken: token })
})

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'mock-auth-server'
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Mock Auth Server running on port ${PORT}`)
  console.log(`📧 Available users:`)
  console.log(`   - amin@abcotronics.com / password123`)
  console.log(`   - admin@abcotronics.com / admin123`)
  console.log(`🔗 Test login: curl -X POST http://localhost:${PORT}/api/auth/login -H "Content-Type: application/json" -d '{"email":"amin@abcotronics.com","password":"password123"}'`)
})
