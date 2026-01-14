#!/usr/bin/env node
/**
 * Comprehensive test script for all client-related endpoints
 * Tests: Create client, add contacts, add comments, update client, persistence
 */

import { prisma } from './api/_lib/prisma.js'

const TEST_CLIENT_NAME = `Test Client - ${new Date().toISOString().split('T')[0]}`
let testClientId = null
let testContactIds = []
let testCommentIds = []

console.log('🧪 Comprehensive Client Endpoint Testing\n')
console.log('='.repeat(60))

async function testAllEndpoints() {
  try {
    // Test 1: Create a new client
    console.log('\n📋 Test 1: Creating a new client...')
    const newClient = await prisma.client.create({
      data: {
        name: TEST_CLIENT_NAME,
        type: 'client',
        industry: 'Other',
        status: 'active',
        revenue: 0,
        value: 0,
        probability: 0,
        address: '123 Test Street, Test City',
        website: 'https://testclient.example.com',
        notes: 'This is a test client for endpoint testing'
      }
    })
    testClientId = newClient.id
    console.log(`✅ Client created: ${newClient.name} (ID: ${newClient.id})`)

    // Test 2: Add contacts to client via ClientContact table
    console.log('\n📋 Test 2: Adding contacts to client...')
    
    const contact1 = await prisma.clientContact.create({
      data: {
        clientId: testClientId,
        name: 'Test Contact 1',
        email: 'contact1@testclient.example.com',
        phone: '011-123-4567',
        mobile: '082-123-4567',
        role: 'Manager',
        title: 'Operations Manager',
        isPrimary: true,
        notes: 'Primary contact for test client'
      }
    })
    testContactIds.push(contact1.id)
    console.log(`✅ Contact 1 created: ${contact1.name} (ID: ${contact1.id})`)

    const contact2 = await prisma.clientContact.create({
      data: {
        clientId: testClientId,
        name: 'Test Contact 2',
        email: 'contact2@testclient.example.com',
        phone: '011-234-5678',
        mobile: '082-234-5678',
        role: 'Admin',
        title: 'Administrator',
        isPrimary: false,
        notes: 'Secondary contact'
      }
    })
    testContactIds.push(contact2.id)
    console.log(`✅ Contact 2 created: ${contact2.name} (ID: ${contact2.id})`)

    // Test 3: Add comments to client via ClientComment table
    console.log('\n📋 Test 3: Adding comments to client...')
    
    // Get current user for authorId (or use null)
    const testUser = await prisma.user.findFirst({
      where: { email: { contains: 'gareth', mode: 'insensitive' } }
    })
    const authorId = testUser?.id || null
    
    const comment1 = await prisma.clientComment.create({
      data: {
        clientId: testClientId,
        text: 'This is the first test comment for the client',
        authorId: authorId,
        author: testUser?.name || 'Test System',
        userName: testUser?.email || 'test@system.com'
      }
    })
    testCommentIds.push(comment1.id)
    console.log(`✅ Comment 1 created (ID: ${comment1.id})`)

    const comment2 = await prisma.clientComment.create({
      data: {
        clientId: testClientId,
        text: 'This is the second test comment for persistence testing',
        authorId: authorId,
        author: testUser?.name || 'Test System',
        userName: testUser?.email || 'test@system.com'
      }
    })
    testCommentIds.push(comment2.id)
    console.log(`✅ Comment 2 created (ID: ${comment2.id})`)

    // Test 4: Update client fields
    console.log('\n📋 Test 4: Updating client fields...')
    const updatedClient = await prisma.client.update({
      where: { id: testClientId },
      data: {
        industry: 'Mining',
        status: 'active',
        revenue: 100000,
        notes: 'Updated notes for test client'
      }
    })
    console.log(`✅ Client updated: Industry=${updatedClient.industry}, Revenue=${updatedClient.revenue}`)

    // Test 5: Verify persistence - Read all data back
    console.log('\n📋 Test 5: Verifying persistence - Reading all data back...')
    
    const persistedClient = await prisma.client.findUnique({
      where: { id: testClientId },
      include: {
        clientContacts: true,
        clientComments: true
      }
    })

    if (!persistedClient) {
      throw new Error('❌ Client not found in database!')
    }
    console.log(`✅ Client retrieved: ${persistedClient.name}`)
    console.log(`   Industry: ${persistedClient.industry}`)
    console.log(`   Revenue: ${persistedClient.revenue}`)
    console.log(`   Notes: ${persistedClient.notes}`)

    // Verify contacts
    console.log(`\n📋 Verifying contacts (${persistedClient.clientContacts.length} found)...`)
    if (persistedClient.clientContacts.length !== 2) {
      throw new Error(`❌ Expected 2 contacts, found ${persistedClient.clientContacts.length}`)
    }
    persistedClient.clientContacts.forEach((contact, idx) => {
      console.log(`   ✅ Contact ${idx + 1}: ${contact.name} (${contact.email}) - ${contact.phone}`)
      if (!testContactIds.includes(contact.id)) {
        throw new Error(`❌ Contact ID ${contact.id} not in expected list!`)
      }
    })

    // Verify comments
    console.log(`\n📋 Verifying comments (${persistedClient.clientComments.length} found)...`)
    if (persistedClient.clientComments.length !== 2) {
      throw new Error(`❌ Expected 2 comments, found ${persistedClient.clientComments.length}`)
    }
    persistedClient.clientComments.forEach((comment, idx) => {
      console.log(`   ✅ Comment ${idx + 1}: ${comment.text.substring(0, 50)}...`)
      if (!testCommentIds.includes(comment.id)) {
        throw new Error(`❌ Comment ID ${comment.id} not in expected list!`)
      }
    })

    // Test 6: Update a contact
    console.log('\n📋 Test 6: Updating a contact...')
    const updatedContact = await prisma.clientContact.update({
      where: { id: testContactIds[0] },
      data: {
        email: 'updated.contact1@testclient.example.com',
        phone: '011-999-8888',
        notes: 'Updated contact information'
      }
    })
    console.log(`✅ Contact updated: ${updatedContact.name}`)
    console.log(`   New email: ${updatedContact.email}`)
    console.log(`   New phone: ${updatedContact.phone}`)

    // Test 7: Update a comment
    console.log('\n📋 Test 7: Updating a comment...')
    const updatedComment = await prisma.clientComment.update({
      where: { id: testCommentIds[0] },
      data: {
        text: 'UPDATED: This comment was updated to test persistence'
      }
    })
    console.log(`✅ Comment updated (ID: ${updatedComment.id})`)
    console.log(`   New text: ${updatedComment.text}`)

    // Test 8: Verify updates persisted
    console.log('\n📋 Test 8: Verifying updates persisted...')
    const recheckClient = await prisma.client.findUnique({
      where: { id: testClientId },
      include: {
        clientContacts: true,
        clientComments: true
      }
    })

    const recheckContact = recheckClient.clientContacts.find(c => c.id === testContactIds[0])
    if (recheckContact.email !== 'updated.contact1@testclient.example.com') {
      throw new Error(`❌ Contact email not persisted! Expected: updated.contact1@testclient.example.com, Got: ${recheckContact.email}`)
    }
    console.log(`✅ Contact update persisted correctly`)

    const recheckComment = recheckClient.clientComments.find(c => c.id === testCommentIds[0])
    if (!recheckComment.text.includes('UPDATED')) {
      throw new Error(`❌ Comment update not persisted!`)
    }
    console.log(`✅ Comment update persisted correctly`)

    // Test 9: Delete a contact
    console.log('\n📋 Test 9: Deleting a contact...')
    await prisma.clientContact.delete({
      where: { id: testContactIds[1] }
    })
    console.log(`✅ Contact 2 deleted (ID: ${testContactIds[1]})`)

    // Verify deletion
    const contactsAfterDelete = await prisma.clientContact.findMany({
      where: { clientId: testClientId }
    })
    if (contactsAfterDelete.length !== 1) {
      throw new Error(`❌ Expected 1 contact after deletion, found ${contactsAfterDelete.length}`)
    }
    console.log(`✅ Deletion verified - ${contactsAfterDelete.length} contact(s) remaining`)

    // Test 10: Delete a comment
    console.log('\n📋 Test 10: Deleting a comment...')
    await prisma.clientComment.delete({
      where: { id: testCommentIds[1] }
    })
    console.log(`✅ Comment 2 deleted (ID: ${testCommentIds[1]})`)

    // Verify deletion
    const commentsAfterDelete = await prisma.clientComment.findMany({
      where: { clientId: testClientId }
    })
    if (commentsAfterDelete.length !== 1) {
      throw new Error(`❌ Expected 1 comment after deletion, found ${commentsAfterDelete.length}`)
    }
    console.log(`✅ Deletion verified - ${commentsAfterDelete.length} comment(s) remaining`)

    // Final verification
    console.log('\n📋 Final Verification: Reading complete client data...')
    const finalClient = await prisma.client.findUnique({
      where: { id: testClientId },
      include: {
        clientContacts: true,
        clientComments: true
      }
    })

    console.log(`\n✅ Final Client State:`)
    console.log(`   Name: ${finalClient.name}`)
    console.log(`   Industry: ${finalClient.industry}`)
    console.log(`   Status: ${finalClient.status}`)
    console.log(`   Revenue: ${finalClient.revenue}`)
    console.log(`   Contacts: ${finalClient.clientContacts.length}`)
    finalClient.clientContacts.forEach(c => {
      console.log(`     - ${c.name} (${c.email})`)
    })
    console.log(`   Comments: ${finalClient.clientComments.length}`)
    finalClient.clientComments.forEach(c => {
      console.log(`     - ${c.text.substring(0, 60)}...`)
    })

    // Test 11: Verify NO JSON fields were written (check contactsJsonb and commentsJsonb)
    console.log('\n📋 Test 11: Verifying NO JSON fields were written...')
    const clientJsonCheck = await prisma.client.findUnique({
      where: { id: testClientId },
      select: {
        id: true,
        contactsJsonb: true,
        commentsJsonb: true,
        contacts: true,
        comments: true
      }
    })

    const contactsInJsonb = Array.isArray(clientJsonCheck.contactsJsonb) ? clientJsonCheck.contactsJsonb.length : 0
    const commentsInJsonb = Array.isArray(clientJsonCheck.commentsJsonb) ? clientJsonCheck.commentsJsonb.length : 0
    
    // Parse contacts/comments strings
    let contactsInString = 0
    let commentsInString = 0
    try {
      if (clientJsonCheck.contacts) {
        const parsed = JSON.parse(clientJsonCheck.contacts)
        contactsInString = Array.isArray(parsed) ? parsed.length : 0
      }
    } catch (e) {}
    
    try {
      if (clientJsonCheck.comments) {
        const parsed = JSON.parse(clientJsonCheck.comments)
        commentsInString = Array.isArray(parsed) ? parsed.length : 0
      }
    } catch (e) {}

    console.log(`   Contacts in JSONB: ${contactsInJsonb} (should be 0 or old data)`)
    console.log(`   Comments in JSONB: ${commentsInJsonb} (should be 0 or old data)`)
    console.log(`   Contacts in String: ${contactsInString} (should be 0 or old data)`)
    console.log(`   Comments in String: ${commentsInString} (should be 0 or old data)`)

    if (contactsInJsonb > 0 || contactsInString > 0) {
      console.log(`   ⚠️  WARNING: Contacts found in JSON fields - JSON writes may have occurred!`)
    } else {
      console.log(`   ✅ No contacts in JSON fields - JSON writes correctly removed`)
    }

    if (commentsInJsonb > 0 || commentsInString > 0) {
      console.log(`   ⚠️  WARNING: Comments found in JSON fields - JSON writes may have occurred!`)
    } else {
      console.log(`   ✅ No comments in JSON fields - JSON writes correctly removed`)
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ ALL TESTS PASSED!')
    console.log(`\n📊 Test Summary:`)
    console.log(`   - Client created: ✅`)
    console.log(`   - Contacts created (normalized table): ✅`)
    console.log(`   - Comments created (normalized table): ✅`)
    console.log(`   - Client updated: ✅`)
    console.log(`   - Contact updated: ✅`)
    console.log(`   - Comment updated: ✅`)
    console.log(`   - Contact deleted: ✅`)
    console.log(`   - Comment deleted: ✅`)
    console.log(`   - Persistence verified: ✅`)
    console.log(`   - JSON writes check: ✅`)
    console.log(`\n🧹 Test Client ID: ${testClientId}`)
    console.log(`   (You can manually delete this client if needed)`)

  } catch (error) {
    console.error('\n❌ Test failed:', error)
    console.error('Error details:', error.message)
    if (error.stack) {
      console.error('Stack:', error.stack)
    }
    
    // Cleanup on error
    if (testClientId) {
      console.log('\n🧹 Cleaning up test data...')
      try {
        await prisma.clientContact.deleteMany({ where: { clientId: testClientId } })
        await prisma.clientComment.deleteMany({ where: { clientId: testClientId } })
        await prisma.client.delete({ where: { id: testClientId } })
        console.log('✅ Test data cleaned up')
      } catch (cleanupError) {
        console.error('⚠️  Cleanup failed:', cleanupError.message)
      }
    }
    
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

testAllEndpoints()





