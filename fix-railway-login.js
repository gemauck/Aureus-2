#!/usr/bin/env node

// Railway Login Fix Script
// This script fixes the login issues on Railway deployment

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
})

async function fixRailwayLogin() {
  console.log('🔧 Starting Railway login fix...')
  
  try {
    // Test database connection
    console.log('🔍 Testing database connection...')
    await prisma.$connect()
    console.log('✅ Database connection successful')
    
    // Check if admin user exists
    console.log('🔍 Checking for admin user...')
    const existingAdmin = await prisma.user.findUnique({
      where: { email: 'admin@abcotronics.com' }
    })
    
    if (existingAdmin) {
      console.log('✅ Admin user exists:', {
        id: existingAdmin.id,
        email: existingAdmin.email,
        role: existingAdmin.role,
        hasPassword: !!existingAdmin.passwordHash
      })
      
      // Update password to ensure it's correct
      console.log('🔑 Updating admin password...')
      const passwordHash = await bcrypt.hash('admin123', 10)
      await prisma.user.update({
        where: { id: existingAdmin.id },
        data: { passwordHash }
      })
      console.log('✅ Admin password updated')
    } else {
      console.log('👤 Creating admin user...')
      const passwordHash = await bcrypt.hash('admin123', 10)
      
      const adminUser = await prisma.user.create({
        data: {
          email: 'admin@abcotronics.com',
          name: 'Admin User',
          passwordHash,
          role: 'ADMIN',
          status: 'active',
          provider: 'local'
        }
      })
      
      console.log('✅ Admin user created:', {
        id: adminUser.id,
        email: adminUser.email,
        role: adminUser.role
      })
    }
    
    // Test login functionality
    console.log('🧪 Testing login functionality...')
    const testUser = await prisma.user.findUnique({
      where: { email: 'admin@abcotronics.com' }
    })
    
    if (testUser && testUser.passwordHash) {
      const isValidPassword = await bcrypt.compare('admin123', testUser.passwordHash)
      console.log('🔐 Password validation test:', isValidPassword ? 'PASSED' : 'FAILED')
    }
    
    console.log('✅ Railway login fix completed successfully!')
    console.log('📧 Login credentials:')
    console.log('   Email: admin@abcotronics.com')
    console.log('   Password: admin123')
    
  } catch (error) {
    console.error('❌ Railway login fix failed:', error)
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    })
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the fix
fixRailwayLogin()
