// Email webhook endpoint for helpdesk
// Receives emails from SendGrid Inbound Parse, Mailgun Routes, or Resend Webhooks
// Creates tickets from new emails and adds comments from replies

import { prisma } from '../_lib/prisma.js'
import { ok, badRequest, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

// Generate unique ticket number: TKT-YYYY-NNNN
async function generateTicketNumber() {
  const year = new Date().getFullYear()
  const prefix = `TKT-${year}-`
  
  const lastTicket = await prisma.ticket.findFirst({
    where: {
      ticketNumber: {
        startsWith: prefix
      }
    },
    orderBy: {
      ticketNumber: 'desc'
    }
  })
  
  let sequence = 1
  if (lastTicket) {
    const lastSequence = parseInt(lastTicket.ticketNumber.split('-')[2] || '0')
    sequence = lastSequence + 1
  }
  
  return `${prefix}${sequence.toString().padStart(4, '0')}`
}

// Parse email body - handles both plain text and HTML
function parseEmailBody(text, html) {
  // Prefer HTML if available, strip HTML tags for plain text version
  if (html) {
    // Remove HTML tags but preserve line breaks
    const plainText = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim()
    
    return {
      html,
      text: plainText || text || ''
    }
  }
  
  return {
    html: text ? text.replace(/\n/g, '<br>') : '',
    text: text || ''
  }
}

// Extract email thread information
function extractThreadInfo(headers) {
  const messageId = headers['message-id'] || headers['Message-ID'] || headers.messageId
  const inReplyTo = headers['in-reply-to'] || headers['In-Reply-To'] || headers.inReplyTo
  const references = headers['references'] || headers['References'] || headers.references
  
  // Use In-Reply-To or References to find the thread
  const threadId = inReplyTo || (references ? references.split(' ')[0] : null) || messageId
  
  return {
    messageId: messageId?.replace(/[<>]/g, ''),
    threadId: threadId?.replace(/[<>]/g, ''),
    inReplyTo: inReplyTo?.replace(/[<>]/g, ''),
    references: references
  }
}

// Find existing ticket by email thread
async function findTicketByThread(threadId, messageId, fromEmail) {
  if (!threadId && !messageId) return null
  
  // Try to find by thread ID first
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
  
  // Try to find by message ID
  if (messageId) {
    const ticket = await prisma.ticket.findFirst({
      where: {
        emailMessageId: messageId
      },
      orderBy: { createdAt: 'desc' }
    })
    
    if (ticket) return ticket
  }
  
  return null
}

// Find or create user by email
async function findOrCreateUserByEmail(email, name) {
  // Try to find existing user
  let user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() }
  })
  
  // If not found, create a guest user for external email senders
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

// Parse attachments from email
function parseAttachments(attachments, files) {
  const parsed = []
  
  // Handle different webhook formats
  const attachmentList = attachments || files || []
  
  for (const att of attachmentList) {
    if (typeof att === 'string') {
      // Simple string format
      parsed.push({
        filename: att,
        url: att,
        size: 0,
        type: 'application/octet-stream'
      })
    } else if (att && typeof att === 'object') {
      // Object format
      parsed.push({
        filename: att.filename || att.name || 'attachment',
        url: att.url || att.path || '',
        size: att.size || att.length || 0,
        type: att.type || att.contentType || 'application/octet-stream'
      })
    }
  }
  
  return parsed
}

