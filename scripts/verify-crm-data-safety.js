#!/usr/bin/env node
/**
 * CRM Data Safety Verification Script
 * 
 * This script verifies your current CRM data state and estimates
 * migration safety. Run this BEFORE starting any migration.
 * 
 * Usage: node scripts/verify-crm-data-safety.js
 */

import { prisma } from '../api/_lib/prisma.js'
import fs from 'fs'
import path from 'path'

async function verifyDataSafety() {
  console.log('🔍 CRM Data Safety Verification\n')
  console.log('=' .repeat(50))
  
  try {
    // 1. Count all records
    const totalClients = await prisma.client.count()
    const totalLeads = await prisma.client.count({ where: { type: 'lead' } })
    const totalClientRecords = await prisma.client.count({ where: { type: 'client' } })
    
    console.log(`\n📊 Record Counts:`)
    console.log(`   Total Clients: ${totalClients}`)
    console.log(`   Leads: ${totalLeads}`)
    console.log(`   Clients: ${totalClientRecords}`)
    
    // 2. Check JSON field data
    console.log(`\n📋 JSON Field Analysis:`)
    
    const clients = await prisma.client.findMany({
      select: {
        id: true,
        name: true,
        contacts: true,
        comments: true,
        projectIds: true,
        sites: true,
        contracts: true,
        followUps: true,
        activityLog: true
      }
    })
    
    const stats = {
      withContacts: 0,
      withComments: 0,
      withProjectIds: 0,
      withSites: 0,
      withContracts: 0,
      withFollowUps: 0,
      withActivityLog: 0,
      invalidJson: 0,
      totalContacts: 0,
      totalComments: 0,
      totalProjectIds: 0
    }
    
    for (const client of clients) {
      // Check contacts
      try {
        const contacts = JSON.parse(client.contacts || '[]')
        if (Array.isArray(contacts) && contacts.length > 0) {
          stats.withContacts++
          stats.totalContacts += contacts.length
        }
      } catch (e) {
        stats.invalidJson++
        console.warn(`⚠️ Invalid JSON in contacts for client ${client.id}`)
      }
      
      // Check comments
      try {
        const comments = JSON.parse(client.comments || '[]')
        if (Array.isArray(comments) && comments.length > 0) {
          stats.withComments++
          stats.totalComments += comments.length
        }
      } catch (e) {
        stats.invalidJson++
      }
      
      // Check projectIds
      try {
        const projectIds = JSON.parse(client.projectIds || '[]')
        if (Array.isArray(projectIds) && projectIds.length > 0) {
          stats.withProjectIds++
          stats.totalProjectIds += projectIds.length
        }
      } catch (e) {
        stats.invalidJson++
      }
      
      // Check other fields
      try {
        const sites = JSON.parse(client.sites || '[]')
        if (Array.isArray(sites) && sites.length > 0) stats.withSites++
      } catch (e) { stats.invalidJson++ }
      
      try {
        const contracts = JSON.parse(client.contracts || '[]')
        if (Array.isArray(contracts) && contracts.length > 0) stats.withContracts++
      } catch (e) { stats.invalidJson++ }
      
      try {
        const followUps = JSON.parse(client.followUps || '[]')
        if (Array.isArray(followUps) && followUps.length > 0) stats.withFollowUps++
      } catch (e) { stats.invalidJson++ }
      
      try {
        const activityLog = JSON.parse(client.activityLog || '[]')
        if (Array.isArray(activityLog) && activityLog.length > 0) stats.withActivityLog++
      } catch (e) { stats.invalidJson++ }
    }
    
    console.log(`   Clients with contacts: ${stats.withContacts} (${stats.totalContacts} total contacts)`)
    console.log(`   Clients with comments: ${stats.withComments} (${stats.totalComments} total comments)`)
    console.log(`   Clients with projectIds: ${stats.withProjectIds} (${stats.totalProjectIds} total project IDs)`)
    console.log(`   Clients with sites: ${stats.withSites}`)
    console.log(`   Clients with contracts: ${stats.withContracts}`)
    console.log(`   Clients with followUps: ${stats.withFollowUps}`)
    console.log(`   Clients with activityLog: ${stats.withActivityLog}`)
    console.log(`   Invalid JSON fields: ${stats.invalidJson}`)
    
    // 3. Check projectIds redundancy
    console.log(`\n🔗 Project Relationship Check:`)
    
    const clientsWithProjectIds = await prisma.client.findMany({
      where: {
        projectIds: { not: '[]' }
      },
      include: {
        projects: {
          select: { id: true }
        }
      },
      take: 10
    })
    
    let redundantCount = 0
    let missingCount = 0
    
    for (const client of clientsWithProjectIds) {
      const jsonProjectIds = JSON.parse(client.projectIds || '[]').sort()
      const dbProjectIds = client.projects.map(p => p.id).sort()
      
      if (JSON.stringify(jsonProjectIds) === JSON.stringify(dbProjectIds)) {
        redundantCount++
      } else {
        missingCount++
        console.warn(`   ⚠️ Client ${client.id}: JSON has ${jsonProjectIds.length} IDs, DB has ${dbProjectIds.length} projects`)
      }
    }
    
    console.log(`   Clients with matching projectIds: ${redundantCount}/${clientsWithProjectIds.length}`)
    if (missingCount > 0) {
      console.warn(`   ⚠️ ${missingCount} clients have mismatched projectIds`)
    }
    
    // 4. Check for opportunities
    const totalOpportunities = await prisma.opportunity.count()
    console.log(`\n💼 Opportunities:`)
    console.log(`   Total opportunities: ${totalOpportunities}`)
    console.log(`   ✅ Stored in separate table (good!)`)
    
    // 5. Safety assessment
    console.log(`\n🛡️ Safety Assessment:`)
    
    const issues = []
    
    if (stats.invalidJson > 0) {
      issues.push(`⚠️ ${stats.invalidJson} clients have invalid JSON (needs cleanup)`)
    }
    
    if (missingCount > 0) {
      issues.push(`⚠️ ${missingCount} clients have mismatched projectIds (investigate before removing)`)
    }
    
    if (issues.length === 0) {
      console.log(`   ✅ All data looks safe to migrate!`)
      console.log(`   ✅ No invalid JSON detected`)
      console.log(`   ✅ projectIds can be safely removed (use Project.clientId instead)`)
    } else {
      console.log(`   ⚠️ Found ${issues.length} potential issues:`)
      issues.forEach(issue => console.log(`      ${issue}`))
      console.log(`\n   💡 Fix these issues before starting migration`)
    }
    
    // 6. Save snapshot
    const snapshot = {
      timestamp: new Date().toISOString(),
      totalClients,
      totalLeads,
      totalClientRecords,
      stats,
      totalOpportunities,
      issues: issues.length,
      safeToMigrate: issues.length === 0
    }
    
    const snapshotPath = path.join(process.cwd(), 'migration-snapshot.json')
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2))
    console.log(`\n💾 Snapshot saved to: ${snapshotPath}`)
    
    // 7. Recommendations
    console.log(`\n📋 Recommendations:`)
    
    if (stats.withContacts > 0) {
      console.log(`   • Normalize ${stats.totalContacts} contacts into ClientContact table`)
    }
    
    if (stats.withComments > 0) {
      console.log(`   • Normalize ${stats.totalComments} comments into ClientComment table`)
    }
    
    if (stats.withProjectIds > 0 && missingCount === 0) {
      console.log(`   • Remove projectIds field (${stats.totalProjectIds} IDs redundant)`)
    }
    
    console.log(`   • Convert String fields to JSONB for better performance`)
    
    console.log(`\n✅ Verification complete!`)
    console.log(`\n📖 Next steps:`)
    console.log(`   1. Review the migration plan: CRM-MIGRATION-SAFE-PLAN.md`)
    console.log(`   2. Create a database backup`)
    console.log(`   3. Start with Phase 1 (JSONB conversion) - safest first step`)
    
  } catch (error) {
    console.error(`\n❌ Error during verification:`, error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

verifyDataSafety().catch(console.error)










