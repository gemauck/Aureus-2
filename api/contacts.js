import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { isConnectionError } from './_lib/dbErrorHandler.js'

function getContactsArray(rawContacts) {
  if (typeof rawContacts === 'string') {
    try {
      const parsedContacts = JSON.parse(rawContacts)
      return Array.isArray(parsedContacts) ? parsedContacts : []
    } catch (parseError) {
      console.warn('⚠️ Invalid contacts JSON, defaulting to empty array:', parseError)
      return []
    }
  }

  return Array.isArray(rawContacts) ? rawContacts : []
}

async function handler(req, res) {
  try {
    
    // Strip query parameters before splitting (safety fallback)
    const urlPath = req.url.split('?')[0].split('#')[0]
    const pathSegments = urlPath.split('/').filter(Boolean)
    
    // Extract clientId and contactId from Express params or path
    const clientId = req.params?.clientId || (pathSegments[1] === 'client' ? pathSegments[2] : null)
    const contactId = req.params?.contactId || (pathSegments[1] === 'client' && pathSegments.length > 3 ? pathSegments[3] : null)
    
    
    // GET /api/contacts/client/:clientId - Get all contacts for a client
    // Phase 5: Use normalized ClientContact table
    if (req.method === 'GET' && clientId && !contactId) {
      if (!clientId) return badRequest(res, 'clientId required')
      
      try {
        // Phase 5: Read from normalized ClientContact table first
        const normalizedContacts = await prisma.clientContact.findMany({
          where: { clientId },
          orderBy: [
            { isPrimary: 'desc' },
            { createdAt: 'asc' }
          ]
        })
        
        if (normalizedContacts.length > 0) {
          // Convert to array format for backward compatibility
          const contacts = normalizedContacts.map(c => ({
            id: c.id,
            name: c.name,
            email: c.email || '',
            phone: c.phone || '',
            mobile: c.mobile || '',
            role: c.role || '',
            title: c.title || '',
            isPrimary: c.isPrimary,
            notes: c.notes || '',
            createdAt: c.createdAt
          }))
          return ok(res, { contacts })
        }
        
        // Fallback: Read from old JSON field (backward compatibility)
        const client = await prisma.client.findUnique({
          where: { id: clientId },
          select: { contacts: true, contactsJsonb: true }
        })
        
        if (!client) return notFound(res)
        
        // Try JSONB first, then String
        let contacts = []
        if (client.contactsJsonb && Array.isArray(client.contactsJsonb) && client.contactsJsonb.length > 0) {
          contacts = client.contactsJsonb
        } else {
          contacts = getContactsArray(client.contacts)
        }
        
        return ok(res, { contacts })
      } catch (dbError) {
        console.error('❌ Database error getting contacts:', dbError)
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        return serverError(res, 'Failed to get contacts', dbError.message)
      }
    }
    
    // POST /api/contacts/client/:clientId - Add a contact to a client
    // Phase 5: Write to normalized ClientContact table
    if (req.method === 'POST' && clientId) {
      if (!clientId) return badRequest(res, 'clientId required')
      
      const body = req.body || {}
      if (!body.name) return badRequest(res, 'contact name required')
      
      try {
        // Verify client exists
        const client = await prisma.client.findUnique({
          where: { id: clientId },
          select: { id: true }
        })
        
        if (!client) return notFound(res)
        
        // Phase 5: Create contact in normalized ClientContact table
        const newContact = await prisma.clientContact.create({
          data: {
            id: body.id || undefined, // Use provided ID or let Prisma generate cuid()
            clientId: clientId,
            name: body.name,
            email: body.email || null,
            phone: body.phone || null,
            mobile: body.mobile || body.phone || null, // Use phone as mobile fallback
            role: body.role || null,
            title: body.title || body.department || null, // Map department to title if provided
            isPrimary: !!body.isPrimary,
            notes: body.notes || ''
          }
        })
        
        // Normalized table is the source of truth - no JSON sync needed
        
        // Return in expected format
        const contactResponse = {
          id: newContact.id,
          name: newContact.name,
          email: newContact.email || '',
          phone: newContact.phone || '',
          mobile: newContact.mobile || '',
          role: newContact.role || '',
          title: newContact.title || '',
          isPrimary: newContact.isPrimary,
          notes: newContact.notes || ''
        }
        
        return created(res, { contact: contactResponse })
      } catch (dbError) {
        console.error('❌ Database error adding contact:', dbError)
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        return serverError(res, 'Failed to add contact', dbError.message)
      }
    }
    
    // PATCH /api/contacts/client/:clientId/:contactId - Update a contact
    // Phase 5: Update in normalized ClientContact table
    if (req.method === 'PATCH' && clientId && contactId) {
      if (!clientId || !contactId) return badRequest(res, 'clientId and contactId required')
      
      const body = req.body || {}
      
      try {
        // Phase 5: Check if contact exists in normalized table
        const existingContact = await prisma.clientContact.findFirst({
          where: {
            id: contactId,
            clientId: clientId
          }
        })
        
        if (!existingContact) {
          return notFound(res, 'Contact not found')
        }
        
        // Update contact in normalized table
        const updateData = {}
        if (body.name !== undefined) updateData.name = body.name
        if (body.email !== undefined) updateData.email = body.email || null
        if (body.phone !== undefined) updateData.phone = body.phone || null
        if (body.mobile !== undefined) updateData.mobile = body.mobile || null
        if (body.role !== undefined) updateData.role = body.role || null
        if (body.title !== undefined) updateData.title = body.title || null
        if (body.department !== undefined) updateData.title = body.department || null // Map department to title
        if (body.isPrimary !== undefined) updateData.isPrimary = !!body.isPrimary
        if (body.notes !== undefined) updateData.notes = body.notes || ''
        
        const updatedContact = await prisma.clientContact.update({
          where: { id: contactId },
          data: updateData
        })
        
        // Normalized table is the source of truth - no JSON sync needed
        
        // Return in expected format
        const contactResponse = {
          id: updatedContact.id,
          name: updatedContact.name,
          email: updatedContact.email || '',
          phone: updatedContact.phone || '',
          mobile: updatedContact.mobile || '',
          role: updatedContact.role || '',
          title: updatedContact.title || '',
          isPrimary: updatedContact.isPrimary,
          notes: updatedContact.notes || ''
        }
        
        return ok(res, { contact: contactResponse })
      } catch (dbError) {
        console.error('❌ Database error updating contact:', dbError)
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        if (dbError.code === 'P2025') {
          return notFound(res, 'Contact not found')
        }
        return serverError(res, 'Failed to update contact', dbError.message)
      }
    }
    
    // DELETE /api/contacts/client/:clientId/:contactId - Delete a contact
    // Phase 5: Delete from normalized ClientContact table
    if (req.method === 'DELETE' && clientId && contactId) {
      if (!clientId || !contactId) return badRequest(res, 'clientId and contactId required')
      
      try {
        // Phase 5: Check if contact exists in normalized table
        const existingContact = await prisma.clientContact.findFirst({
          where: {
            id: contactId,
            clientId: clientId
          }
        })
        
        if (!existingContact) {
          return notFound(res, 'Contact not found')
        }
        
        // Delete from normalized table (CASCADE will handle cleanup)
        await prisma.clientContact.delete({
          where: { id: contactId }
        })
        
        // Normalized table is the source of truth - no JSON sync needed
        
        return ok(res, { deleted: true })
      } catch (dbError) {
        console.error('❌ Database error deleting contact:', dbError)
        if (isConnectionError(dbError)) {
          return serverError(res, `Database connection failed: ${dbError.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.')
        }
        if (dbError.code === 'P2025') {
          return notFound(res, 'Contact not found')
        }
        return serverError(res, 'Failed to delete contact', dbError.message)
      }
    }
    
    return badRequest(res, 'Invalid contacts endpoint')
  } catch (e) {
    console.error('❌ Contacts handler error:', e)
    return serverError(res, 'Contacts handler failed', e.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))
