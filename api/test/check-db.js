// Test script to check what's actually in the database
import { prisma } from '../_lib/prisma.js'

async function checkDatabase() {
  
  try {
    // Get all clients
    const clients = await prisma.client.findMany({
      where: { type: 'client' }
    })
    
    clients.forEach(client => {
    })
    
    // Get all leads
    const leads = await prisma.client.findMany({
      where: { type: 'lead' }
    })
    
    leads.forEach(lead => {
    })
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkDatabase()
