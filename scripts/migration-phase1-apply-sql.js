#!/usr/bin/env node
/**
 * Phase 1: Apply SQL to add JSONB columns
 * Uses Prisma's executeRaw to apply SQL directly
 */

import { prisma } from '../api/_lib/prisma.js'
import fs from 'fs'
import path from 'path'

async function applyMigration() {
  console.log('🔄 Phase 1: Adding JSONB columns to Client table\n')
  console.log('='.repeat(60))
  
  try {
    // Read SQL file
    const sqlPath = path.join(process.cwd(), 'scripts', 'migration-phase1-add-jsonb-columns.sql')
    const sql = fs.readFileSync(sqlPath, 'utf-8')
    
    // Split SQL into individual statements (semicolon separated)
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => {
        const trimmed = s.trim()
        return trimmed.length > 0 && 
               !trimmed.startsWith('--') && 
               !trimmed.toLowerCase().startsWith('select') &&
               !trimmed.toLowerCase().startsWith('step')
      })
    
    console.log(`\n📋 Executing ${statements.length} SQL statements...\n`)
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim()
      
      if (statement.length === 0) continue
      
      try {
        const preview = statement.substring(0, 80).replace(/\n/g, ' ')
        console.log(`  ${i + 1}. Executing: ${preview}...`)
        await prisma.$executeRawUnsafe(statement)
        console.log(`     ✅ Success\n`)
      } catch (error) {
        // Check if error is because column/index already exists
        if (error.message.includes('already exists') || 
            error.code === '42710' || 
            error.code === '42P07' ||
            error.message.includes('duplicate') ||
            error.message.includes('already exist')) {
          console.log(`     ⚠️  Already exists (skipping)\n`)
        } else {
          console.error(`     ❌ Error: ${error.message}\n`)
          throw error
        }
      }
    }
    
    // Verify columns were added
    console.log('\n🔍 Verifying columns were added...\n')
    
    const columns = await prisma.$queryRaw`
      SELECT 
        column_name, 
        data_type, 
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'Client' 
        AND column_name LIKE '%Jsonb'
      ORDER BY column_name
    `
    
    if (columns.length === 0) {
      console.warn('⚠️  No JSONB columns found. They may have been created with different names.')
    } else {
      console.log(`✅ Found ${columns.length} JSONB columns:\n`)
      columns.forEach(col => {
        console.log(`   • ${col.column_name} (${col.data_type})`)
      })
    }
    
    console.log('\n✅ Phase 1 Step 1 complete: JSONB columns added!')
    console.log('\n📋 Next step: Run migration-phase1-populate-jsonb.js to populate data')
    
  } catch (error) {
    console.error(`\n❌ Error applying migration:`, error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

applyMigration().catch(console.error)

