#!/usr/bin/env node

import { execSync } from 'child_process'
import { spawn } from 'child_process'

console.log('🚀 Starting Abcotronics ERP Production Server...')

async function runMigrations() {
  try {
    console.log('📦 Running database migrations...')
    execSync('npx prisma migrate deploy', { 
      stdio: 'inherit',
      env: { ...process.env }
    })
    console.log('✅ Database migrations completed successfully')
  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    console.log('⚠️  Continuing with server start (migrations may need manual intervention)')
  }
}

async function startServer() {
  try {
    console.log('🌐 Starting Express server...')
    const server = spawn('node', ['server-production.js'], {
      stdio: 'inherit',
      env: { ...process.env }
    })
    
    server.on('error', (error) => {
      console.error('❌ Server start failed:', error)
      process.exit(1)
    })
    
    server.on('exit', (code) => {
      console.log(`🛑 Server exited with code ${code}`)
      process.exit(code)
    })
    
  } catch (error) {
    console.error('❌ Failed to start server:', error)
    process.exit(1)
  }
}

// Run migrations first, then start server
runMigrations().then(() => {
  startServer()
}).catch((error) => {
  console.error('❌ Startup failed:', error)
  process.exit(1)
})
