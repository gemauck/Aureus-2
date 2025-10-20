#!/usr/bin/env node

// Script to update all users to admin roles
import { prisma } from './api/_lib/prisma.js'

async function updateAllUsersToAdmin() {
  try {
    console.log('🔍 Finding all users in the system...')
    
    // Get all users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true
      }
    })
    
    console.log(`📊 Found ${users.length} users:`)
    users.forEach(user => {
      console.log(`   - ${user.name} (${user.email}) - Role: ${user.role}`)
    })
    
    console.log('')
    console.log('👑 Updating all users to admin role...')
    
    // Update all users to admin role
    const updateResult = await prisma.user.updateMany({
      where: {
        role: {
          not: 'admin'
        }
      },
      data: {
        role: 'admin'
      }
    })
    
    console.log(`✅ Updated ${updateResult.count} users to admin role`)
    
    // Verify the changes
    console.log('')
    console.log('🔍 Verifying updated users...')
    
    const updatedUsers = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    })
    
    console.log('')
    console.log('👑 All Users (Now Admin):')
    console.log('========================')
    
    updatedUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name}`)
      console.log(`   Email: ${user.email}`)
      console.log(`   Role: ${user.role}`)
      console.log(`   Status: ${user.status}`)
      console.log(`   Created: ${user.createdAt.toLocaleDateString()}`)
      console.log('')
    })
    
    console.log('🎉 All users are now admins!')
    console.log('')
    console.log('🔑 Updated Login Credentials:')
    console.log('============================')
    
    updatedUsers.forEach(user => {
      // Determine password based on email
      let password = 'admin123' // default
      if (user.email === 'garethm@abcotronics.co.za') {
        password = 'GazMauck1989*'
      } else if (user.email === 'darrenm@abcotronics.co.za' || user.email === 'David@abcotronics.co.za') {
        password = '12345'
      }
      
      console.log(`   ${user.name}:`)
      console.log(`   Email: ${user.email}`)
      console.log(`   Password: ${password}`)
      console.log('')
    })
    
    return updatedUsers
  } catch (error) {
    console.error('❌ Error updating users to admin:', error)
    throw error
  }
}

// Run the script
updateAllUsersToAdmin()
  .then((users) => {
    console.log('✅ Script completed successfully!')
    console.log(`📊 Total admin users: ${users.length}`)
    process.exit(0)
  })
  .catch((error) => {
    console.error('💥 Script failed:', error.message)
    process.exit(1)
  })
