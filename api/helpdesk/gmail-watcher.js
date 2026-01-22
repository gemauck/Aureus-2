// Gmail API integration for helpdesk email-to-ticket
// Polls Gmail inbox for emails to support@abcotronics.co.za
// Creates tickets from new emails and adds comments from replies

import { google } from 'googleapis'
import { prisma } from '../_lib/prisma.js'
import { generateTicketNumber } from '../helpdesk.js'

// Gmail API setup
function getGmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/api/helpdesk/gmail-callback'
  )

  // Set credentials (refresh token from OAuth flow)
  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN
  })

  return google.gmail({ version: 'v1', auth: oauth2Client })
}

// Parse Gmail message to extract email data
async function parseGmailMessage(gmail, messageId) {
  try {
    const message = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    })

    const payload = message.data.payload
    const headers = payload.headers || []
    
    // Extract headers
    const getHeader = (name) => {
      const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase())
      return header?.value || ''
    }

    const from = getHeader('From')
    const to = getHeader('To')
    const subject = getHeader('Subject')
    const messageIdHeader = getHeader('Message-ID')
    const inReplyTo = getHeader('In-Reply-To')
    const references = getHeader('References')
    const date = getHeader('Date')

    // Extract body
    let text = ''
    let html = ''
    
    if (payload.body?.data) {
      // Simple text message
      text = Buffer.from(payload.body.data, 'base64').toString('utf-8')
    } else if (payload.parts) {
      // Multipart message
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          text = Buffer.from(part.body.data, 'base64').toString('utf-8')
        } else if (part.mimeType === 'text/html' && part.body?.data) {
          html = Buffer.from(part.body.data, 'base64').toString('utf-8')
        }
        
        // Check nested parts
        if (part.parts) {
          for (const subPart of part.parts) {
            if (subPart.mimeType === 'text/plain' && subPart.body?.data) {
              text = Buffer.from(subPart.body.data, 'base64').toString('utf-8')
            } else if (subPart.mimeType === 'text/html' && subPart.body?.data) {
              html = Buffer.from(subPart.body.data, 'base64').toString('utf-8')
            }
          }
        }
      }
    }

    // Extract attachments
    const attachments = []
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.filename && part.body?.attachmentId) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType,
            size: part.body.size,
            attachmentId: part.body.attachmentId
          })
        }
      }
    }

    return {
      from,
      to,
      subject,
      text,
      html,
      headers: {
        'Message-ID': messageIdHeader,
        'In-Reply-To': inReplyTo,
        'References': references
      },
      attachments,
      date,
      messageId
    }
  } catch (error) {
    console.error('❌ Error parsing Gmail message:', error)
    throw error
  }
}

// Find or create user by email
async function findOrCreateUserByEmail(email, name) {
  let user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() }
  })

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name: name || email.split('@')[0],
        role: 'guest',
        status: 'active',
        provider: 'email'
      }
    })
  }

  return user
}

// Find existing ticket by email thread
async function findTicketByThread(threadId, messageId) {
  if (!threadId && !messageId) return null

  if (threadId) {
    const ticket = await prisma.ticket.findFirst({
      where: {
        OR: [
          { emailThreadId: threadId },
          { emailMessageId: threadId },
          { emailMessageId: messageId }
        ]
      },
      orderBy: { createdAt: 'desc' }
    })
    
    if (ticket) return ticket
  }

  if (messageId) {
    const ticket = await prisma.ticket.findFirst({
      where: { emailMessageId: messageId },
      orderBy: { createdAt: 'desc' }
    })
    
    if (ticket) return ticket
  }

  return null
}

