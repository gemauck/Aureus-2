// Check and optionally fix user account
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const prisma = new PrismaClient()

async function checkAndFixUser() {
  try {
    const email = 'garethm@abcotronics.co.za'
    console.log('🔍 Checking user:', email)
    console.log('')
    
    const user = await prisma.user.findUnique({
      where: { email },
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
      console.log('❌ User not found in database')
      console.log('')
      console.log('💡 To create this user, you can:')
      console.log('   1. Use the admin panel to create a new user')
      console.log('   2. Or run: node create-user.js')
      return
    }
    
    console.log('✅ User found:')
    console.log('  ID:', user.id)
    console.log('  Name:', user.name || 'Not set')
    console.log('  Email:', user.email)
    console.log('  Role:', user.role)
    console.log('  Status:', user.status)
    console.log('  Has password hash:', !!user.passwordHash)
    console.log('  Must change password:', user.mustChangePassword)
    console.log('  Created:', user.createdAt)
    console.log('  Last login:', user.lastLoginAt || 'Never')
    console.log('')
    
    // Check for issues
    const issues = []
    
    if (!user.passwordHash) {
      issues.push('❌ No password hash - user cannot login with password')
    }
    
    if (user.status !== 'active') {
      issues.push(`❌ Account status is "${user.status}" - must be "active" to login`)
    }
    
    if (issues.length > 0) {
      console.log('⚠️  Issues found:')
      issues.forEach(issue => console.log('  ', issue))
      console.log('')
      
      // Check if we should fix the issues
      const shouldFix = process.argv.includes('--fix')
      
      if (shouldFix) {
        console.log('🔧 Fixing issues...')
        const updateData = {}
        
        if (!user.passwordHash) {
          // Set a temporary password
          const tempPassword = 'TempPass123!' // Change this to a secure password
          const passwordHash = await bcrypt.hash(tempPassword, 10)
          updateData.passwordHash = passwordHash
          updateData.mustChangePassword = true
          console.log('  ✅ Password hash set')
          console.log('  ⚠️  Temporary password:', tempPassword)
          console.log('  ⚠️  User must change password on next login')
        }
        
        if (user.status !== 'active') {
          updateData.status = 'active'
          console.log('  ✅ Status set to "active"')
        }
        
        if (Object.keys(updateData).length > 0) {
          await prisma.user.update({
            where: { id: user.id },
            data: updateData
          })
          console.log('')
          console.log('✅ User account fixed!')
          if (updateData.passwordHash) {
            console.log('')
            console.log('📝 Please share the temporary password with the user')
            console.log('   They will be required to change it on first login')
          }
        }
      } else {
        console.log('💡 To fix these issues, run:')
        console.log('   node check-and-fix-user.js --fix')
        console.log('')
        console.log('⚠️  Note: This will set a temporary password if one is missing')
      }
    } else {
      console.log('✅ No issues found - user should be able to login')
      console.log('')
      console.log('💡 If login still fails, the password might be incorrect')
      console.log('   To reset the password, use the password reset feature in the app')
    }
    
    // Test password if hash exists
    if (user.passwordHash) {
      console.log('')
      console.log('🔑 Password hash info:')
      console.log('  Hash length:', user.passwordHash.length)
      console.log('  Hash prefix:', user.passwordHash.substring(0, 20) + '...')
      console.log('  Hash format valid:', !!user.passwordHash.match(/^\$2[ayb]\$.{56}$/))
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

checkAndFixUser()