// Main webhook handler
async function handler(req, res) {
  try {
    // Support multiple webhook formats (SendGrid, Mailgun, Resend)
    let emailData = {}
    
    // SendGrid Inbound Parse format
    if (req.body && req.body.headers) {
      emailData = {
        from: req.body.from || req.body.envelope?.from,
        to: req.body.to || req.body.envelope?.to,
        subject: req.body.subject || req.body['subject'],
        text: req.body.text || req.body['text'],
        html: req.body.html || req.body['html'],
        headers: req.body.headers || {},
        attachments: req.body.attachments || [],
        spamScore: req.body.spam_score,
        spamReport: req.body.spam_report
      }
    }
    // Mailgun format
    else if (req.body && (req.body['sender'] || req.body.sender)) {
      emailData = {
        from: req.body.sender || req.body['sender'],
        to: req.body.recipient || req.body['recipient'],
        subject: req.body.subject || req.body['subject'],
        text: req.body['body-plain'] || req.body['body-plain'],
        html: req.body['body-html'] || req.body['body-html'],
        headers: {
          'Message-ID': req.body['Message-Id'] || req.body['message-id'],
          'In-Reply-To': req.body['In-Reply-To'] || req.body['in-reply-to'],
          'References': req.body['References'] || req.body['references']
        },
        attachments: req.body.attachments || []
      }
    }
    // Resend webhook format
    else if (req.body && req.body.type === 'email.received') {
      const record = req.body.record || {}
      emailData = {
        from: record.from?.email || record.from,
        to: record.to?.[0]?.email || record.to,
        subject: record.subject,
        text: record.text,
        html: record.html,
        headers: record.headers || {},
        attachments: record.attachments || []
      }
    }
    // Generic format (try to extract from body)
    else {
      emailData = {
        from: req.body.from || req.body.sender,
        to: req.body.to || req.body.recipient,
        subject: req.body.subject,
        text: req.body.text || req.body.body,
        html: req.body.html || req.body['body-html'],
        headers: req.body.headers || {},
        attachments: req.body.attachments || req.body.files || []
      }
    }
    
    // Validate required fields
    if (!emailData.from || !emailData.subject) {
      console.error('❌ Missing required email fields:', {
        hasFrom: !!emailData.from,
        hasSubject: !!emailData.subject,
        bodyKeys: Object.keys(req.body || {})
      })
      return badRequest(res, 'Missing required email fields: from, subject')
    }
    
    // Extract email addresses
    const fromMatch = emailData.from.match(/<?([^<>]+@[^<>]+)>?/) || [null, emailData.from]
    const fromEmail = fromMatch[1]?.trim().toLowerCase()
    const fromName = emailData.from.replace(/<[^>]+>/, '').trim() || fromEmail.split('@')[0]
    
    // Check if email is to support@abcotronics.co.za
    const toEmail = (emailData.to || '').toLowerCase()
    if (!toEmail.includes('support@abcotronics.co.za') && !toEmail.includes('helpdesk')) {
      console.log('⚠️ Email not to support address, ignoring:', toEmail)
      return ok(res, { message: 'Email not to support address, ignored' })
    }
    
    // Extract thread information
    const threadInfo = extractThreadInfo(emailData.headers)
    
    // Parse email body
    const body = parseEmailBody(emailData.text, emailData.html)
    
    // Parse attachments
    const attachments = parseAttachments(emailData.attachments, req.body.files)
    
    // Find or create user
    const user = await findOrCreateUserByEmail(fromEmail, fromName)
    
    // Check if this is a reply to an existing ticket
    const existingTicket = await findTicketByThread(
      threadInfo.threadId,
      threadInfo.messageId,
      fromEmail
    )
    
    if (existingTicket) {
      // This is a reply - add as comment
      console.log(`📧 Email reply to ticket ${existingTicket.ticketNumber}`)
      
      const comments = JSON.parse(existingTicket.comments || '[]')
      comments.push({
        userId: user.id,
        userName: user.name || user.email,
        message: body.text,
        html: body.html,
        timestamp: new Date().toISOString(),
        source: 'email',
        emailMessageId: threadInfo.messageId
      })
      
      // Update activity log
      const activityLog = JSON.parse(existingTicket.activityLog || '[]')
      activityLog.push({
        action: 'email_reply',
        userId: user.id,
        userName: user.name || user.email,
        timestamp: new Date().toISOString(),
        details: {
          emailFrom: fromEmail,
          emailSubject: emailData.subject
        }
      })
      
      // Update ticket
      await prisma.ticket.update({
        where: { id: existingTicket.id },
        data: {
          comments: JSON.stringify(comments),
          activityLog: JSON.stringify(activityLog),
          updatedAt: new Date()
        }
      })
      
      return ok(res, {
        message: 'Email reply added to ticket',
        ticketNumber: existingTicket.ticketNumber,
        ticketId: existingTicket.id
      })
    } else {
      // This is a new email - create ticket
      console.log(`📧 Creating new ticket from email: ${fromEmail}`)
      
      const ticketNumber = await generateTicketNumber()
      
      // Parse attachments
      const attachmentsJson = JSON.stringify(attachments)
      
      // Create activity log entry
      const activityLog = [{
        action: 'created',
        userId: user.id,
        userName: user.name || user.email,
        timestamp: new Date().toISOString(),
        details: {
          source: 'email',
          emailFrom: fromEmail,
          emailSubject: emailData.subject
        }
      }]
      
      // Create ticket
      const ticket = await prisma.ticket.create({
        data: {
          ticketNumber,
          title: emailData.subject,
          description: body.text,
          status: 'open',
          priority: 'medium',
          category: 'general',
          type: 'email',
          createdById: user.id,
          sourceEmail: fromEmail,
          emailThreadId: threadInfo.threadId,
          emailMessageId: threadInfo.messageId,
          emailSubject: emailData.subject,
          attachments: attachmentsJson,
          comments: JSON.stringify([]),
          activityLog: JSON.stringify(activityLog),
          customFields: JSON.stringify({})
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      })
      
      console.log(`✅ Ticket created from email: ${ticket.ticketNumber}`)
      
      return ok(res, {
        message: 'Ticket created from email',
        ticketNumber: ticket.ticketNumber,
        ticketId: ticket.id
      })
    }
  } catch (error) {
    console.error('❌ Error processing email webhook:', error)
    console.error('❌ Error stack:', error.stack)
    console.error('❌ Request body:', JSON.stringify(req.body, null, 2))
    
    return serverError(res, 'Failed to process email', error.message)
  }
}

export default withLogging(withHttp(handler))

