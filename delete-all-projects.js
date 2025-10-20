#!/usr/bin/env node

/**
 * Script to delete all projects from the database
 * This will also clean up related data: tasks, invoices, time entries
 * 
 * Usage:
 *   DATABASE_URL="postgresql://user:password@host:port/database" node delete-all-projects.js
 *   or
 *   Create a .env file with DATABASE_URL and run: node delete-all-projects.js
 */

import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Check if DATABASE_URL is provided
if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required!')
    console.error('')
    console.error('Please provide the database URL in one of these ways:')
    console.error('1. Set environment variable: DATABASE_URL="postgresql://..." node delete-all-projects.js')
    console.error('2. Create a .env file with: DATABASE_URL="postgresql://..."')
    console.error('')
    console.error('Example DATABASE_URL format:')
    console.error('   postgresql://username:password@hostname:port/database')
    process.exit(1)
}

const prisma = new PrismaClient()

async function deleteAllProjects() {
    console.log('🗑️  Starting bulk project deletion...')
    
    try {
        // First, let's see what we're dealing with
        const projectCount = await prisma.project.count()
        const taskCount = await prisma.task.count()
        const invoiceCount = await prisma.invoice.count()
        const timeEntryCount = await prisma.timeEntry.count()
        
        console.log(`📊 Current database state:`)
        console.log(`   - Projects: ${projectCount}`)
        console.log(`   - Tasks: ${taskCount}`)
        console.log(`   - Invoices: ${invoiceCount}`)
        console.log(`   - Time Entries: ${timeEntryCount}`)
        
        if (projectCount === 0) {
            console.log('✅ No projects found to delete.')
            return
        }
        
        // Confirm deletion
        console.log(`\n⚠️  WARNING: This will delete ALL ${projectCount} projects and their related data!`)
        console.log('   - All tasks will be deleted')
        console.log('   - All invoices will be deleted') 
        console.log('   - All time entries will be deleted')
        console.log('\nThis action cannot be undone!')
        
        // In a script context, we'll proceed with deletion
        // In production, you might want to add a confirmation prompt
        
        console.log('\n🔄 Starting deletion process...')
        
        // Use a transaction to ensure atomicity
        await prisma.$transaction(async (tx) => {
            // Delete in order of dependencies
            console.log('   - Deleting tasks...')
            const deletedTasks = await tx.task.deleteMany({})
            console.log(`     ✅ Deleted ${deletedTasks.count} tasks`)
            
            console.log('   - Deleting invoices...')
            const deletedInvoices = await tx.invoice.deleteMany({})
            console.log(`     ✅ Deleted ${deletedInvoices.count} invoices`)
            
            console.log('   - Deleting time entries...')
            const deletedTimeEntries = await tx.timeEntry.deleteMany({})
            console.log(`     ✅ Deleted ${deletedTimeEntries.count} time entries`)
            
            console.log('   - Deleting projects...')
            const deletedProjects = await tx.project.deleteMany({})
            console.log(`     ✅ Deleted ${deletedProjects.count} projects`)
        })
        
        console.log('\n✅ All projects and related data deleted successfully!')
        
        // Verify deletion
        const remainingProjects = await prisma.project.count()
        const remainingTasks = await prisma.task.count()
        const remainingInvoices = await prisma.invoice.count()
        const remainingTimeEntries = await prisma.timeEntry.count()
        
        console.log(`\n📊 Final database state:`)
        console.log(`   - Projects: ${remainingProjects}`)
        console.log(`   - Tasks: ${remainingTasks}`)
        console.log(`   - Invoices: ${remainingInvoices}`)
        console.log(`   - Time Entries: ${remainingTimeEntries}`)
        
    } catch (error) {
        console.error('❌ Error deleting projects:', error)
        throw error
    } finally {
        await prisma.$disconnect()
    }
}

// Run the deletion
deleteAllProjects()
    .then(() => {
        console.log('\n🎉 Project deletion completed successfully!')
        process.exit(0)
    })
    .catch((error) => {
        console.error('\n💥 Project deletion failed:', error)
        process.exit(1)
    })
