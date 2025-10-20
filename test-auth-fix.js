// Improved Authentication Test and Fix Script
// This script tests the authentication system and provides debugging information

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function testDatabaseConnection() {
  try {
    console.log('🔍 Testing database connection...')
    
    // Try to connect to the database
    await prisma.$connect()
    console.log('✅ Database connection successful!')
    
    // Test a simple query
    const userCount = await prisma.user.count()
    console.log(`📊 Total users in database: ${userCount}`)
    
    return true
  } catch (error) {
    console.error('❌ Database connection failed:', error.message)
    console.log('💡 This usually means:')
    console.log('   1. DATABASE_URL environment variable is not set')
    console.log('   2. Database server is not running')
    console.log('   3. Invalid database credentials')
    console.log('   4. Network connectivity issues')
    return false
  }
}

async function createTestUsers() {
  try {
    console.log('👥 Creating test users...')
    
    // Create amin@abcotronics.com user
    const aminUser = await prisma.user.upsert({
      where: { email: 'amin@abcotronics.com' },
      update: {},
      create: {
        email: 'amin@abcotronics.com',
        name: 'Amin User',
        passwordHash: await bcrypt.hash('password123', 10),
        role: 'ADMIN',
        status: 'active'
      }
    })
    console.log('✅ Amin user created/updated:', aminUser.email)
    
    // Create admin@abcotronics.com user
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@abcotronics.com' },
      update: {},
      create: {
        email: 'admin@abcotronics.com',
        name: 'Admin User',
        passwordHash: await bcrypt.hash('admin123', 10),
        role: 'ADMIN',
        status: 'active'
      }
    })
    console.log('✅ Admin user created/updated:', adminUser.email)
    
    return { aminUser, adminUser }
  } catch (error) {
    console.error('❌ Error creating test users:', error.message)
    throw error
  }
}

async function testLogin(email, password) {
  try {
    console.log(`🔐 Testing login for ${email}...`)
    
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      console.log('❌ User not found')
      return false
    }
    
    if (!user.passwordHash) {
      console.log('❌ User has no password hash')
      return false
    }
    
    const valid = await bcrypt.compare(password, user.passwordHash)
    console.log(valid ? '✅ Password is valid' : '❌ Password is invalid')
    
    return valid
  } catch (error) {
    console.error('❌ Login test failed:', error.message)
    return false
  }
}

async function main() {
  console.log('🚀 Starting authentication system test...')
  
  // Test database connection
  const dbConnected = await testDatabaseConnection()
  if (!dbConnected) {
    console.log('\n💡 To fix this issue:')
    console.log('   1. Set up a local PostgreSQL database')
    console.log('   2. Set the DATABASE_URL environment variable')
    console.log('   3. Or use the production database URL')
    console.log('\nExample:')
    console.log('   export DATABASE_URL="postgresql://username:password@localhost:5432/database_name"')
    return
  }
  
  try {
    // Create test users
    const users = await createTestUsers()
    
    // Test login functionality
    console.log('\n🔐 Testing login functionality...')
    
    const aminLogin = await testLogin('amin@abcotronics.com', 'password123')
    const adminLogin = await testLogin('admin@abcotronics.com', 'admin123')
    
    console.log('\n📋 Test Results:')
    console.log(`   Amin login: ${aminLogin ? '✅ PASS' : '❌ FAIL'}`)
    console.log(`   Admin login: ${adminLogin ? '✅ PASS' : '❌ FAIL'}`)
    
    if (aminLogin && adminLogin) {
      console.log('\n🎉 All authentication tests passed!')
      console.log('💡 You can now use these credentials:')
      console.log('   Email: amin@abcotronics.com, Password: password123')
      console.log('   Email: admin@abcotronics.com, Password: admin123')
    } else {
      console.log('\n❌ Some authentication tests failed')
    }
    
  } catch (error) {
    console.error('💥 Authentication test failed:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the test
main()
  .then(() => {
    console.log('\n✅ Authentication test completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 Authentication test failed:', error.message)
    process.exit(1)
  })
