// Diagnose login issue for a user
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const prisma = new PrismaClient()

async function diagnoseLoginIssue() {
  try {
    const email = 'garethm@abcotronics.co.za'
    console.log('🔍 Diagnosing login issue for:', email)
    console.log('='.repeat(60))
    console.log('')
    
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        passwordHash: true,
        role: true,
        mustChangePassword: true,
        lastLoginAt: true,
        createdAt: true
      }
    })
    
    if (!user) {
      console.log('❌ ISSUE FOUND: User does not exist in database')
      console.log('')
      console.log('💡 Solutions:')
      console.log('   1. Create the user via the admin panel')
      console.log('   2. Run: node create-user.js')
      console.log('   3. Check if email is correct:', email)
      return
    }
    
    console.log('✅ User exists in database')
    console.log('  ID:', user.id)
    console.log('  Name:', user.name || 'Not set')
    console.log('  Email:', user.email)
    console.log('  Role:', user.role)
    console.log('  Status:', user.status)
    console.log('  Created:', user.createdAt)
    console.log('  Last login:', user.lastLoginAt || 'Never')
    console.log('')
    
    // Check for issues
    const issues = []
    const solutions = []
    
    if (!user.passwordHash) {
      issues.push('❌ No password hash - user cannot login with password')
      solutions.push('   - Set a password using the admin panel')
      solutions.push('   - Or run: node reset-password.js')
    } else {
      console.log('✅ Password hash exists')
      console.log('  Hash length:', user.passwordHash.length)
      console.log('  Hash format:', user.passwordHash.substring(0, 7))
      console.log('  Valid bcrypt format:', /^\$2[ayb]\$.{56}$/.test(user.passwordHash) ? 'Yes' : 'No')
    }
    
    if (user.status !== 'active') {
      issues.push(`❌ Account status is "${user.status}" - must be "active" to login`)
      solutions.push(`   - Update user status to "active"`)
      solutions.push(`   - Run: UPDATE "User" SET status = 'active' WHERE email = '${email}';`)
    } else {
      console.log('✅ Account status is active')
    }
    
    if (user.mustChangePassword) {
      console.log('⚠️  User must change password on next login')
    }
    
    console.log('')
    
    if (issues.length > 0) {
      console.log('🚨 ISSUES FOUND:')
      issues.forEach(issue => console.log('  ' + issue))
      console.log('')
      console.log('💡 SOLUTIONS:')
      solutions.forEach(solution => console.log(solution))
      console.log('')
    } else {
      console.log('✅ No obvious issues found with user account')
      console.log('')
      console.log('💡 The login failure is likely due to:')
      console.log('   1. Incorrect password')
      console.log('   2. Password hash mismatch')
      console.log('')
      console.log('   To reset the password:')
      console.log('   - Use the admin panel')
      console.log('   - Or run: node reset-password.js')
    }
    
    // List all users for reference
    console.log('')
    console.log('📋 All users in database:')
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        passwordHash: true
      },
      orderBy: { createdAt: 'desc' }
    })
    
    allUsers.forEach(u => {
      const hasPassword = !!u.passwordHash
      const isActive = u.status === 'active'
      const canLogin = hasPassword && isActive
      console.log(`  - ${u.email} (${u.role}) - Status: ${u.status} - Password: ${hasPassword ? 'Yes' : 'No'} - Can login: ${canLogin ? 'Yes' : 'No'}`)
    })
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

diagnoseLoginIssue()

