#!/usr/bin/env node
// Test script to create a ticket via the helpdesk API
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function createTestTicket() {
  try {
    // Get first user for testing
    const user = await prisma.user.findFirst({
      select: { id: true, email: true, name: true }
    })

    if (!user) {
      console.error('❌ No users found in database')
      process.exit(1)
    }

    console.log('👤 Using user:', user.email)
    console.log('')

    // Generate ticket number
    const year = new Date().getFullYear()
    const prefix = `TKT-${year}-`
    const lastTicket = await prisma.ticket.findFirst({
      where: {
        ticketNumber: {
          startsWith: prefix
        }
      },
      orderBy: {
        ticketNumber: 'desc'
      }
    })

    let sequence = 1
    if (lastTicket) {
      const lastSequence = parseInt(lastTicket.ticketNumber.split('-')[2] || '0')
      sequence = lastSequence + 1
    }
    const ticketNumber = `${prefix}${sequence.toString().padStart(4, '0')}`

    // Create test ticket
    const ticketData = {
      ticketNumber,
      title: 'Test Ticket - ' + new Date().toISOString(),
      description: 'This is a test ticket created to verify the helpdesk API is working correctly.',
      status: 'open',
      priority: 'medium',
      category: 'general',
      type: 'internal',
      createdById: user.id,
      tags: JSON.stringify(['test', 'api-test']),
      attachments: JSON.stringify([]),
      comments: JSON.stringify([]),
      activityLog: JSON.stringify([{
        action: 'created',
        userId: user.id,
        userName: user.name || user.email,
        timestamp: new Date().toISOString()
      }]),
      customFields: JSON.stringify({ test: true })
    }

    console.log('📝 Creating ticket with data:')
    console.log(JSON.stringify(ticketData, null, 2))
    console.log('')

    const ticket = await prisma.ticket.create({
      data: ticketData,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })

    console.log('✅ Ticket created successfully!')
    console.log('')
    console.log('📋 Ticket Details:')
    console.log('  ID:', ticket.id)
    console.log('  Ticket Number:', ticket.ticketNumber)
    console.log('  Title:', ticket.title)
    console.log('  Status:', ticket.status)
    console.log('  Priority:', ticket.priority)
    console.log('  Created By:', ticket.createdBy.name || ticket.createdBy.email)
    console.log('  Created At:', ticket.createdAt)
    console.log('')

    // Parse JSON fields for display
    const tags = JSON.parse(ticket.tags || '[]')
    const activityLog = JSON.parse(ticket.activityLog || '[]')
    console.log('  Tags:', tags.length > 0 ? tags.join(', ') : 'None')
    console.log('  Activity Log Entries:', activityLog.length)
    if (activityLog.length > 0) {
      console.log('    -', activityLog[0].action, 'by', activityLog[0].userName)
    }

    return ticket
  } catch (error) {
    console.error('❌ Error creating ticket:', error.message)
    if (error.code) {
      console.error('   Error code:', error.code)
    }
    if (error.meta) {
      console.error('   Error meta:', JSON.stringify(error.meta, null, 2))
    }
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

createTestTicket()
  .then(() => {
    console.log('')
    console.log('✅ Test completed successfully!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('')
    console.error('❌ Test failed:', error.message)
    process.exit(1)
  })






