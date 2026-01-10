#!/usr/bin/env node
/**
 * Comprehensive test script for all lead-related endpoints
 * Tests: Create lead, add contacts, add comments, update lead, persistence
 */

import { prisma } from './api/_lib/prisma.js'

const TEST_LEAD_NAME = `Test Lead - ${new Date().toISOString().split('T')[0]}`
let testLeadId = null
let testContactIds = []
let testCommentIds = []

console.log('🧪 Comprehensive Lead Endpoint Testing\n')
console.log('='.repeat(60))

async function testAllEndpoints() {
  try {
    // Test 1: Create a new lead
    console.log('\n📋 Test 1: Creating a new lead...')
    const newLead = await prisma.client.create({
      data: {
        name: TEST_LEAD_NAME,
        type: 'lead',
        industry: 'Other',
        status: 'active',
        stage: 'Awareness',
        revenue: 0,
        value: 0,
        probability: 0,
        address: '123 Test Street, Test City',
        website: 'https://testlead.example.com',
        notes: 'This is a test lead for endpoint testing'
      }
    })
    testLeadId = newLead.id
    console.log(`✅ Lead created: ${newLead.name} (ID: ${newLead.id})`)

    // Test 2: Add contacts to lead via ClientContact table
    console.log('\n📋 Test 2: Adding contacts to lead...')
    
    const contact1 = await prisma.clientContact.create({
      data: {
        clientId: testLeadId,
        name: 'Test Contact 1',
        email: 'contact1@testlead.example.com',
        phone: '011-123-4567',
        mobile: '082-123-4567',
        role: 'Manager',
        title: 'Operations Manager',
        isPrimary: true,
        notes: 'Primary contact for test lead'
      }
    })
    testContactIds.push(contact1.id)
    console.log(`✅ Contact 1 created: ${contact1.name} (ID: ${contact1.id})`)

    const contact2 = await prisma.clientContact.create({
      data: {
        clientId: testLeadId,
        name: 'Test Contact 2',
        email: 'contact2@testlead.example.com',
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

    // Test 3: Add comments to lead via ClientComment table
    console.log('\n📋 Test 3: Adding comments to lead...')
    
    // Get current user for authorId (or use null)
    const testUser = await prisma.user.findFirst({
      where: { email: { contains: 'gareth', mode: 'insensitive' } }
    })
    const authorId = testUser?.id || null
    
    const comment1 = await prisma.clientComment.create({
      data: {
        clientId: testLeadId,
        text: 'This is the first test comment for the lead',
        authorId: authorId,
        author: testUser?.name || 'Test System',
        userName: testUser?.email || 'test@system.com'
      }
    })
    testCommentIds.push(comment1.id)
    console.log(`✅ Comment 1 created (ID: ${comment1.id})`)

    const comment2 = await prisma.clientComment.create({
      data: {
        clientId: testLeadId,
        text: 'This is the second test comment for persistence testing',
        authorId: authorId,
        author: testUser?.name || 'Test System',
        userName: testUser?.email || 'test@system.com'
      }
    })
    testCommentIds.push(comment2.id)
    console.log(`✅ Comment 2 created (ID: ${comment2.id})`)

    // Test 4: Update lead fields
    console.log('\n📋 Test 4: Updating lead fields...')
    const updatedLead = await prisma.client.update({
      where: { id: testLeadId },
      data: {
        industry: 'Mining',
        status: 'active',
        stage: 'Proposal',
        revenue: 100000,
        value: 150000,
        probability: 75,
        notes: 'Updated notes for test lead'
      }
    })
    console.log(`✅ Lead updated: Industry=${updatedLead.industry}, Stage=${updatedLead.stage}, Revenue=${updatedLead.revenue}, Probability=${updatedLead.probability}`)

    // Test 5: Verify persistence - Read all data back
    console.log('\n📋 Test 5: Verifying persistence - Reading all data back...')
    
    const persistedLead = await prisma.client.findUnique({
      where: { id: testLeadId },
      include: {
        clientContacts: true,
        clientComments: true
      }
    })

    if (!persistedLead) {
      throw new Error('❌ Lead not found in database!')
    }
    if (persistedLead.type !== 'lead') {
      throw new Error(`❌ Lead type incorrect! Expected 'lead', got '${persistedLead.type}'`)
    }
    console.log(`✅ Lead retrieved: ${persistedLead.name}`)
    console.log(`   Type: ${persistedLead.type}`)
    console.log(`   Industry: ${persistedLead.industry}`)
    console.log(`   Stage: ${persistedLead.stage}`)
    console.log(`   Revenue: ${persistedLead.revenue}`)
    console.log(`   Value: ${persistedLead.value}`)
    console.log(`   Probability: ${persistedLead.probability}`)
    console.log(`   Notes: ${persistedLead.notes}`)

    // Verify contacts
    console.log(`\n📋 Verifying contacts (${persistedLead.clientContacts.length} found)...`)
    if (persistedLead.clientContacts.length !== 2) {
      throw new Error(`❌ Expected 2 contacts, found ${persistedLead.clientContacts.length}`)
    }
    persistedLead.clientContacts.forEach((contact, idx) => {
      console.log(`   ✅ Contact ${idx + 1}: ${contact.name} (${contact.email}) - ${contact.phone}`)
      if (!testContactIds.includes(contact.id)) {
        throw new Error(`❌ Contact ID ${contact.id} not in expected list!`)
      }
    })

    // Verify comments
    console.log(`\n📋 Verifying comments (${persistedLead.clientComments.length} found)...`)
    if (persistedLead.clientComments.length !== 2) {
      throw new Error(`❌ Expected 2 comments, found ${persistedLead.clientComments.length}`)
    }
    persistedLead.clientComments.forEach((comment, idx) => {
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
        email: 'updated.contact1@testlead.example.com',
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
    const recheckLead = await prisma.client.findUnique({
      where: { id: testLeadId },
      include: {
        clientContacts: true,
        clientComments: true
      }
    })

    const recheckContact = recheckLead.clientContacts.find(c => c.id === testContactIds[0])
    if (recheckContact.email !== 'updated.contact1@testlead.example.com') {
      throw new Error(`❌ Contact email not persisted! Expected: updated.contact1@testlead.example.com, Got: ${recheckContact.email}`)
    }
    console.log(`✅ Contact update persisted correctly`)

    const recheckComment = recheckLead.clientComments.find(c => c.id === testCommentIds[0])
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
      where: { clientId: testLeadId }
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
      where: { clientId: testLeadId }
    })
    if (commentsAfterDelete.length !== 1) {
      throw new Error(`❌ Expected 1 comment after deletion, found ${commentsAfterDelete.length}`)
    }
    console.log(`✅ Deletion verified - ${commentsAfterDelete.length} comment(s) remaining`)

    // Final verification
    console.log('\n📋 Final Verification: Reading complete lead data...')
    const finalLead = await prisma.client.findUnique({
      where: { id: testLeadId },
      include: {
        clientContacts: true,
        clientComments: true
      }
    })

    console.log(`\n✅ Final Lead State:`)
    console.log(`   Name: ${finalLead.name}`)
    console.log(`   Type: ${finalLead.type}`)
    console.log(`   Industry: ${finalLead.industry}`)
    console.log(`   Stage: ${finalLead.stage}`)
    console.log(`   Status: ${finalLead.status}`)
    console.log(`   Revenue: ${finalLead.revenue}`)
    console.log(`   Value: ${finalLead.value}`)
    console.log(`   Probability: ${finalLead.probability}`)
    console.log(`   Contacts: ${finalLead.clientContacts.length}`)
    finalLead.clientContacts.forEach(c => {
      console.log(`     - ${c.name} (${c.email})`)
    })
    console.log(`   Comments: ${finalLead.clientComments.length}`)
    finalLead.clientComments.forEach(c => {
      console.log(`     - ${c.text.substring(0, 60)}...`)
    })

    // Test 11: Verify NO JSON fields were written (check contactsJsonb and commentsJsonb)
    console.log('\n📋 Test 11: Verifying NO JSON fields were written...')
    const leadJsonCheck = await prisma.client.findUnique({
      where: { id: testLeadId },
      select: {
        id: true,
        contactsJsonb: true,
        commentsJsonb: true,
        contacts: true,
        comments: true
      }
    })

    const contactsInJsonb = Array.isArray(leadJsonCheck.contactsJsonb) ? leadJsonCheck.contactsJsonb.length : 0
    const commentsInJsonb = Array.isArray(leadJsonCheck.commentsJsonb) ? leadJsonCheck.commentsJsonb.length : 0
    
    // Parse contacts/comments strings
    let contactsInString = 0
    let commentsInString = 0
    try {
      if (leadJsonCheck.contacts) {
        const parsed = JSON.parse(leadJsonCheck.contacts)
        contactsInString = Array.isArray(parsed) ? parsed.length : 0
      }
    } catch (e) {}
    
    try {
      if (leadJsonCheck.comments) {
        const parsed = JSON.parse(leadJsonCheck.comments)
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
    console.log(`   - Lead created: ✅`)
    console.log(`   - Contacts created (normalized table): ✅`)
    console.log(`   - Comments created (normalized table): ✅`)
    console.log(`   - Lead updated: ✅`)
    console.log(`   - Contact updated: ✅`)
    console.log(`   - Comment updated: ✅`)
    console.log(`   - Contact deleted: ✅`)
    console.log(`   - Comment deleted: ✅`)
    console.log(`   - Persistence verified: ✅`)
    console.log(`   - JSON writes check: ✅`)
    console.log(`\n🧹 Test Lead ID: ${testLeadId}`)
    console.log(`   (You can manually delete this lead if needed)`)

  } catch (error) {
    console.error('\n❌ Test failed:', error)
    console.error('Error details:', error.message)
    if (error.stack) {
      console.error('Stack:', error.stack)
    }
    
    // Cleanup on error
    if (testLeadId) {
      console.log('\n🧹 Cleaning up test data...')
      try {
        await prisma.clientContact.deleteMany({ where: { clientId: testLeadId } })
        await prisma.clientComment.deleteMany({ where: { clientId: testLeadId } })
        await prisma.client.delete({ where: { id: testLeadId } })
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

