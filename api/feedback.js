import { prisma } from './_lib/prisma.js'
import { getAppUrl } from './_lib/getAppUrl.js'
import { badRequest, created, forbidden, notFound, ok, serverError, unauthorized } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { verifyToken } from './_lib/jwt.js'
import { isAdminRole } from './_lib/authRoles.js'
// Note: We'll use sendNotificationEmail from email.js

// Notify admins when feedback is submitted
async function notifyAdminsOfFeedback(feedback, submittingUser) {
  try {
    // Send email only to garethm@abcotronics.co.za
    const recipientEmail = 'garethm@abcotronics.co.za'

    if (!recipientEmail || !recipientEmail.trim()) {
      console.warn('⚠️ No feedback notification recipient configured. Feedback was still saved.')
      return
    }


    // Prepare email content
    const userName = submittingUser?.name || submittingUser?.email || 'A user'
    const section = feedback.section || 'general'
    const typeLabel = feedback.type === 'bug' ? '🐛 Bug Report' :
                     feedback.type === 'development_request' ? '📋 Development Request' :
                     feedback.type === 'idea' ? '💡 Idea' : '💬 Feedback'
    const severityLabel = feedback.severity === 'high' ? '🔴 High' :
                         feedback.severity === 'medium' ? '🟡 Medium' : '🟢 Low'

    let hasScreenshot = false
    try {
      if (feedback.meta) {
        const m = typeof feedback.meta === 'string' ? JSON.parse(feedback.meta) : feedback.meta
        hasScreenshot = Boolean(m?.screenshotDataUrl && String(m.screenshotDataUrl).startsWith('data:image/'))
      }
    } catch (_) {
      hasScreenshot = false
    }

    const subject = `New ${feedback.type} on ${section} - ${process.env.APP_NAME || 'Abcotronics ERP'}`
    const appBase = getAppUrl().replace(/\/$/, '')
    const erpFeedbackUrl = `${appBase}/#/reports?tab=feedback&highlightFeedbackId=${encodeURIComponent(feedback.id)}`

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">${typeLabel}</h1>
        </div>
        
        <div style="padding: 30px; background: #f8f9fa;">
          <h2 style="color: #333; margin-bottom: 20px;">New Feedback Submitted</h2>
          
          <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="color: #333; margin-bottom: 10px;"><strong>Submitted by:</strong> ${userName}</p>
            <p style="color: #333; margin-bottom: 10px;"><strong>Section:</strong> ${section}</p>
            <p style="color: #333; margin-bottom: 10px;"><strong>Page:</strong> ${feedback.pageUrl}</p>
            <p style="color: #333; margin-bottom: 10px;"><strong>Severity:</strong> ${severityLabel}</p>
            <p style="color: #333; margin-bottom: 10px;"><strong>Type:</strong> ${feedback.type}</p>
            ${hasScreenshot ? '<p style="color: #333; margin-bottom: 10px;"><strong>Screenshot:</strong> Included — open <strong>Reports → User Feedback</strong> in the ERP to view the image.</p>' : ''}
            
            <div style="background: #f8f9fa; border-left: 4px solid #667eea; padding: 15px; margin: 15px 0; border-radius: 4px;">
              <p style="color: #555; margin: 0; white-space: pre-wrap;">${feedback.message}</p>
            </div>
          </div>
          
          <div style="background: #e9ecef; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="color: #666; margin: 0; font-size: 14px;">
              <strong>Open in ERP:</strong> <a href="${erpFeedbackUrl}" style="color:#667eea;">Reports → User feedback</a> (this item is highlighted).
            </p>
          </div>
          
          <p style="color: #555; line-height: 1.6; margin-top: 20px;">
            This is an automated notification from your ERP system.
          </p>
        </div>
      </div>
    `

    // Import sendNotificationEmail dynamically to avoid circular deps
    const { sendNotificationEmail } = await import('./_lib/email.js')
    
    // Find admin user by email to get userId for notification
    let adminUserId = null;
    try {
      const adminUser = await prisma.user.findUnique({
        where: { email: recipientEmail }
      });
      if (adminUser) {
        adminUserId = adminUser.id;
      }
    } catch (userError) {
      console.warn(`⚠️ Could not find admin user with email ${recipientEmail} for notification:`, userError.message);
    }
    
    // Send email to garethm@abcotronics.co.za
    // Also create in-app notification if admin user found
    try {
      const result = await sendNotificationEmail(
        recipientEmail,
        subject,
        htmlContent,
        {
          userId: adminUserId || recipientEmail, // Pass userId or email (will look up if email)
          notificationType: 'system',
          notificationLink: erpFeedbackUrl,
          notificationMetadata: {
            feedbackId: feedback.id,
            source: 'feedback_submitted',
            feedbackType: feedback.type,
            feedbackSection: feedback.section,
            pageUrl: feedback.pageUrl,
            submittingUserId: submittingUser?.id || submittingUser?.sub || null,
            submittingUserName: submittingUser?.name || submittingUser?.email || 'A user'
          }
        }
      )
      console.log(`✅ Feedback email sent successfully to ${recipientEmail}`)
      if (adminUserId) {
        console.log(`✅ In-app notification created for admin user ${adminUserId}`)
      }
    } catch (emailError) {
      console.error(`❌ Failed to send feedback email to ${recipientEmail}:`, emailError.message)
      console.error('❌ Feedback email error details:', {
        message: emailError.message,
        code: emailError.code,
        command: emailError.command,
        response: emailError.response,
        to: recipientEmail,
        stack: emailError.stack
      })
      if (emailError.stack) {
        console.error('❌ Feedback email error stack:', emailError.stack)
      }
    }
  } catch (error) {
    console.error('❌ Error in notifyAdminsOfFeedback:', error)
    console.error('❌ Stack trace:', error.stack)
    // Don't throw - this is non-critical, but log it thoroughly
  }
}

// Escape HTML for safe inclusion in email body
function escapeHtml(text) {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// Build Message-ID for feedback emails so reply-by-email can match
function feedbackMessageId(feedbackId) {
  const domain = (process.env.FEEDBACK_INBOUND_DOMAIN || process.env.EMAIL_FROM || 'feedback').split('@').pop() || 'feedback'
  return `<feedback-${feedbackId}@${domain}>`
}

// Notify the feedback author when an admin replies (email + in-app)
async function notifyFeedbackAuthorOfReply(feedback, reply, replyingUser) {
  try {
    const authorEmail = feedback?.user?.email
    const authorId = feedback?.user?.id || feedback?.userId
    if (!authorEmail || !authorEmail.trim()) return

    const replierEmail = (replyingUser?.email || '').trim().toLowerCase()
    if (replierEmail && authorEmail.trim().toLowerCase() === replierEmail) return

    const authorName = escapeHtml(feedback?.user?.name || feedback?.user?.email || 'there')
    const replierName = escapeHtml(replyingUser?.name || replyingUser?.email || 'An administrator')
    const appName = process.env.APP_NAME || 'Abcotronics ERP'
    const appBase = getAppUrl().replace(/\/$/, '')
    const erpMyQueriesUrl = `${appBase}/#/reports?tab=my-queries&highlightFeedbackId=${encodeURIComponent(feedback.id)}`
    const subject = `Re: Your feedback – ${appName}`

    const rawMessage = feedback?.message || ''
    const messagePreview = rawMessage.length > 200 ? rawMessage.substring(0, 200) + '...' : rawMessage
    const rawReply = reply?.message || ''
    const replyPreview = rawReply.length > 500 ? rawReply.substring(0, 500) + '...' : rawReply

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">💬 Reply to your feedback</h1>
        </div>
        <div style="padding: 30px; background: #f8f9fa;">
          <p style="color: #333;">Hi ${authorName},</p>
          <p style="color: #555;">${replierName} replied to your feedback:</p>
          <div style="background: #e9ecef; border-radius: 6px; padding: 12px; margin: 16px 0;">
            <p style="color: #555; margin: 0; font-size: 13px;"><strong>Your feedback:</strong></p>
            <p style="color: #333; margin: 8px 0 0; white-space: pre-wrap;">${escapeHtml(messagePreview)}</p>
          </div>
          <div style="background: white; border-left: 4px solid #667eea; padding: 16px; margin: 16px 0; border-radius: 4px;">
            <p style="color: #555; margin: 0; font-size: 13px;"><strong>Reply from ${replierName}:</strong></p>
            <p style="color: #333; margin: 8px 0 0; white-space: pre-wrap;">${escapeHtml(replyPreview)}</p>
          </div>
          <p style="color: #666; font-size: 14px;">
            <a href="${erpMyQueriesUrl}" style="color:#667eea;">Open in ERP — Reports → My queries</a> (this thread is highlighted). You can reply to this email to add another comment.
          </p>
        </div>
      </div>
    `

    const messageId = feedbackMessageId(feedback.id)
    const customHeaders = { 'Message-ID': messageId }
    const replyToEmail = process.env.FEEDBACK_REPLY_EMAIL || process.env.EMAIL_REPLY_TO || null

    const { sendNotificationEmail } = await import('./_lib/email.js')
    await sendNotificationEmail(
      authorEmail,
      subject,
      htmlContent,
      {
        userId: authorId || authorEmail,
        notificationType: 'system',
        notificationLink: erpMyQueriesUrl,
        notificationMetadata: { feedbackId: feedback.id, source: 'feedback_reply' },
        customHeaders,
        replyTo: replyToEmail
      }
    )

    const messageIdRaw = messageId.replace(/^<|>$/g, '').trim()
    await prisma.feedbackEmailSent.upsert({
      where: { messageId: messageIdRaw },
      create: { messageId: messageIdRaw, feedbackId: feedback.id },
      update: {}
    })
    console.log(`✅ Feedback reply email and in-app notification sent to ${authorEmail}`)
  } catch (err) {
    console.error('❌ Failed to send feedback reply notification:', err?.message || err)
  }
}

// Notify the feedback author when type or status changes (email + in-app)
async function notifyFeedbackAuthorOfChange(feedback, changeType, oldVal, newVal, changedBy) {
  try {
    const authorEmail = feedback?.user?.email
    const authorId = feedback?.user?.id || feedback?.userId
    if (!authorEmail || !authorEmail.trim()) return

    const appName = process.env.APP_NAME || 'Abcotronics ERP'
    const appBase = getAppUrl().replace(/\/$/, '')
    const erpMyQueriesUrl = `${appBase}/#/reports?tab=my-queries&highlightFeedbackId=${encodeURIComponent(feedback.id)}`
    const changerName = changedBy?.name || changedBy?.email || 'An administrator'
    let subject = ''
    let detail = ''

    if (changeType === 'type') {
      subject = `Your feedback was updated: type set to ${newVal} – ${appName}`
      detail = `Type changed from "${oldVal}" to "${newVal}".`
    } else if (changeType === 'status') {
      subject = `Your feedback was marked as ${newVal} – ${appName}`
      detail = `Status changed from "${oldVal}" to "${newVal}".`
    } else return

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">📋 Feedback update</h1>
        </div>
        <div style="padding: 30px; background: #f8f9fa;">
          <p style="color: #333;">Hi ${escapeHtml(feedback?.user?.name || feedback?.user?.email || 'there')},</p>
          <p style="color: #555;">${changerName} updated your feedback.</p>
          <p style="color: #333;">${detail}</p>
          <div style="background: #e9ecef; border-radius: 6px; padding: 12px; margin: 16px 0;">
            <p style="color: #555; margin: 0; font-size: 13px;"><strong>Your feedback:</strong></p>
            <p style="color: #333; margin: 8px 0 0; white-space: pre-wrap;">${escapeHtml((feedback?.message || '').slice(0, 300))}${(feedback?.message || '').length > 300 ? '...' : ''}</p>
          </div>
          <p style="color: #666; font-size: 14px;"><a href="${erpMyQueriesUrl}" style="color:#667eea;">Open in ERP — Reports → My queries</a> (this thread is highlighted).</p>
        </div>
      </div>
    `

    const { sendNotificationEmail } = await import('./_lib/email.js')
    await sendNotificationEmail(
      authorEmail,
      subject,
      htmlContent,
      {
        userId: authorId || authorEmail,
        notificationType: 'system',
        notificationLink: erpMyQueriesUrl,
        notificationMetadata: { feedbackId: feedback.id, source: 'feedback_change', changeType, oldVal, newVal },
        customHeaders: { 'Message-ID': feedbackMessageId(feedback.id) }
      }
    )
    console.log(`✅ Feedback change notification sent to ${authorEmail}`)
  } catch (err) {
    console.error('❌ Failed to send feedback change notification:', err?.message || err)
  }
}

async function handler(req, res) {
  try {
    // Allow optional authentication so we can associate feedback with the submitting user
    if (!req.user) {
      const authHeader = req.headers['authorization'] || ''
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7)
        try {
          const payload = verifyToken(token)
          if (payload && payload.sub) {
            req.user = {
              ...payload,
              id: payload.sub,
              userId: payload.sub, // backwards compatibility with handlers expecting userId
            }
          }
        } catch (tokenError) {
          console.warn('⚠️ Optional feedback auth: failed to verify token:', tokenError.message)
        }
      }
    }

    const ensureUserLoaded = async () => {
      if (req.user?.role) {
        return req.user
      }

      const userId = req.user?.id || req.user?.sub
      if (!userId) {
        return null
      }

      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        })

        if (dbUser) {
          req.user = {
            ...req.user,
            ...dbUser
          }
        }

        return req.user || dbUser
      } catch (userError) {
        console.error('❌ Failed to load user for feedback reply:', userError)
        return null
      }
    }

    // Parse query parameters safely and get path without query string
    const parseQueryParams = (urlString) => {
      const params = {}
      const queryIndex = urlString.indexOf('?')
      if (queryIndex === -1) return { params, path: urlString }
      
      const path = urlString.substring(0, queryIndex)
      const queryString = urlString.substring(queryIndex + 1)
      queryString.split('&').forEach(param => {
        const [key, value] = param.split('=')
        if (key) {
          params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : ''
        }
      })
      return { params, path }
    }

    const { params: queryParams, path: urlPath } = parseQueryParams(req.url)
    const cleanPath = urlPath.split('#')[0].replace(/^\/api\//, '/')
    const pathSegments = cleanPath.split('/').filter(Boolean)

    // GET /api/feedback -> list feedback with optional filtering
    if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'feedback') {
      try {
        const pageUrl = queryParams.pageUrl
        const section = queryParams.section
        const includeUser = queryParams.includeUser === 'true'
        const includeReplies = queryParams.includeReplies === 'true'
        const mine = queryParams.mine === 'true' || queryParams.mine === '1'

        const where = {}
        if (pageUrl) where.pageUrl = pageUrl
        if (section) where.section = section
        if (mine) {
          if (!req.user) return unauthorized(res, 'Authentication required to view your feedback')
          const myId = req.user?.id || req.user?.sub
          if (!myId) return unauthorized(res, 'Authentication required')
          where.userId = myId
        }

        // Build query options - use include for relations, select for fields
        const queryOptions = {
          where,
          orderBy: { createdAt: 'desc' },
          take: pageUrl && section ? 50 : 200 // More results for specific sections
        }

        if (includeUser || includeReplies) {
          queryOptions.include = {}

          if (includeUser) {
            queryOptions.include.user = {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true
              }
            }
          }

          if (includeReplies) {
            queryOptions.include.replies = {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    avatar: true
                  }
                }
              },
              orderBy: { createdAt: 'asc' }
            }
          }
        } else {
          // Use select when not including relations for better performance
          queryOptions.select = {
            id: true,
            userId: true,
            pageUrl: true,
            section: true,
            message: true,
            type: true,
            severity: true,
            status: true,
            meta: true,
            createdAt: true
          }
        }

        const feedback = await prisma.feedback.findMany(queryOptions)
        return ok(res, feedback)
      } catch (e) {
        console.error('❌ Error fetching feedback:', e)
        console.error('❌ Error stack:', e.stack)
        console.error('❌ Query params:', { 
          pageUrl: queryParams.pageUrl, 
          section: queryParams.section, 
          includeUser: queryParams.includeUser 
        })
        return serverError(res, 'Failed to fetch feedback', e.message)
      }
    }

    // POST /api/feedback -> create
    if (req.method === 'POST' && pathSegments.length === 1 && pathSegments[0] === 'feedback') {
      // Try req.body first (Express already parsed it), fallback to parseJsonBody
      let body = req.body
      if (!body || Object.keys(body).length === 0) {
        body = await parseJsonBody(req)
      }
      
      const message = (body.message || '').trim()
      const pageUrl = (body.pageUrl || '').trim()
      const section = (body.section || '').trim()

      if (!message) return badRequest(res, 'message required')
      if (!pageUrl) return badRequest(res, 'pageUrl required')

      // Convert meta object to JSON string if it's an object
      let metaValue = body.meta || null
      if (metaValue && typeof metaValue === 'object') {
        metaValue = JSON.stringify(metaValue)
      }
      const FEEDBACK_META_MAX_LENGTH = 5_242_880 // ~5 MiB — keeps DB payloads reasonable
      if (metaValue != null && typeof metaValue === 'string' && metaValue.length > FEEDBACK_META_MAX_LENGTH) {
        return badRequest(
          res,
          'Feedback attachment is too large. Use a smaller screenshot or a lower-resolution image.'
        )
      }

      const record = {
        userId: req.user?.sub || null,
        pageUrl,
        section,
        message,
        type: body.type || 'feedback',
        severity: body.severity || 'medium',
        meta: metaValue
      }

      try {
        const createdItem = await prisma.feedback.create({ data: record })
        
        // Send email notification to admins (non-blocking)
        // Add explicit logging to ensure function is called
        
        notifyAdminsOfFeedback(createdItem, req.user)
          .then(() => {
          })
          .catch(err => {
          console.error('❌ Failed to send feedback notification:', err)
          console.error('❌ Error stack:', err.stack)
          // Don't fail the request if notification fails
        })
        
        return created(res, createdItem)
      } catch (e) {
        return serverError(res, 'Failed to create feedback', e.message)
      }
    }

    // POST /api/feedback/mark-old-done -> mark all feedback older than 1 week as done (admin only)
    if (req.method === 'POST' && pathSegments.length === 2 && pathSegments[0] === 'feedback' && pathSegments[1] === 'mark-old-done') {
      if (!req.user) return unauthorized(res, 'Authentication required')
      const currentUser = await ensureUserLoaded()
      if (!isAdminRole(currentUser?.role)) return forbidden(res, 'Only administrators can mark old feedback as done')
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        const result = await prisma.feedback.updateMany({
          where: {
            createdAt: { lt: sevenDaysAgo },
            status: 'open'
          },
          data: { status: 'done' }
        })
        return ok(res, { updated: result.count })
      } catch (e) {
        return serverError(res, 'Failed to mark old feedback as done', e.message)
      }
    }

    // PATCH /api/feedback/:id -> update type or status (admin only)
    if (req.method === 'PATCH' && pathSegments.length === 2 && pathSegments[0] === 'feedback') {
      const feedbackId = pathSegments[1]
      if (!feedbackId) return badRequest(res, 'feedbackId required')
      if (!req.user) return unauthorized(res, 'Authentication required')
      const currentUser = await ensureUserLoaded()
      if (!isAdminRole(currentUser?.role)) {
        return forbidden(res, 'Only administrators can update feedback')
      }
      let body = req.body
      if (!body || Object.keys(body).length === 0) body = await parseJsonBody(req)
      const updates = {}
      if (body.type !== undefined) {
        const t = String(body.type).toLowerCase().trim()
        if (['feedback', 'bug', 'idea', 'development_request'].includes(t)) updates.type = t
      }
      if (body.status !== undefined) {
        const s = String(body.status).toLowerCase().trim()
        if (['open', 'done'].includes(s)) updates.status = s
      }
      if (Object.keys(updates).length === 0) return badRequest(res, 'Provide type and/or status to update')
      try {
        const existing = await prisma.feedback.findUnique({
          where: { id: feedbackId },
          include: { user: { select: { id: true, name: true, email: true } } }
        })
        if (!existing) return notFound(res, 'Feedback not found')

        const updated = await prisma.feedback.update({
          where: { id: feedbackId },
          data: updates,
          include: { user: { select: { id: true, name: true, email: true } } }
        })

        if (existing.userId) {
          if (updates.type !== undefined && updates.type !== existing.type) {
            notifyFeedbackAuthorOfChange(updated, 'type', existing.type, updates.type, currentUser).catch(() => {})
          }
          if (updates.status !== undefined && updates.status !== existing.status) {
            notifyFeedbackAuthorOfChange(updated, 'status', existing.status || 'open', updates.status, currentUser).catch(() => {})
          }
        }
        return ok(res, updated)
      } catch (e) {
        if (e.code === 'P2025') return notFound(res, 'Feedback not found')
        return serverError(res, 'Failed to update feedback', e.message)
      }
    }

    // POST /api/feedback/:id/replies -> reply to feedback (admin only)
    if (
      req.method === 'POST' &&
      pathSegments.length === 3 &&
      pathSegments[0] === 'feedback' &&
      pathSegments[2] === 'replies'
    ) {
      const feedbackId = pathSegments[1]

      if (!feedbackId) {
        return badRequest(res, 'feedbackId required')
      }

      if (!req.user) {
        return unauthorized(res, 'Authentication required to reply')
      }

      const currentUser = await ensureUserLoaded()
      if (!isAdminRole(currentUser?.role)) {
        console.warn('⚠️ Non-admin attempted to reply to feedback', {
          userId: currentUser?.id || req.user?.sub,
          email: currentUser?.email || req.user?.email,
          role: currentUser?.role || req.user?.role
        })
        return forbidden(res, 'Only administrators can reply to feedback')
      }

      // Try req.body first, fallback to raw parse
      let body = req.body
      if (!body || Object.keys(body).length === 0) {
        body = await parseJsonBody(req)
      }

      const message = (body?.message || '').trim()
      if (!message) {
        return badRequest(res, 'message required')
      }

      const feedbackItem = await prisma.feedback.findUnique({
        where: { id: feedbackId },
        select: { id: true }
      })

      if (!feedbackItem) {
        return notFound(res, 'Feedback not found')
      }

      try {
        const reply = await prisma.feedbackReply.create({
          data: {
            feedbackId: feedbackItem.id,
            userId: currentUser?.id || req.user?.sub || null,
            message
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true
              }
            }
          }
        })

        // Send email to the person who submitted the feedback (non-blocking)
        prisma.feedback
          .findUnique({
            where: { id: feedbackItem.id },
            include: {
              user: { select: { id: true, name: true, email: true } }
            }
          })
          .then((feedbackWithAuthor) => {
            return notifyFeedbackAuthorOfReply(feedbackWithAuthor, reply, currentUser)
          })
          .catch((err) => {
            console.error('❌ Failed to send feedback reply notification:', err?.message || err)
          })

        return created(res, reply)
      } catch (e) {
        console.error('❌ Failed to save feedback reply:', e)
        return serverError(res, 'Failed to create feedback reply', e.message)
      }
    }

    return badRequest(res, 'Invalid feedback request')
  } catch (e) {
    return serverError(res, 'Feedback handler failed', e.message)
  }
}

export default withHttp(withLogging(handler))


