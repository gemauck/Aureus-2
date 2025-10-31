#!/usr/bin/env node
// Script to check user login status in database
import { prisma } from './api/_lib/prisma.js'
import bcrypt from 'bcryptjs'

const emails = ['garethm@abcotronics.co.za', 'gemauck@gmail.com']

async function checkUsers() {
  try {
    console.log('🔍 Checking users in database...\n')
    
    for (const email of emails) {
      console.log(`📧 Checking: ${email}`)
      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          passwordHash: true,
          provider: true,
          mustChangePassword: true
        }
      })
      
      if (!user) {
        console.log('  ❌ User not found in database\n')
        continue
      }
      
      console.log('  ✅ User found:')
      console.log(`     ID: ${user.id}`)
      console.log(`     Name: ${user.name || 'N/A'}`)
      console.log(`     Role: ${user.role}`)
      console.log(`     Status: ${user.status}`)
      console.log(`     Provider: ${user.provider}`)
      console.log(`     Has Password Hash: ${!!user.passwordHash}`)
      console.log(`     Must Change Password: ${user.mustChangePassword}`)
      
      if (!user.passwordHash) {
        console.log('  ⚠️  WARNING: User has no password hash! Cannot login with password.')
      } else {
        console.log('  ✅ Password hash exists (length: ' + user.passwordHash.length + ')')
      }
      
      if (user.status !== 'active') {
        console.log(`  ⚠️  WARNING: User status is "${user.status}", not "active"!`)
      }
      
      console.log('')
    }
    
    await prisma.$disconnect()
  } catch (error) {
    console.error('❌ Error:', error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

checkUsers()

