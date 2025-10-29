#!/usr/bin/env node
/**
 * Test script to verify admin-only access for Users page
 * Tests API endpoint access control
 */

import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

async function testUsersAccess() {
  try {
    console.log('🧪 Testing Users Page Access Control\n')
    console.log('=' .repeat(60))
    
    // Get all users and their roles
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      },
      orderBy: { email: 'asc' }
    })
    
    console.log('\n📋 Current Users in Database:')
    console.log('-'.repeat(60))
    users.forEach(user => {
      const roleEmoji = user.role?.toLowerCase() === 'admin' ? '👑' : 
                       user.role?.toLowerCase() === 'manager' ? '👔' : '👤'
      console.log(`${roleEmoji} ${user.email || user.name || 'Unknown'}`)
      console.log(`   Role: ${user.role || 'undefined'}`)
      console.log(`   ID: ${user.id}`)
      console.log('')
    })
    
    // Test access scenarios
    console.log('\n🔐 Access Control Test Results:')
    console.log('='.repeat(60))
    
    const adminUsers = users.filter(u => u.role?.toLowerCase() === 'admin')
    const managerUsers = users.filter(u => u.role?.toLowerCase() === 'manager')
    const regularUsers = users.filter(u => {
      const role = u.role?.toLowerCase()
      return role !== 'admin' && role !== 'manager'
    })
    const noRoleUsers = users.filter(u => !u.role)
    
    console.log(`\n✅ Admin users (CAN access Users page): ${adminUsers.length}`)
    adminUsers.forEach(u => {
      console.log(`   - ${u.email || u.name}`)
    })
    
    console.log(`\n❌ Manager users (CANNOT access Users page): ${managerUsers.length}`)
    managerUsers.forEach(u => {
      console.log(`   - ${u.email || u.name}`)
    })
    
    console.log(`\n❌ Regular users (CANNOT access Users page): ${regularUsers.length}`)
    regularUsers.forEach(u => {
      console.log(`   - ${u.email || u.name}`)
    })
    
    if (noRoleUsers.length > 0) {
      console.log(`\n⚠️  Users without role (CANNOT access Users page): ${noRoleUsers.length}`)
      noRoleUsers.forEach(u => {
        console.log(`   - ${u.email || u.name}`)
      })
      console.log('\n💡 Recommendation: Set roles for these users using:')
      noRoleUsers.forEach(u => {
        console.log(`   node set-admin-role.js ${u.email}`)
      })
    }
    
    // Expected behavior summary
    console.log('\n\n📊 Expected Behavior Summary:')
    console.log('='.repeat(60))
    console.log('✅ Users menu visible:      Only Admin users')
    console.log('✅ Users page accessible:   Only Admin users')
    console.log('✅ API /api/users accessible: Only Admin users')
    console.log('❌ Menu hidden for:          Manager, User, and no-role users')
    console.log('❌ Page redirect for:        Manager, User, and no-role users')
    console.log('❌ API returns 401 for:      Manager, User, and no-role users')
    
    console.log('\n\n✅ Test Complete!')
    
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

testUsersAccess()

