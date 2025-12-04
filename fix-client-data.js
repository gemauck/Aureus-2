#!/usr/bin/env node
/**
 * Script to diagnose and fix corrupted client data
 * Usage: node fix-client-data.js <clientId> [action]
 * Actions: diagnose, cleanup-orphaned-memberships, fix-json-fields, full-fix
 */

import { prisma } from './api/_lib/prisma.js'

const clientId = process.argv[2]
const action = process.argv[3] || 'full-fix'

if (!clientId) {
  console.error('❌ Usage: node fix-client-data.js <clientId> [action]')
  console.error('   Actions: diagnose, cleanup-orphaned-memberships, fix-json-fields, full-fix')
  process.exit(1)
}

const validActions = ['diagnose', 'cleanup-orphaned-memberships', 'fix-json-fields', 'full-fix']
if (!validActions.includes(action)) {
  console.error(`❌ Invalid action: ${action}`)
  console.error(`   Valid actions: ${validActions.join(', ')}`)
  process.exit(1)
}

async function diagnose(clientId) {
  console.log(`\n🔍 Diagnosing client: ${clientId}\n`)
  
  try {
    // Check basic client
    const clientBasic = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, type: true, status: true }
    })
    
    if (!clientBasic) {
      console.error(`❌ Client ${clientId} not found`)
      return false
    }

    console.log(`✅ Client found: ${clientBasic.name} (${clientBasic.type}, ${clientBasic.status})`)

    // Check for orphaned group memberships
    const allMemberships = await prisma.clientCompanyGroup.findMany({
      where: { clientId },
      include: {
        group: {
          select: { id: true, name: true }
        }
      }
    })

    const orphanedMemberships = allMemberships.filter(m => !m.group)
    console.log(`\n📊 Group Memberships:`)
    console.log(`   Total: ${allMemberships.length}`)
    console.log(`   Valid: ${allMemberships.length - orphanedMemberships.length}`)
    console.log(`   Orphaned: ${orphanedMemberships.length}`)

    if (orphanedMemberships.length > 0) {
      console.log(`\n⚠️  Orphaned Memberships:`)
      orphanedMemberships.forEach(m => {
        console.log(`   - Membership ID: ${m.id}, Group ID: ${m.groupId} (group does not exist)`)
      })
    }

    // Check JSON fields
    const clientJson = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        contacts: true,
        sites: true,
        comments: true,
        followUps: true,
        activityLog: true,
        billingTerms: true,
        services: true
      }
    })

    const jsonFields = ['contacts', 'sites', 'comments', 'followUps', 'activityLog', 'billingTerms', 'services']
    const invalidFields = []

    console.log(`\n📋 JSON Fields:`)
    for (const field of jsonFields) {
      const value = clientJson?.[field]
      if (value && typeof value === 'string') {
        try {
          const parsed = JSON.parse(value)
          const length = Array.isArray(parsed) ? parsed.length : (typeof parsed === 'object' ? Object.keys(parsed).length : 0)
          console.log(`   ✅ ${field}: valid (${length} items)`)
        } catch (parseError) {
          console.log(`   ❌ ${field}: invalid JSON - ${parseError.message}`)
          invalidFields.push({ field, error: parseError.message })
        }
      } else if (value === null || value === undefined) {
        console.log(`   ⚠️  ${field}: null/undefined`)
        invalidFields.push({ field, error: 'null or undefined' })
      } else {
        console.log(`   ✅ ${field}: valid (not a string)`)
      }
    }

    return {
      hasOrphanedMemberships: orphanedMemberships.length > 0,
      orphanedCount: orphanedMemberships.length,
      hasInvalidJson: invalidFields.length > 0,
      invalidFields
    }
  } catch (error) {
    console.error(`❌ Diagnosis failed:`, error.message)
    console.error(`   Code: ${error.code}`)
    console.error(`   Stack: ${error.stack?.substring(0, 500)}`)
    return null
  }
}

async function cleanupOrphanedMemberships(clientId) {
  console.log(`\n🧹 Cleaning up orphaned group memberships...\n`)
  
  try {
    const allMemberships = await prisma.clientCompanyGroup.findMany({
      where: { clientId },
      include: {
        group: {
          select: { id: true }
        }
      }
    })

    const orphanedMemberships = allMemberships.filter(m => !m.group)
    
    if (orphanedMemberships.length === 0) {
      console.log(`✅ No orphaned memberships found`)
      return { deleted: 0 }
    }

    console.log(`Found ${orphanedMemberships.length} orphaned memberships to delete`)
    
    const deletedIds = []
    for (const membership of orphanedMemberships) {
      try {
        await prisma.clientCompanyGroup.delete({
          where: { id: membership.id }
        })
        deletedIds.push(membership.id)
        console.log(`   ✅ Deleted membership ${membership.id} (groupId: ${membership.groupId})`)
      } catch (deleteError) {
        console.error(`   ❌ Failed to delete membership ${membership.id}:`, deleteError.message)
      }
    }

    console.log(`\n✅ Deleted ${deletedIds.length} orphaned group memberships`)
    return { deleted: deletedIds.length, deletedIds }
  } catch (error) {
    console.error(`❌ Cleanup failed:`, error.message)
    return { deleted: 0, error: error.message }
  }
}

