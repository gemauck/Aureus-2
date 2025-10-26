// Test script to check what's actually in the database
import { prisma } from '../_lib/prisma.js'

async function checkDatabase() {
  console.log('🔍 Checking database contents...')
  
  try {
    // Get all clients
    const clients = await prisma.client.findMany({
      where: { type: 'client' }
    })
    
    console.log('\n📊 CLIENTS IN DATABASE:')
    clients.forEach(client => {
      console.log('\n---Client:', client.name)
      console.log('  ID:', client.id)
      console.log('  Contacts (raw):', client.contacts)
      console.log('  Contacts (parsed):', typeof client.contacts === 'string' ? JSON.parse(client.contacts) : client.contacts)
      console.log('  Sites (raw):', client.sites)
      console.log('  Comments (raw):', client.comments)
    })
    
    // Get all leads
    const leads = await prisma.client.findMany({
      where: { type: 'lead' }
    })
    
    console.log('\n📊 LEADS IN DATABASE:')
    leads.forEach(lead => {
      console.log('\n---Lead:', lead.name)
      console.log('  ID:', lead.id)
      console.log('  Contacts (raw):', lead.contacts)
      console.log('  Contacts (parsed):', typeof lead.contacts === 'string' ? JSON.parse(lead.contacts) : lead.contacts)
      console.log('  FollowUps (raw):', lead.followUps)
      console.log('  Comments (raw):', lead.comments)
    })
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkDatabase()
