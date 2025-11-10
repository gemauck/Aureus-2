import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    console.log('🔍 Contacts API Debug:', {
      method: req.method,
      url: req.url,
      params: req.params,
      headers: req.headers,
      user: req.user
    });
    
    // Strip query parameters before splitting (safety fallback)
    const urlPath = req.url.split('?')[0].split('#')[0]
    const pathSegments = urlPath.split('/').filter(Boolean)
    
    // Extract clientId and contactId from Express params or path
    const clientId = req.params?.clientId || (pathSegments[1] === 'client' ? pathSegments[2] : null)
    const contactId = req.params?.contactId || (pathSegments[1] === 'client' && pathSegments.length > 3 ? pathSegments[3] : null)
    
    console.log('🔍 Path analysis:', {
      url: req.url,
      pathSegments,
      clientId,
      contactId,
      params: req.params
    });
    
    // GET /api/contacts/client/:clientId - Get all contacts for a client
    if (req.method === 'GET' && clientId && !contactId) {
      if (!clientId) return badRequest(res, 'clientId required')
      
      try {
        const client = await prisma.client.findUnique({
          where: { id: clientId },
          select: { contacts: true }
        })
        
        if (!client) return notFound(res)
        
        const contacts = typeof client.contacts === 'string' 
          ? JSON.parse(client.contacts) 
          : (Array.isArray(client.contacts) ? client.contacts : [])
        
        console.log('✅ Contacts retrieved for client:', clientId, '- Count:', contacts.length)
        console.log('📤 Returning contacts:', JSON.stringify(contacts, null, 2))
        return ok(res, { contacts })
      } catch (dbError) {
        console.error('❌ Database error getting contacts:', dbError)
        return serverError(res, 'Failed to get contacts', dbError.message)
      }
    }
    
    // POST /api/contacts/client/:clientId - Add a contact to a client
    if (req.method === 'POST' && clientId) {
      if (!clientId) return badRequest(res, 'clientId required')
      
      const body = req.body || {}
      if (!body.name) return badRequest(res, 'contact name required')
      
      try {
        // Get current contacts
        const client = await prisma.client.findUnique({
          where: { id: clientId },
          select: { contacts: true }
        })
        
        if (!client) return notFound(res)
        
        const existingContacts = typeof client.contacts === 'string' 
          ? JSON.parse(client.contacts) 
          : (Array.isArray(client.contacts) ? client.contacts : [])
        
        // Create new contact
        const newContact = {
          id: body.id || `contact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: body.name,
          email: body.email || '',
          phone: body.phone || '',
          role: body.role || '',
          department: body.department || '',
          town: body.town || '',
          siteId: body.siteId || null,
          isPrimary: !!body.isPrimary,
          notes: body.notes || ''
        }
        
        // Add to array
        const updatedContacts = [...existingContacts, newContact]
        
        // Save back to database
        const updatedClient = await prisma.client.update({
          where: { id: clientId },
          data: { contacts: JSON.stringify(updatedContacts) }
        })
        
        console.log('✅ Contact added to client:', clientId, '- Contact:', newContact.name)
        console.log('📤 Returning contact:', JSON.stringify(newContact, null, 2))
        return created(res, { contact: newContact, contacts: updatedContacts })
      } catch (dbError) {
        console.error('❌ Database error adding contact:', dbError)
        return serverError(res, 'Failed to add contact', dbError.message)
      }
    }
    
    // PATCH /api/contacts/client/:clientId/:contactId - Update a contact
    if (req.method === 'PATCH' && clientId && contactId) {
      if (!clientId || !contactId) return badRequest(res, 'clientId and contactId required')
      
      const body = req.body || {}
      
      try {
        const client = await prisma.client.findUnique({
          where: { id: clientId },
          select: { contacts: true }
        })
        
        if (!client) return notFound(res)
        
        const contacts = typeof client.contacts === 'string' 
          ? JSON.parse(client.contacts) 
          : (Array.isArray(client.contacts) ? client.contacts : [])
        
        // Find and update the contact
        const contactIndex = contacts.findIndex(c => c.id === contactId)
        if (contactIndex === -1) return notFound(res, 'Contact not found')
        
        contacts[contactIndex] = {
          ...contacts[contactIndex],
          ...body,
          id: contactId, // Don't allow changing the ID
          isPrimary: body.isPrimary !== undefined ? !!body.isPrimary : contacts[contactIndex].isPrimary
        }
        
        // Save back to database
        await prisma.client.update({
          where: { id: clientId },
          data: { contacts: JSON.stringify(contacts) }
        })
        
        console.log('✅ Contact updated:', contactId, 'for client:', clientId)
        return ok(res, { contact: contacts[contactIndex], contacts })
      } catch (dbError) {
        console.error('❌ Database error updating contact:', dbError)
        return serverError(res, 'Failed to update contact', dbError.message)
      }
    }
    
    // DELETE /api/contacts/client/:clientId/:contactId - Delete a contact
    if (req.method === 'DELETE' && clientId && contactId) {
      if (!clientId || !contactId) return badRequest(res, 'clientId and contactId required')
      
      try {
        const client = await prisma.client.findUnique({
          where: { id: clientId },
          select: { contacts: true }
        })
        
        if (!client) return notFound(res)
        
        const contacts = typeof client.contacts === 'string' 
          ? JSON.parse(client.contacts) 
          : (Array.isArray(client.contacts) ? client.contacts : [])
        
        // Remove the contact
        const updatedContacts = contacts.filter(c => c.id !== contactId)
        
        // Save back to database
        await prisma.client.update({
          where: { id: clientId },
          data: { contacts: JSON.stringify(updatedContacts) }
        })
        
        console.log('✅ Contact deleted:', contactId, 'from client:', clientId)
        return ok(res, { deleted: true, contacts: updatedContacts })
      } catch (dbError) {
        console.error('❌ Database error deleting contact:', dbError)
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
