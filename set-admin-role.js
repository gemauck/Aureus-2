#!/usr/bin/env node
/**
 * Script to set a user's role to 'admin'
 * Usage: node set-admin-role.js <user-email>
 */

import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

async function setAdminRole(email) {
  try {
    const user = await prisma.user.update({
      where: { email },
      data: { role: 'admin' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    })
    
    console.log('✅ User role updated to admin:')
    console.log('   Email:', user.email)
    console.log('   Name:', user.name)
    console.log('   Role:', user.role)
    console.log('   ID:', user.id)
    return user
  } catch (error) {
    if (error.code === 'P2025') {
      console.error(`❌ User with email "${email}" not found`)
    } else {
      console.error('❌ Error updating user:', error.message)
    }
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Get email from command line
const email = process.argv[2]

if (!email) {
  console.log('Usage: node set-admin-role.js <user-email>')
  console.log('Example: node set-admin-role.js admin@abcotronics.co.za')
  process.exit(1)
}

setAdminRole(email)
  .then(() => {
    console.log('\n✅ Done! User should log out and log back in to see the Users menu.')
    process.exit(0)
  })
  .catch(() => {
    process.exit(1)
  })

