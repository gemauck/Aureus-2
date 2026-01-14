#!/usr/bin/env node
/**
 * Test script to verify contacts and comments are being written to normalized tables
 * Creates test entries, logs them, then deletes them
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function testNormalizedTables() {
  console.log('🧪 Testing Normalized Tables (ClientContact & ClientComment)\n')
  
  // Find or create a test client
  let testClient
  try {
    testClient = await prisma.client.findFirst({
      where: {
        name: { contains: 'TEST' }
      }
    })
    
    if (!testClient) {
      console.log('📝 Creating test client...')
      testClient = await prisma.client.create({
        data: {
          name: 'TEST CLIENT - Normalized Tables Test',
          type: 'client',
          industry: 'Testing',
          status: 'Potential',
          notes: 'This is a test client for normalized tables. Can be deleted.'
        }
      })
      console.log(`✅ Created test client: ${testClient.id}\n`)
    } else {
      console.log(`✅ Using existing test client: ${testClient.id}\n`)
    }
  } catch (error) {
    console.error('❌ Error creating/finding test client:', error.message)
    process.exit(1)
  }
  
  const testContactIds = []
  const testCommentIds = []
  
  try {
    // Test 1: Create Contact in normalized table
    console.log('📝 Test 1: Creating contact in ClientContact table...')
    const testContact = await prisma.clientContact.create({
      data: {
        clientId: testClient.id,
        name: 'Test Contact',
        email: 'test.contact@example.com',
        phone: '+27 12 345 6789',
        mobile: '+27 82 123 4567',
        role: 'Test Role',
        title: 'Test Title',
        isPrimary: true,
        notes: 'This is a test contact'
      }
    })
    testContactIds.push(testContact.id)
    console.log(`✅ Created contact: ${testContact.id}`)
    console.log(`   Name: ${testContact.name}`)
    console.log(`   Email: ${testContact.email}`)
    console.log(`   Phone: ${testContact.phone}`)
    console.log(`   Is Primary: ${testContact.isPrimary}\n`)
    
    // Test 2: Create Comment in normalized table
    console.log('📝 Test 2: Creating comment in ClientComment table...')
    const testComment = await prisma.clientComment.create({
      data: {
        clientId: testClient.id,
        text: 'This is a test comment to verify normalized table writes',
        author: 'Test System',
        userName: 'test@example.com',
        authorId: null
      }
    })
    testCommentIds.push(testComment.id)
    console.log(`✅ Created comment: ${testComment.id}`)
    console.log(`   Text: ${testComment.text.substring(0, 50)}...`)
    console.log(`   Author: ${testComment.author}`)
    console.log(`   Created: ${testComment.createdAt}\n`)
    
    // Test 3: Verify contacts are readable from normalized table
    console.log('📝 Test 3: Verifying contacts can be read from normalized table...')
    const contacts = await prisma.clientContact.findMany({
      where: { clientId: testClient.id },
      orderBy: { createdAt: 'desc' }
    })
    console.log(`✅ Found ${contacts.length} contact(s) for test client`)
    contacts.forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.name} (${c.email || 'no email'}) - ${c.isPrimary ? 'PRIMARY' : 'secondary'}`)
    })
    console.log('')
    
    // Test 4: Verify comments are readable from normalized table
    console.log('📝 Test 4: Verifying comments can be read from normalized table...')
    const comments = await prisma.clientComment.findMany({
      where: { clientId: testClient.id },
      orderBy: { createdAt: 'desc' }
    })
    console.log(`✅ Found ${comments.length} comment(s) for test client`)
    comments.forEach((c, i) => {
      console.log(`   ${i + 1}. "${c.text.substring(0, 50)}..." by ${c.author || 'Unknown'}`)
    })
    console.log('')
    
    // Test 5: Test updating a contact
    console.log('📝 Test 5: Testing contact update...')
    if (testContactIds.length > 0) {
      const updatedContact = await prisma.clientContact.update({
        where: { id: testContactIds[0] },
        data: {
          name: 'Updated Test Contact',
          email: 'updated.test@example.com'
        }
      })
      console.log(`✅ Updated contact: ${updatedContact.name} (${updatedContact.email})\n`)
    }
    
    // Test 6: Test updating a comment
    console.log('📝 Test 6: Testing comment update...')
    if (testCommentIds.length > 0) {
      const updatedComment = await prisma.clientComment.update({
        where: { id: testCommentIds[0] },
        data: {
          text: 'This comment has been updated to test normalized table updates'
        }
      })
      console.log(`✅ Updated comment: "${updatedComment.text.substring(0, 50)}..."\n`)
    }
    
    // Test 7: Verify JSONB sync (if contacts/comments were synced to Client table)
    console.log('📝 Test 7: Checking if contacts/comments are synced to JSONB fields...')
    const clientWithJsonb = await prisma.client.findUnique({
      where: { id: testClient.id },
      select: {
        id: true,
        name: true,
        contactsJsonb: true,
        commentsJsonb: true
      }
    })
    
    if (clientWithJsonb) {
      const contactsInJsonb = Array.isArray(clientWithJsonb.contactsJsonb) ? clientWithJsonb.contactsJsonb.length : 0
      const commentsInJsonb = Array.isArray(clientWithJsonb.commentsJsonb) ? clientWithJsonb.commentsJsonb.length : 0
      console.log(`   Contacts in JSONB: ${contactsInJsonb}`)
      console.log(`   Comments in JSONB: ${commentsInJsonb}`)
      console.log(`   Note: JSONB may not be synced if created directly in normalized tables\n`)
    }
    
    // Cleanup: Delete test data
    console.log('🧹 Cleaning up test data...')
    
    if (testContactIds.length > 0) {
      await prisma.clientContact.deleteMany({
        where: { id: { in: testContactIds } }
      })
      console.log(`✅ Deleted ${testContactIds.length} test contact(s)`)
    }
    
    if (testCommentIds.length > 0) {
      await prisma.clientComment.deleteMany({
        where: { id: { in: testCommentIds } }
      })
      console.log(`✅ Deleted ${testCommentIds.length} test comment(s)`)
    }
    
    // Delete test client if it was created by us
    const testClientCheck = await prisma.client.findUnique({
      where: { id: testClient.id },
      include: {
        clientContacts: true,
        clientComments: true
      }
    })
    
    if (testClientCheck && testClientCheck.name.includes('TEST CLIENT - Normalized Tables Test')) {
      // Only delete if no other contacts/comments exist (aside from our test ones)
      const remainingContacts = testClientCheck.clientContacts.length
      const remainingComments = testClientCheck.clientComments.length
      
      if (remainingContacts === 0 && remainingComments === 0) {
        await prisma.client.delete({
          where: { id: testClient.id }
        })
        console.log(`✅ Deleted test client`)
      } else {
        console.log(`⚠️  Test client has ${remainingContacts} contacts and ${remainingComments} comments. Leaving it for manual cleanup.`)
      }
    }
    
    console.log('\n✅ All tests completed successfully!')
    console.log('\n📊 Summary:')
    console.log('  ✅ Contact creation: Working')
    console.log('  ✅ Comment creation: Working')
    console.log('  ✅ Contact reading: Working')
    console.log('  ✅ Comment reading: Working')
    console.log('  ✅ Contact update: Working')
    console.log('  ✅ Comment update: Working')
    console.log('  ✅ Cleanup: Complete')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    console.error(error.stack)
    
    // Cleanup on error
    try {
      if (testContactIds.length > 0) {
        await prisma.clientContact.deleteMany({
          where: { id: { in: testContactIds } }
        })
        console.log('🧹 Cleaned up contacts after error')
      }
      if (testCommentIds.length > 0) {
        await prisma.clientComment.deleteMany({
          where: { id: { in: testCommentIds } }
        })
        console.log('🧹 Cleaned up comments after error')
      }
    } catch (cleanupError) {
      console.error('❌ Cleanup error:', cleanupError.message)
    }
    
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run tests
testNormalizedTables().catch(console.error)










