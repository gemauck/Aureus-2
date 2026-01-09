#!/usr/bin/env node
/**
 * Phase 3: Populate Normalized Tables from JSON Data
 * 
 * This script migrates contacts and comments from JSON fields to normalized tables.
 * Original JSON data remains untouched (safe for rollback).
 * 
 * Usage: node scripts/migration-phase3-populate-tables.js
 */

import { prisma } from '../api/_lib/prisma.js'
import { Prisma } from '@prisma/client'
import fs from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'

// Helper to generate CUID-like ID (simple version for migration)
function generateId() {
  return 'mig' + randomBytes(12).toString('hex')
}

// Helper to safely parse JSON
function parseJson(str, defaultValue) {
  if (!str || str.trim() === '' || str.trim() === 'null') {
    return defaultValue
  }
  try {
    return JSON.parse(str)
  } catch (e) {
    return defaultValue
  }
}

async function populateNormalizedTables() {
  console.log('🔄 Phase 3: Populating normalized tables from JSON data\n')
  console.log('='.repeat(60))
  
  try {
    // Get all clients with their JSON data
    const clients = await prisma.client.findMany({
      select: {
        id: true,
        name: true,
        contactsJsonb: true,
        contacts: true,
        commentsJsonb: true,
        comments: true
      }
    })
    
    console.log(`\n📊 Found ${clients.length} clients to process\n`)
    
    let contactsMigrated = 0
    let commentsMigrated = 0
    let contactErrors = 0
    let commentErrors = 0
    const errorLog = []
    
    // Process in batches
    const BATCH_SIZE = 50
    
    for (let i = 0; i < clients.length; i += BATCH_SIZE) {
      const batch = clients.slice(i, i + BATCH_SIZE)
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(clients.length / BATCH_SIZE)}...`)
      
      for (const client of batch) {
        try {
          // Migrate Contacts
          const contactsData = client.contactsJsonb || 
                              (client.contacts ? parseJson(client.contacts, []) : [])
          
          if (Array.isArray(contactsData) && contactsData.length > 0) {
            const contactRecords = contactsData.map((contact, index) => {
              // Handle various contact formats
              const name = contact.name || contact.fullName || contact.contactName || 'Unknown Contact'
              const email = contact.email || contact.emailAddress || null
              const phone = contact.phone || contact.telephone || contact.phoneNumber || null
              const mobile = contact.mobile || contact.cell || contact.cellphone || null
              const role = contact.role || contact.jobTitle || contact.position || contact.title || null
              const isPrimary = index === 0 || contact.isPrimary === true || contact.primary === true || false
              const notes = contact.notes || contact.comment || ''
              
              return {
                id: generateId(),
                clientId: client.id,
                name: String(name).trim(),
                email: email ? String(email).trim() : null,
                phone: phone ? String(phone).trim() : null,
                mobile: mobile ? String(mobile).trim() : null,
                role: role ? String(role).trim() : null,
                title: role ? String(role).trim() : null, // Same as role for compatibility
                isPrimary,
                notes: notes ? String(notes).trim() : ''
              }
            }).filter(c => c.name && c.name !== 'Unknown Contact') // Filter out invalid contacts
            
            if (contactRecords.length > 0) {
              try {
                await prisma.clientContact.createMany({
                  data: contactRecords,
                  skipDuplicates: true
                })
                contactsMigrated += contactRecords.length
              } catch (error) {
                contactErrors++
                errorLog.push({
                  type: 'contact',
                  clientId: client.id,
                  clientName: client.name,
                  error: error.message,
                  contactsCount: contactRecords.length
                })
                console.warn(`  ⚠️ Error migrating contacts for client ${client.id}: ${error.message}`)
              }
            }
          }
          
          // Migrate Comments
          const commentsData = client.commentsJsonb || 
                              (client.comments ? parseJson(client.comments, []) : [])
          
          if (Array.isArray(commentsData) && commentsData.length > 0) {
            // Validate authorIds first - get list of valid user IDs
            const validUserIds = new Set()
            try {
              const users = await prisma.user.findMany({ select: { id: true } })
              users.forEach(u => validUserIds.add(u.id))
            } catch (e) {
              console.warn(`  ⚠️ Could not validate user IDs: ${e.message}`)
            }
            
            const commentRecords = commentsData.map((comment) => {
              // Handle various comment formats
              const text = comment.text || comment.comment || comment.message || comment.content || String(comment)
              const author = comment.author || comment.createdBy || comment.user || comment.name || 'Unknown'
              const userName = comment.userName || comment.userEmail || comment.email || comment.authorEmail || null
              let authorId = comment.authorId || comment.userId || comment.createdById || null
              
              // Validate authorId exists in User table, set to null if not
              if (authorId && !validUserIds.has(authorId)) {
                authorId = null
              }
              
              const createdAt = comment.createdAt || comment.date || comment.timestamp || new Date()
              
              return {
                id: generateId(),
                clientId: client.id,
                text: String(text).trim(),
                author: String(author).trim(),
                userName: userName ? String(userName).trim() : null,
                authorId: authorId || null,
                createdAt: createdAt instanceof Date ? createdAt : new Date(createdAt)
              }
            }).filter(c => c.text && c.text.trim().length > 0) // Filter out empty comments
            
            if (commentRecords.length > 0) {
              try {
                // Create comments one by one to handle createdAt properly
                for (const comment of commentRecords) {
                  await prisma.clientComment.create({
                    data: comment
                  })
                }
                commentsMigrated += commentRecords.length
              } catch (error) {
                commentErrors++
                errorLog.push({
                  type: 'comment',
                  clientId: client.id,
                  clientName: client.name,
                  error: error.message,
                  commentsCount: commentRecords.length
                })
                console.warn(`  ⚠️ Error migrating comments for client ${client.id}: ${error.message}`)
              }
            }
          }
          
          // Progress indicator
          const totalProcessed = contactsMigrated + commentsMigrated
          if (totalProcessed % 50 === 0 && totalProcessed > 0) {
            process.stdout.write(`  ✅ Migrated ${contactsMigrated} contacts, ${commentsMigrated} comments...\r`)
          }
          
        } catch (error) {
          console.error(`  ❌ Error processing client ${client.id}:`, error.message)
          errorLog.push({
            type: 'client',
            clientId: client.id,
            clientName: client.name,
            error: error.message
          })
        }
      }
    }
    
    console.log(`\n\n✅ Migration complete!`)
    console.log(`   ✅ Contacts migrated: ${contactsMigrated}`)
    console.log(`   ✅ Comments migrated: ${commentsMigrated}`)
    console.log(`   ❌ Contact errors: ${contactErrors}`)
    console.log(`   ❌ Comment errors: ${commentErrors}`)
    
    // Save error log if there were errors
    if (errorLog.length > 0) {
      const errorLogPath = path.join(process.cwd(), 'migration-errors-phase3.json')
      fs.writeFileSync(errorLogPath, JSON.stringify(errorLog, null, 2))
      console.log(`\n   📋 Error log saved to: ${errorLogPath}`)
    }
    
    // Verify migration
    console.log(`\n🔍 Verifying migration...`)
    await verifyNormalizedTables()
    
  } catch (error) {
    console.error(`\n❌ Fatal error during migration:`, error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

async function verifyNormalizedTables() {
  try {
    // Count contacts and comments
    const contactCount = await prisma.clientContact.count()
    const commentCount = await prisma.clientComment.count()
    
    console.log(`\n   📊 Normalized Table Statistics:`)
    console.log(`      Total contacts in ClientContact table: ${contactCount}`)
    console.log(`      Total comments in ClientComment table: ${commentCount}`)
    
    // Sample check: Verify a few clients
    const clientsWithContacts = await prisma.client.findMany({
      where: {
        OR: [
          { contactsJsonb: { not: Prisma.JsonNull } },
          { contacts: { not: '[]' } }
        ]
      },
      include: {
        clientContacts: {
          select: { id: true, name: true }
        }
      },
      take: 5
    })
    
    console.log(`\n   🔍 Sample Verification:`)
    for (const client of clientsWithContacts) {
      const jsonContacts = client.contactsJsonb || parseJson(client.contacts || '[]', [])
      const dbContacts = client.clientContacts
      
      const jsonCount = Array.isArray(jsonContacts) ? jsonContacts.length : 0
      const dbCount = dbContacts.length
      
      if (jsonCount === dbCount) {
        console.log(`      ✅ Client ${client.name}: ${dbCount} contacts match`)
      } else {
        console.warn(`      ⚠️ Client ${client.name}: JSON has ${jsonCount}, DB has ${dbCount}`)
      }
    }
    
    // Check clients with comments
    const clientsWithComments = await prisma.client.findMany({
      where: {
        OR: [
          { commentsJsonb: { not: Prisma.JsonNull } },
          { comments: { not: '[]' } }
        ]
      },
      include: {
        clientComments: {
          select: { id: true, text: true }
        }
      },
      take: 5
    })
    
    for (const client of clientsWithComments) {
      const jsonComments = client.commentsJsonb || parseJson(client.comments || '[]', [])
      const dbComments = client.clientComments
      
      const jsonCount = Array.isArray(jsonComments) ? jsonComments.length : 0
      const dbCount = dbComments.length
      
      if (jsonCount === dbCount) {
        console.log(`      ✅ Client ${client.name}: ${dbCount} comments match`)
      } else {
        console.warn(`      ⚠️ Client ${client.name}: JSON has ${jsonCount}, DB has ${dbCount}`)
      }
    }
    
    console.log(`\n   ✅ Verification complete!`)
    
  } catch (error) {
    console.error(`   ❌ Verification error:`, error.message)
    throw error
  }
}

// Run migration
populateNormalizedTables().catch((error) => {
  console.error('❌ Migration failed:', error)
  process.exit(1)
})

