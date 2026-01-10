import { prisma } from './_lib/prisma.js'

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

export default async function handler(req, res) {
  try {
    console.log('🧪 Finding and migrating Contact 22...')
    
    // Step 1: Search for Contact 22 in clients table (contactsJsonb or contacts fields)
    const clients = await prisma.client.findMany({
      select: {
        id: true,
        name: true,
        contactsJsonb: true,
        contacts: true
      }
    })
    
    let contact22Found = null
    let clientWithContact22 = null
    
    // Search through all clients for Contact 22
    for (const client of clients) {
      let contacts = []
      
      // Try JSONB first, then String
      if (client.contactsJsonb && Array.isArray(client.contactsJsonb)) {
        contacts = client.contactsJsonb
      } else if (client.contacts) {
        contacts = parseJson(client.contacts, [])
      }
      
      // Find Contact 22 (check by name containing "22" or exact match "Contact 22")
      contact22Found = contacts.find(c => {
        const name = c?.name || ''
        return name.includes('22') || name === 'Contact 22' || 
               name.toLowerCase().includes('contact 22')
      })
      
      if (contact22Found) {
        clientWithContact22 = client
        break
      }
    }
    
    if (!contact22Found) {
      return res.status(200).json({
        message: 'Contact 22 not found in clients table',
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url,
        searchedClients: clients.length,
        working: true
      })
    }
    
    // Step 2: Check if Contact 22 already exists in ClientContact table
    const existingContact = await prisma.clientContact.findFirst({
      where: {
        clientId: clientWithContact22.id,
        OR: [
          { name: { contains: '22', mode: 'insensitive' } },
          { id: contact22Found.id || '' }
        ]
      }
    })
    
    if (existingContact) {
      return res.status(200).json({
        message: 'Contact 22 already exists in ClientContact table',
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
        contact: {
          id: existingContact.id,
          name: existingContact.name,
          email: existingContact.email,
          phone: existingContact.phone,
          mobile: existingContact.mobile,
          role: existingContact.role,
          title: existingContact.title,
          isPrimary: existingContact.isPrimary,
          clientId: existingContact.clientId,
          clientName: clientWithContact22.name
        },
    working: true
      })
    }
    
    // Step 3: Migrate Contact 22 to ClientContact table
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
    
    // Create the contact in ClientContact table
    const migratedContact = await prisma.clientContact.create({
      data: contactData
    })
    
    console.log(`✅ Successfully migrated Contact 22 from client ${clientWithContact22.name} to ClientContact table`)
    
    return res.status(200).json({
      message: 'Contact 22 successfully migrated to ClientContact table!',
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      migrated: true,
      contact: {
        id: migratedContact.id,
        name: migratedContact.name,
        email: migratedContact.email,
        phone: migratedContact.phone,
        mobile: migratedContact.mobile,
        role: migratedContact.role,
        title: migratedContact.title,
        isPrimary: migratedContact.isPrimary,
        clientId: migratedContact.clientId,
        clientName: clientWithContact22.name
      },
      working: true
    })
    
  } catch (error) {
    console.error('❌ Error migrating Contact 22:', error)
    return res.status(500).json({
      message: 'Error migrating Contact 22',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      working: false
    })
  }
}
