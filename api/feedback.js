import { prisma } from './_lib/prisma.js'
import { badRequest, created, forbidden, notFound, ok, serverError, unauthorized } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { verifyToken } from './_lib/jwt.js'
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

    const subject = `New ${feedback.type} on ${section} - ${process.env.APP_NAME || 'Abcotronics ERP'}`
    
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
            
            <div style="background: #f8f9fa; border-left: 4px solid #667eea; padding: 15px; margin: 15px 0; border-radius: 4px;">
              <p style="color: #555; margin: 0; white-space: pre-wrap;">${feedback.message}</p>
            </div>
          </div>
          
          <div style="background: #e9ecef; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="color: #666; margin: 0; font-size: 14px;">
              <strong>Review this feedback:</strong> Log into your ERP system and check the Reports section or visit the specific page mentioned above.
            </p>
          </div>
          
          <p style="color: #555; line-height: 1.6; margin-top: 20px;">
            This is an automated notification from your ERP system.
          </p>
        </div>
        
        <div style="background: #343a40; color: white; padding: 20px; text-align: center; font-size: 12px;">
          <p style="margin: 0;">© 2024 ${process.env.APP_NAME || 'Abcotronics'}. All rights reserved.</p>
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
          notificationLink: feedback.pageUrl || '/feedback',
          notificationMetadata: {
            feedbackId: feedback.id,
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

// Notify the feedback author when an admin replies (send email to the person who submitted the feedback)
async function notifyFeedbackAuthorOfReply(feedback, reply, replyingUser) {
  try {
    const authorEmail = feedback?.user?.email
    if (!authorEmail || !authorEmail.trim()) {
      return
    }
    // Don't email the replier if they replied to their own feedback
    const replierEmail = (replyingUser?.email || '').trim().toLowerCase()
    if (replierEmail && authorEmail.trim().toLowerCase() === replierEmail) {
      return
    }

    const authorName = escapeHtml(feedback?.user?.name || feedback?.user?.email || 'there')
    const replierName = escapeHtml(replyingUser?.name || replyingUser?.email || 'An administrator')
    const appName = process.env.APP_NAME || 'Abcotronics ERP'
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
            View all feedback and replies in <strong>Reports</strong> in the ERP.
          </p>
        </div>
        <div style="background: #343a40; color: white; padding: 20px; text-align: center; font-size: 12px;">
          <p style="margin: 0;">© ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
        </div>
      </div>
    `

    const { sendNotificationEmail } = await import('./_lib/email.js')
    await sendNotificationEmail(
      authorEmail,
      subject,
      htmlContent,
      {
        skipNotificationCreation: true,
        notificationLink: '/reports'
      }
    )
    console.log(`✅ Feedback reply email sent to ${authorEmail}`)
  } catch (err) {
    console.error('❌ Failed to send feedback reply email:', err?.message || err)
    // Non-critical; do not throw
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

    const isAdminUser = (user) => {
      if (!user) return false
      const role = (user.role || '').toString().trim().toLowerCase()
      return role === 'admin' || role === 'superadmin'
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

        const where = {}
        if (pageUrl) where.pageUrl = pageUrl
        if (section) where.section = section

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

    // PATCH /api/feedback/:id -> update type or status (admin only)
    if (req.method === 'PATCH' && pathSegments.length === 2 && pathSegments[0] === 'feedback') {
      const feedbackId = pathSegments[1]
      if (!feedbackId) return badRequest(res, 'feedbackId required')
      if (!req.user) return unauthorized(res, 'Authentication required')
      const currentUser = await ensureUserLoaded()
      if (!isAdminUser(currentUser)) {
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
        const updated = await prisma.feedback.update({
          where: { id: feedbackId },
          data: updates
        })
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
      if (!isAdminUser(currentUser)) {
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


