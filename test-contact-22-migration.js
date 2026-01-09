#!/usr/bin/env node
/**
 * Test script to find and migrate Contact 22
 * 
 * This script directly tests the migration logic to find Contact 22
 * in the clients table and migrate it to the ClientContact table.
 */

import { prisma } from './api/_lib/prisma.js'

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

async function testContact22Migration() {
  console.log('🧪 Testing Contact 22 Migration\n')
  console.log('='.repeat(60))
  
  try {
    // Step 1: Search for Contact 22 in clients table
    console.log('\n📋 Step 1: Searching for Contact 22 in clients table...')
    
    const clients = await prisma.client.findMany({
      select: {
        id: true,
        name: true,
        contactsJsonb: true,
        contacts: true
      }
    })
    
    console.log(`   Found ${clients.length} clients to search\n`)
    
    let contact22Found = null
    let clientWithContact22 = null
    
    // Search through all clients for Contact 22
    for (const client of clients) {
      let contacts = []
      
      // Try JSONB first, then String
      // Important: Check if JSONB is not empty array, otherwise fall back to String
      if (client.contactsJsonb && Array.isArray(client.contactsJsonb) && client.contactsJsonb.length > 0) {
        contacts = client.contactsJsonb
      } else if (client.contacts) {
        // Always try parsing the string field, even if JSONB exists but is empty
        const parsed = parseJson(client.contacts, [])
        if (Array.isArray(parsed) && parsed.length > 0) {
          contacts = parsed
        }
      }
      
      // Find Contact 22 (check by name containing "22" or exact match "Contact 22")
      // Also check ID if it contains "22"
      contact22Found = contacts.find(c => {
        const name = String(c?.name || '')
        const id = String(c?.id || '')
        return name.includes('22') || 
               name === 'Contact 22' || 
               name.toLowerCase().includes('contact 22') ||
               name.toLowerCase() === 'contact22' ||
               id.includes('22')
      })
      
      // Also check all contacts for anything with "22" to help debug
      if (contacts.length > 0) {
        const contactsWith22 = contacts.filter(c => {
          const name = String(c?.name || '').toLowerCase()
          const id = String(c?.id || '').toLowerCase()
          return name.includes('22') || id.includes('22')
        })
        if (contactsWith22.length > 0 && !contact22Found) {
          console.log(`   ℹ️  Found contacts with "22" in client "${client.name}":`, contactsWith22.map(c => c.name || c.id))
        }
      }
      
      if (contact22Found) {
        clientWithContact22 = client
        console.log(`   ✅ Found Contact 22 in client: ${client.name} (ID: ${client.id})`)
        console.log(`   Contact data:`, JSON.stringify(contact22Found, null, 2))
        break
      }
    }
    
    if (!contact22Found) {
      console.log('   ❌ Contact 22 not found in any client\'s contacts')
      
      // Show statistics about contacts in database
      console.log('\n   📊 Contact Statistics:')
      let clientsWithContacts = 0
      let totalContacts = 0
      let sampleContacts = []
      
      for (const client of clients) {
        let contacts = []
        if (client.contactsJsonb && Array.isArray(client.contactsJsonb)) {
          contacts = client.contactsJsonb
        } else if (client.contacts) {
          contacts = parseJson(client.contacts, [])
        }
        
        if (contacts.length > 0) {
          clientsWithContacts++
          totalContacts += contacts.length
          
          // Collect sample contacts
          if (sampleContacts.length < 10) {
            contacts.forEach(c => {
              if (sampleContacts.length < 10) {
                sampleContacts.push({
                  client: client.name,
                  clientId: client.id,
                  contact: c
                })
              }
            })
          }
        }
      }
      
      console.log(`   Clients with contacts: ${clientsWithContacts}/${clients.length}`)
      console.log(`   Total contacts in JSON fields: ${totalContacts}`)
      
      // Check ClientContact table
      const contactsInTable = await prisma.clientContact.count()
      console.log(`   Contacts in ClientContact table: ${contactsInTable}`)
      
      // Show sample contacts
      if (sampleContacts.length > 0) {
        console.log('\n   Sample contacts from JSON fields:')
        sampleContacts.slice(0, 5).forEach(({ client, contact }) => {
          const name = contact.name || contact.fullName || contact.contactName || 'Unnamed'
          console.log(`     - ${name} (Client: ${client})`)
        })
      }
      
      // Search more broadly for any contact with "22"
      console.log('\n   🔍 Searching for any contact containing "22" (broader search)...')
      let allContactsWith22 = []
      for (const client of clients) {
        let contacts = []
        if (client.contactsJsonb && Array.isArray(client.contactsJsonb)) {
          contacts = client.contactsJsonb
        } else if (client.contacts) {
          contacts = parseJson(client.contacts, [])
        }
        
        contacts.forEach(c => {
          const contactStr = JSON.stringify(c).toLowerCase()
          if (contactStr.includes('22')) {
            allContactsWith22.push({
              client: client.name,
              clientId: client.id,
              contact: c
            })
          }
        })
      }
      
      if (allContactsWith22.length > 0) {
        console.log(`   Found ${allContactsWith22.length} contact(s) containing "22":`)
        allContactsWith22.forEach(({ client, contact }) => {
          console.log(`     - ${JSON.stringify(contact)} (Client: ${client})`)
        })
      } else {
        console.log('   No contacts containing "22" found in any field')
      }
      
      // Search directly in database using SQL for "22" or "Contact 22"
      console.log('\n   🔍 Searching database directly with SQL for "22"...')
      try {
        const sqlResults = await prisma.$queryRaw`
          SELECT id, name, 
                 "contacts"::text as contacts_str,
                 "contactsJsonb"::text as contacts_jsonb
          FROM "Client"
          WHERE "contacts"::text LIKE '%22%' 
             OR "contactsJsonb"::text LIKE '%22%'
             OR "contacts"::text LIKE '%Contact 22%'
             OR "contactsJsonb"::text LIKE '%Contact 22%'
          LIMIT 10
        `
        
        if (sqlResults && sqlResults.length > 0) {
          console.log(`   Found ${sqlResults.length} client(s) with "22" in contacts field:`)
          sqlResults.forEach((row, idx) => {
            console.log(`\n   ${idx + 1}. Client: ${row.name} (ID: ${row.id})`)
            console.log(`      Contacts (string): ${row.contacts_str?.substring(0, 200) || 'N/A'}...`)
            console.log(`      Contacts (JSONB): ${row.contacts_jsonb?.substring(0, 200) || 'N/A'}...`)
          })
        } else {
          console.log('   No clients found with "22" in contacts fields via SQL search')
        }
      } catch (sqlError) {
        console.log(`   ⚠️  SQL search failed: ${sqlError.message}`)
      }
      
      await prisma.$disconnect()
      return
    }
    
    // Step 2: Check if Contact 22 already exists in ClientContact table
    console.log('\n📋 Step 2: Checking if Contact 22 already exists in ClientContact table...')
    
    const existingContact = await prisma.clientContact.findFirst({
      where: {
        clientId: clientWithContact22.id,
        OR: [
          { name: { contains: '22', mode: 'insensitive' } },
          { id: String(contact22Found.id || '') }
        ]
      }
    })
    
    if (existingContact) {
      console.log('   ✅ Contact 22 already exists in ClientContact table!')
      console.log(`   Contact ID: ${existingContact.id}`)
      console.log(`   Name: ${existingContact.name}`)
      console.log(`   Email: ${existingContact.email || 'N/A'}`)
      console.log(`   Phone: ${existingContact.phone || 'N/A'}`)
      console.log(`   Client: ${clientWithContact22.name}`)
      
      await prisma.$disconnect()
      return
    }
    
    console.log('   ℹ️  Contact 22 not found in ClientContact table - will migrate')
    
    // Step 3: Migrate Contact 22 to ClientContact table
    console.log('\n📋 Step 3: Migrating Contact 22 to ClientContact table...')
    
    const contactData = {
      id: contact22Found.id || undefined, // Use existing ID if provided, otherwise let Prisma generate
      clientId: clientWithContact22.id,
      name: contact22Found.name || contact22Found.fullName || contact22Found.contactName || 'Contact 22',
      email: contact22Found.email || contact22Found.emailAddress || null,
      phone: contact22Found.phone || contact22Found.telephone || contact22Found.phoneNumber || null,
      mobile: contact22Found.mobile || contact22Found.cell || contact22Found.cellphone || contact22Found.phone || null,
      role: contact22Found.role || contact22Found.jobTitle || contact22Found.position || null,
      title: contact22Found.title || contact22Found.role || contact22Found.jobTitle || contact22Found.department || null,
      isPrimary: contact22Found.isPrimary === true || contact22Found.primary === true || false,
      notes: contact22Found.notes || contact22Found.comment || ''
    }
    
    console.log('   Contact data to migrate:')
    console.log(JSON.stringify(contactData, null, 2))
    
    // Create the contact in ClientContact table
    const migratedContact = await prisma.clientContact.create({
      data: contactData
    })
    
    console.log('\n   ✅ Successfully migrated Contact 22 to ClientContact table!')
    console.log(`   New Contact ID: ${migratedContact.id}`)
    console.log(`   Name: ${migratedContact.name}`)
    console.log(`   Email: ${migratedContact.email || 'N/A'}`)
    console.log(`   Phone: ${migratedContact.phone || 'N/A'}`)
    console.log(`   Mobile: ${migratedContact.mobile || 'N/A'}`)
    console.log(`   Role: ${migratedContact.role || 'N/A'}`)
    console.log(`   Title: ${migratedContact.title || 'N/A'}`)
    console.log(`   Is Primary: ${migratedContact.isPrimary}`)
    console.log(`   Client: ${clientWithContact22.name} (${clientWithContact22.id})`)
    
    console.log('\n' + '='.repeat(60))
    console.log('✅ Migration completed successfully!')
    
  } catch (error) {
    console.error('\n❌ Error during migration:', error)
    console.error('Error details:', error.message)
    if (error.stack) {
      console.error('Stack trace:', error.stack)
    }
  } finally {
    await prisma.$disconnect()
  }
}

// Run the test
testContact22Migration()
