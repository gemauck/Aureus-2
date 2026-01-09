#!/usr/bin/env node
/**
 * Phase 3: Apply SQL to create normalized tables
 * Uses Prisma's executeRaw to apply SQL directly
 */

import { prisma } from '../api/_lib/prisma.js'
import fs from 'fs'
import path from 'path'

async function applyMigration() {
  console.log('🔄 Phase 3: Creating normalized tables (ClientContact, ClientComment)\n')
  console.log('='.repeat(60))
  
  try {
    // Read SQL file
    const sqlPath = path.join(process.cwd(), 'scripts', 'migration-phase3-create-tables.sql')
    const sql = fs.readFileSync(sqlPath, 'utf-8')
    
    // Parse SQL file more carefully - separate CREATE TABLE from CREATE INDEX
    // Remove comments and split into statements
    const lines = sql.split('\n')
    const statements = []
    let currentStatement = ''
    
    for (const line of lines) {
      const trimmed = line.trim()
      // Skip comments and empty lines
      if (trimmed.startsWith('--') || trimmed === '') {
        continue
      }
      
      currentStatement += line + '\n'
      
      // If line ends with semicolon, it's a complete statement
      if (trimmed.endsWith(';')) {
        const stmt = currentStatement.trim()
        if (stmt && stmt.length > 0) {
          statements.push(stmt)
        }
        currentStatement = ''
      }
    }
    
    // Add any remaining statement
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim())
    }
    
    // Separate CREATE TABLE and CREATE INDEX statements
    const tableStatements = statements.filter(s => s.toLowerCase().includes('create table'))
    const indexStatements = statements.filter(s => s.toLowerCase().includes('create index'))
    
    // Execute tables first, then indexes
    const orderedStatements = [...tableStatements, ...indexStatements]
    
    console.log(`\n📋 Executing ${orderedStatements.length} SQL statements...\n`)
    console.log(`   (${tableStatements.length} table(s), ${indexStatements.length} index(es))\n`)
    
    for (let i = 0; i < orderedStatements.length; i++) {
      const statement = orderedStatements[i].trim()
      
      if (statement.length === 0) continue
      
      try {
        const preview = statement.substring(0, 80).replace(/\n/g, ' ')
        console.log(`  ${i + 1}. Executing: ${preview}...`)
        await prisma.$executeRawUnsafe(statement)
        console.log(`     ✅ Success\n`)
      } catch (error) {
        // Check if error is because table/index already exists
        if (error.message.includes('already exists') || 
            error.code === '42P07' || // duplicate_table
            error.code === '42710' || // duplicate_object
            error.message.includes('duplicate') ||
            error.message.includes('already exist')) {
          console.log(`     ⚠️  Already exists (skipping)\n`)
        } else {
          console.error(`     ❌ Error: ${error.message}\n`)
          throw error
        }
      }
    }
    
    // Verify tables were created
    console.log('\n🔍 Verifying tables were created...\n')
    
    const tables = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('ClientContact', 'ClientComment')
      ORDER BY table_name
    `
    
    if (tables.length === 0) {
      console.warn('⚠️  No normalized tables found. They may have been created with different names.')
    } else {
      console.log(`✅ Found ${tables.length} normalized tables:\n`)
      tables.forEach(table => {
        console.log(`   • ${table.table_name}`)
      })
    }
    
    // Verify indexes
    const indexes = await prisma.$queryRaw`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND (indexname LIKE 'ClientContact%' OR indexname LIKE 'ClientComment%')
      ORDER BY indexname
    `
    
    if (indexes.length > 0) {
      console.log(`\n✅ Found ${indexes.length} indexes:\n`)
      indexes.forEach(idx => {
        console.log(`   • ${idx.indexname}`)
      })
    }
    
    console.log('\n✅ Phase 3 Step 1 complete: Normalized tables created!')
    console.log('\n📋 Next step: Run migration-phase3-populate-tables.js to migrate data')
    
  } catch (error) {
    console.error(`\n❌ Error applying migration:`, error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

applyMigration().catch(console.error)

