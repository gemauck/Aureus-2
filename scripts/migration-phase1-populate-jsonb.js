#!/usr/bin/env node
/**
 * Phase 1: Populate JSONB columns from String columns
 * 
 * This script migrates existing JSON string data to JSONB columns.
 * Original String columns remain untouched (safe for rollback).
 * 
 * Usage: node scripts/migration-phase1-populate-jsonb.js
 */

import { prisma } from '../api/_lib/prisma.js'
import fs from 'fs'
import path from 'path'

// Helper to safely parse JSON
function parseJson(str, defaultValue) {
  if (!str || str.trim() === '' || str.trim() === 'null') {
    return defaultValue
  }
  try {
    const parsed = JSON.parse(str)
    return parsed
  } catch (e) {
    console.warn(`⚠️ Failed to parse JSON: "${str.substring(0, 50)}..." - ${e.message}`)
    return defaultValue
  }
}

async function populateJsonbColumns() {
  console.log('🔄 Phase 1: Populating JSONB columns from String columns\n')
  console.log('='.repeat(60))
  
  try {
    // Get all clients with their JSON string fields
    const clients = await prisma.client.findMany({
      select: {
        id: true,
        name: true,
        contacts: true,
        followUps: true,
        comments: true,
        sites: true,
        contracts: true,
        activityLog: true,
        billingTerms: true,
        proposals: true,
        services: true
      }
    })
    
    console.log(`\n📊 Found ${clients.length} clients to migrate\n`)
    
    let migrated = 0
    let errors = 0
    const errorLog = []
    
    // Process in batches to avoid overwhelming the database
    const BATCH_SIZE = 50
    
    for (let i = 0; i < clients.length; i += BATCH_SIZE) {
      const batch = clients.slice(i, i + BATCH_SIZE)
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(clients.length / BATCH_SIZE)}...`)
      
      for (const client of batch) {
        try {
          // Parse JSON strings and prepare updates
          const updates = {
            contactsJsonb: parseJson(client.contacts, []),
            followUpsJsonb: parseJson(client.followUps, []),
            commentsJsonb: parseJson(client.comments, []),
            sitesJsonb: parseJson(client.sites, []),
            contractsJsonb: parseJson(client.contracts, []),
            activityLogJsonb: parseJson(client.activityLog, []),
            billingTermsJsonb: parseJson(client.billingTerms, {
              paymentTerms: 'Net 30',
              billingFrequency: 'Monthly',
              currency: 'ZAR',
              retainerAmount: 0,
              taxExempt: false,
              notes: ''
            }),
            proposalsJsonb: parseJson(client.proposals, []),
            servicesJsonb: parseJson(client.services, [])
          }
          
          // Update client with JSONB data using raw SQL for better control
          await prisma.$executeRaw`
            UPDATE "Client"
            SET 
              "contactsJsonb" = ${JSON.stringify(updates.contactsJsonb)}::jsonb,
              "followUpsJsonb" = ${JSON.stringify(updates.followUpsJsonb)}::jsonb,
              "commentsJsonb" = ${JSON.stringify(updates.commentsJsonb)}::jsonb,
              "sitesJsonb" = ${JSON.stringify(updates.sitesJsonb)}::jsonb,
              "contractsJsonb" = ${JSON.stringify(updates.contractsJsonb)}::jsonb,
              "activityLogJsonb" = ${JSON.stringify(updates.activityLogJsonb)}::jsonb,
              "billingTermsJsonb" = ${JSON.stringify(updates.billingTermsJsonb)}::jsonb,
              "proposalsJsonb" = ${JSON.stringify(updates.proposalsJsonb)}::jsonb,
              "servicesJsonb" = ${JSON.stringify(updates.servicesJsonb)}::jsonb
            WHERE id = ${client.id}
          `
          
          migrated++
          
          // Progress indicator
          if (migrated % 25 === 0) {
            process.stdout.write(`  ✅ Migrated ${migrated}/${clients.length} clients...\r`)
          }
          
        } catch (error) {
          errors++
          const errorInfo = {
            clientId: client.id,
            clientName: client.name,
            error: error.message
          }
          errorLog.push(errorInfo)
          console.error(`\n❌ Error migrating client ${client.id} (${client.name}):`, error.message)
        }
      }
    }
    
    console.log(`\n\n✅ Migration batch complete!`)
    console.log(`   ✅ Successfully migrated: ${migrated}`)
    console.log(`   ❌ Errors: ${errors}`)
    
    // Save error log if there were errors
    if (errors > 0) {
      const errorLogPath = path.join(process.cwd(), 'migration-errors-phase1.json')
      fs.writeFileSync(errorLogPath, JSON.stringify(errorLog, null, 2))
      console.log(`\n   📋 Error log saved to: ${errorLogPath}`)
      console.log(`   ⚠️ Review errors before proceeding!`)
    }
    
    // Verify migration
    console.log(`\n🔍 Verifying migration...`)
    await verifyJsonbMigration()
    
  } catch (error) {
    console.error(`\n❌ Fatal error during migration:`, error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

async function verifyJsonbMigration() {
  try {
    // Sample check: Compare a few records
    const sampleClients = await prisma.$queryRaw`
      SELECT 
        id,
        name,
        contacts,
        "contactsJsonb",
        comments,
        "commentsJsonb",
        "activityLog",
        "activityLogJsonb"
      FROM "Client"
      WHERE (contacts != '[]' AND contacts IS NOT NULL)
         OR (comments != '[]' AND comments IS NOT NULL)
         OR ("activityLog" != '[]' AND "activityLog" IS NOT NULL)
      LIMIT 10
    `
    
    let matches = 0
    let mismatches = 0
    
    for (const row of sampleClients) {
      try {
        // Compare contacts
        const contactsString = row.contacts || '[]'
        const contactsParsed = JSON.parse(contactsString)
        const contactsJsonb = row.contactsJsonb || []
        
        const contactsMatch = JSON.stringify(contactsParsed) === JSON.stringify(contactsJsonb)
        
        // Compare comments
        const commentsString = row.comments || '[]'
        const commentsParsed = JSON.parse(commentsString)
        const commentsJsonb = row.commentsJsonb || []
        
        const commentsMatch = JSON.stringify(commentsParsed) === JSON.stringify(commentsJsonb)
        
        // Compare activityLog
        const activityLogString = row.activityLog || '[]'
        const activityLogParsed = JSON.parse(activityLogString)
        const activityLogJsonb = row.activityLogJsonb || []
        
        const activityLogMatch = JSON.stringify(activityLogParsed) === JSON.stringify(activityLogJsonb)
        
        if (contactsMatch && commentsMatch && activityLogMatch) {
          matches++
        } else {
          mismatches++
          console.warn(`   ⚠️ Mismatch detected for client ${row.id} (${row.name})`)
          if (!contactsMatch) {
            console.warn(`      Contacts: String=${contactsString.length} chars, JSONB=${JSON.stringify(contactsJsonb).length} chars`)
          }
          if (!commentsMatch) {
            console.warn(`      Comments: String=${commentsString.length} chars, JSONB=${JSON.stringify(commentsJsonb).length} chars`)
          }
          if (!activityLogMatch) {
            console.warn(`      ActivityLog: String=${activityLogString.length} chars, JSONB=${JSON.stringify(activityLogJsonb).length} chars`)
          }
        }
      } catch (e) {
        mismatches++
        console.warn(`   ⚠️ Error verifying client ${row.id}:`, e.message)
      }
    }
    
    console.log(`\n   ✅ Verified ${matches} clients match`)
    if (mismatches > 0) {
      console.warn(`   ⚠️ Found ${mismatches} mismatches - investigate before proceeding`)
    } else {
      console.log(`   ✅ All sampled clients match perfectly!`)
    }
    
    // Count total records in JSONB columns
    const counts = await prisma.$queryRaw`
      SELECT 
        COUNT(*) FILTER (WHERE "contactsJsonb" != '[]'::jsonb) as contacts_count,
        COUNT(*) FILTER (WHERE "commentsJsonb" != '[]'::jsonb) as comments_count,
        COUNT(*) FILTER (WHERE "activityLogJsonb" != '[]'::jsonb) as activitylog_count
      FROM "Client"
    `
    
    console.log(`\n   📊 JSONB Column Statistics:`)
    console.log(`      Clients with contactsJsonb: ${counts[0].contacts_count}`)
    console.log(`      Clients with commentsJsonb: ${counts[0].comments_count}`)
    console.log(`      Clients with activityLogJsonb: ${counts[0].activitylog_count}`)
    
  } catch (error) {
    console.error(`   ❌ Verification error:`, error.message)
    throw error
  }
}

// Run migration
populateJsonbColumns().catch((error) => {
  console.error('❌ Migration failed:', error)
  process.exit(1)
})












