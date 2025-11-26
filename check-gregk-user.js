// Check gregk@abcotronics user account
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const prisma = new PrismaClient()

async function checkGregkUser() {
  try {
    // Try different email variations
    const emailVariations = [
      'gregk@abcotronics.co.za',
      'gregk@abcotronics.com',
      'gregk@abcotronics'
    ]
    
    let user = null
    let foundEmail = null
    
    for (const email of emailVariations) {
      console.log(`🔍 Checking: ${email}`)
      user = await prisma.user.findUnique({
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
          createdAt: true,
          provider: true
        }
      })
      
      if (user) {
        foundEmail = email
        console.log(`✅ User found with email: ${email}`)
        break
      }
    }
    
    if (!user) {
      console.log('')
      console.log('❌ User not found with any of these email variations:')
      emailVariations.forEach(email => console.log(`   - ${email}`))
      console.log('')
      console.log('💡 Possible issues:')
      console.log('   1. User account does not exist')
      console.log('   2. Email address is different')
      console.log('   3. Email has different domain or format')
      console.log('')
      console.log('🔍 Searching for similar emails...')
      
      // Search for users with "gregk" in email
      const similarUsers = await prisma.user.findMany({
        where: {
          email: {
            contains: 'gregk',
            mode: 'insensitive'
          }
        },
        select: {
          email: true,
          name: true,
          status: true
        }
      })
      
      if (similarUsers.length > 0) {
        console.log('')
        console.log('📋 Found similar users:')
        similarUsers.forEach(u => {
          console.log(`   - ${u.email} (${u.name || 'No name'}) - Status: ${u.status}`)
        })
      } else {
        console.log('   No users found with "gregk" in email')
      }
      
      console.log('')
      console.log('💡 To create this user, you can:')
      console.log('   1. Use the admin panel to create a new user')
      console.log('   2. Or run: node create-user.js (after modifying the email)')
      return
    }
    
    console.log('')
    console.log('✅ User Account Details:')
    console.log('  ID:', user.id)
    console.log('  Name:', user.name || 'Not set')
    console.log('  Email:', user.email)
    console.log('  Role:', user.role)
    console.log('  Status:', user.status)
    console.log('  Provider:', user.provider)
    console.log('  Has password hash:', !!user.passwordHash)
    console.log('  Must change password:', user.mustChangePassword)
    console.log('  Created:', user.createdAt)
    console.log('  Last login:', user.lastLoginAt || 'Never')
    console.log('')
    
    // Check for issues that prevent login
    const issues = []
    
    if (!user.passwordHash) {
      issues.push('❌ No password hash - user cannot login with password')
    }
    
    if (user.status !== 'active') {
      issues.push(`❌ Account status is "${user.status}" - must be "active" to login`)
    }
    
    if (user.provider !== 'local' && !user.passwordHash) {
      issues.push(`⚠️  User uses "${user.provider}" provider - may need OAuth login instead`)
    }
    
    if (issues.length > 0) {
      console.log('⚠️  Issues Found:')
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
          updateData.provider = 'local' // Ensure provider is local
          console.log('  ✅ Password hash set')
          console.log('  ✅ Provider set to "local"')
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
            console.log('📝 Please share the temporary password with the user:')
            console.log('   Password:', tempPassword)
            console.log('   They will be required to change it on first login')
          }
        }
      } else {
        console.log('💡 To fix these issues, run:')
        console.log('   node check-gregk-user.js --fix')
        console.log('')
        console.log('⚠️  Note: This will set a temporary password if one is missing')
      }
    } else {
      console.log('✅ No issues found - user should be able to login')
      console.log('')
      console.log('💡 If login still fails, possible causes:')
      console.log('   1. Password is incorrect')
      console.log('   2. User is using wrong email address')
      console.log('   3. Browser cache/cookies issue')
      console.log('   4. Network/connectivity issue')
      console.log('')
      console.log('💡 To reset the password, use:')
      console.log('   node reset-password.js <new-password>')
      console.log('   (after modifying the email in that script)')
    }
    
    // Password hash info
    if (user.passwordHash) {
      console.log('')
      console.log('🔑 Password Hash Info:')
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

checkGregkUser()