async function fixJsonFields(clientId) {
  console.log(`\n🔧 Fixing invalid JSON fields...\n`)
  
  try {
    const clientJson = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        contacts: true,
        sites: true,
        comments: true,
        followUps: true,
        activityLog: true,
        billingTerms: true,
        services: true
      }
    })

    const jsonFields = ['contacts', 'sites', 'comments', 'followUps', 'activityLog', 'services']
    const updateData = {}
    const fixedFields = []

    for (const field of jsonFields) {
      const value = clientJson?.[field]
      if (value && typeof value === 'string') {
        try {
          JSON.parse(value)
          // Valid JSON, no fix needed
        } catch (parseError) {
          // Invalid JSON, set to empty array
          updateData[field] = '[]'
          fixedFields.push(field)
          console.log(`   🔧 Fixing ${field}: invalid JSON → empty array`)
        }
      } else if (value === null || value === undefined) {
        updateData[field] = '[]'
        fixedFields.push(field)
        console.log(`   🔧 Fixing ${field}: null → empty array`)
      }
    }

    // Handle billingTerms separately (object, not array)
    if (clientJson?.billingTerms) {
      const value = clientJson.billingTerms
      if (typeof value === 'string') {
        try {
          JSON.parse(value)
        } catch (parseError) {
          updateData.billingTerms = JSON.stringify({
            paymentTerms: 'Net 30',
            billingFrequency: 'Monthly',
            currency: 'ZAR',
            retainerAmount: 0,
            taxExempt: false,
            notes: ''
          })
          fixedFields.push('billingTerms')
          console.log(`   🔧 Fixing billingTerms: invalid JSON → default object`)
        }
      } else if (value === null || value === undefined) {
        updateData.billingTerms = JSON.stringify({
          paymentTerms: 'Net 30',
          billingFrequency: 'Monthly',
          currency: 'ZAR',
          retainerAmount: 0,
          taxExempt: false,
          notes: ''
        })
        fixedFields.push('billingTerms')
        console.log(`   🔧 Fixing billingTerms: null → default object`)
      }
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.client.update({
        where: { id: clientId },
        data: updateData
      })

      console.log(`\n✅ Fixed ${fixedFields.length} invalid JSON fields: ${fixedFields.join(', ')}`)
      return { fixed: fixedFields.length, fixedFields }
    } else {
      console.log(`\n✅ No invalid JSON fields found`)
      return { fixed: 0, fixedFields: [] }
    }
  } catch (error) {
    console.error(`❌ Fix JSON fields failed:`, error.message)
    return { fixed: 0, error: error.message }
  }
}

async function verify(clientId) {
  console.log(`\n✅ Verifying fix...\n`)
  
  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        groupMemberships: {
          include: {
            group: {
              select: {
                id: true,
                name: true,
                type: true,
                industry: true
              }
            }
          }
        }
      }
    })

    if (client) {
      console.log(`✅ Client can now be queried successfully`)
      console.log(`   Name: ${client.name}`)
      console.log(`   Group Memberships: ${client.groupMemberships?.length || 0}`)
      return true
    } else {
      console.log(`❌ Client not found`)
      return false
    }
  } catch (error) {
    console.error(`❌ Verification failed:`, error.message)
    return false
  }
}

async function main() {
  try {
    console.log(`\n🚀 Client Data Fix Script`)
    console.log(`   Client ID: ${clientId}`)
    console.log(`   Action: ${action}\n`)

    if (action === 'diagnose' || action === 'full-fix') {
      const diagnosis = await diagnose(clientId)
      if (!diagnosis && action === 'diagnose') {
        process.exit(1)
      }
      if (action === 'diagnose') {
        process.exit(0)
      }
    }

    if (action === 'cleanup-orphaned-memberships' || action === 'full-fix') {
      await cleanupOrphanedMemberships(clientId)
    }

    if (action === 'fix-json-fields' || action === 'full-fix') {
      await fixJsonFields(clientId)
    }

    if (action === 'full-fix') {
      const verified = await verify(clientId)
      if (verified) {
        console.log(`\n🎉 Full fix completed successfully!\n`)
      } else {
        console.log(`\n⚠️  Fix completed but verification failed. Client may still have issues.\n`)
        process.exit(1)
      }
    }

    await prisma.$disconnect()
  } catch (error) {
    console.error(`\n❌ Script failed:`, error)
    console.error(`   Stack:`, error.stack)
    await prisma.$disconnect()
    process.exit(1)
  }
}

main()