// Process email and create/update ticket
async function processEmail(emailData) {
  try {
    // Extract email addresses
    const fromMatch = emailData.from.match(/<?([^<>]+@[^<>]+)>?/) || [null, emailData.from]
    const fromEmail = fromMatch[1]?.trim().toLowerCase()
    const fromName = emailData.from.replace(/<[^>]+>/, '').trim() || fromEmail.split('@')[0]

    // Check if email is to support address
    const toEmail = (emailData.to || '').toLowerCase()
    if (!toEmail.includes('support@abcotronics.co.za') && !toEmail.includes('helpdesk')) {
      console.log('⚠️ Email not to support address, ignoring:', toEmail)
      return { processed: false, reason: 'Not to support address' }
    }

    // Extract thread info
    const threadId = emailData.headers['In-Reply-To'] || 
                     (emailData.headers['References'] ? emailData.headers['References'].split(' ')[0] : null) ||
                     emailData.headers['Message-ID']
    
    const messageId = emailData.headers['Message-ID']?.replace(/[<>]/g, '')
    const cleanThreadId = threadId?.replace(/[<>]/g, '')

    // Find existing ticket
    const existingTicket = await findTicketByThread(cleanThreadId, messageId)

    // Find or create user
    const user = await findOrCreateUserByEmail(fromEmail, fromName)

    // Parse body
    const bodyText = emailData.html 
      ? emailData.html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
      : emailData.text || ''

    if (existingTicket) {
      // This is a reply - add as comment
      console.log(`📧 Email reply to ticket ${existingTicket.ticketNumber}`)
      
      const comments = JSON.parse(existingTicket.comments || '[]')
      comments.push({
        userId: user.id,
        userName: user.name || user.email,
        comment: bodyText,
        timestamp: new Date().toISOString(),
        source: 'email'
      })

      const activityLog = JSON.parse(existingTicket.activityLog || '[]')
      activityLog.push({
        action: 'comment_added',
        userId: user.id,
        userName: user.name || user.email,
        timestamp: new Date().toISOString(),
        source: 'email'
      })

      await prisma.ticket.update({
        where: { id: existingTicket.id },
        data: {
          comments: JSON.stringify(comments),
          activityLog: JSON.stringify(activityLog),
          updatedAt: new Date()
        }
      })

      return { processed: true, action: 'comment_added', ticketNumber: existingTicket.ticketNumber }
    } else {
      // New email - create ticket
      console.log(`📧 Creating new ticket from email: ${fromEmail}`)
      
      const ticketNumber = await generateTicketNumber()
      
      const activityLog = [{
        action: 'created',
        userId: user.id,
        userName: user.name || user.email,
        timestamp: new Date().toISOString(),
        source: 'email',
        emailFrom: fromEmail,
        emailSubject: emailData.subject
      }]

      const ticket = await prisma.ticket.create({
        data: {
          ticketNumber,
          title: emailData.subject,
          description: bodyText,
          status: 'open',
          priority: 'medium',
          category: 'general',
          type: 'email',
          createdById: user.id,
          sourceEmail: fromEmail,
          emailThreadId: cleanThreadId,
          emailMessageId: messageId,
          emailSubject: emailData.subject,
          comments: JSON.stringify([]),
          activityLog: JSON.stringify(activityLog),
          tags: JSON.stringify([]),
          attachments: JSON.stringify([]),
          customFields: JSON.stringify({})
        }
      })

      return { processed: true, action: 'ticket_created', ticketNumber: ticket.ticketNumber }
    }
  } catch (error) {
    console.error('❌ Error processing email:', error)
    throw error
  }
}

// Main function to check Gmail for new emails
export async function checkGmailForTickets() {
  try {
    const gmail = getGmailClient()
    
    // Search for unread emails to support@abcotronics.co.za
    const query = 'to:support@abcotronics.co.za is:unread'
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 10
    })

    const messages = response.data.messages || []
    console.log(`📬 Found ${messages.length} unread emails to support@abcotronics.co.za`)

    const results = []
    
    for (const message of messages) {
      try {
        // Parse message
        const emailData = await parseGmailMessage(gmail, message.id)
        
        // Process email
        const result = await processEmail(emailData)
        
        if (result.processed) {
          // Mark as read
          await gmail.users.messages.modify({
            userId: 'me',
            id: message.id,
            requestBody: {
              removeLabelIds: ['UNREAD']
            }
          })
          
          results.push({ messageId: message.id, ...result })
        }
      } catch (error) {
        console.error(`❌ Error processing message ${message.id}:`, error)
        results.push({ messageId: message.id, error: error.message })
      }
    }

    return {
      success: true,
      checked: messages.length,
      processed: results.filter(r => r.processed).length,
      results
    }
  } catch (error) {
    console.error('❌ Error checking Gmail:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

// API endpoint to trigger Gmail check manually
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const result = await checkGmailForTickets()
    return res.status(200).json(result)
  } catch (error) {
    console.error('❌ Gmail watcher error:', error)
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    })
  }
}















