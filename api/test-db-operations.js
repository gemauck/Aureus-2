import { prisma } from './_lib/prisma.js'
import { ok, serverError } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    console.log('🧪 Testing basic database operations...')
    
    // Test 1: Simple query
    const userCount = await prisma.user.count()
    console.log('✅ User count:', userCount)
    
    // Test 2: Try to create a minimal client
    const testClient = await prisma.client.create({
      data: {
        name: 'Test Client',
        type: 'client', // Add missing type field
        industry: 'Test',
        status: 'active',
        revenue: 0,
        address: '',
        website: '',
        notes: '',
        contacts: [],
        followUps: [],
        projectIds: [],
        comments: [],
        sites: [],
        contracts: [],
        activityLog: [],
        billingTerms: {
          paymentTerms: 'Net 30',
          billingFrequency: 'Monthly',
          currency: 'ZAR',
          retainerAmount: 0,
          taxExempt: false,
          notes: ''
        },
        ownerId: null
      }
    })
    console.log('✅ Test client created:', testClient.id)
    
    // Test 3: Clean up - delete the test client
    await prisma.client.delete({ where: { id: testClient.id } })
    console.log('✅ Test client deleted')
    
    return ok(res, { 
      message: 'All database operations working!',
      userCount,
      testPassed: true
    })
  } catch (e) {
    console.error('❌ Database test failed:', e)
    return serverError(res, 'Database test failed', e.message)
  }
}

export default withHttp(withLogging(handler))
