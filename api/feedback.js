import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
// Note: We'll use sendNotificationEmail from email.js

// Notify admins when feedback is submitted
async function notifyAdminsOfFeedback(feedback, submittingUser) {
  try {
    console.log('📧 Starting feedback email notification process...')
    
    // Get all admin users (case-insensitive role check)
    const admins = await prisma.user.findMany({
      where: {
        OR: [
          { role: 'admin' },
          { role: 'ADMIN' },
          { role: 'Admin' }
        ],
        status: {
          in: ['active', 'Active', 'ACTIVE']
        }
      },
      select: {
        email: true,
        name: true,
        role: true,
        status: true
      }
    })
    
    // Filter out admins without email addresses
    const adminsWithEmail = admins.filter(admin => admin.email && admin.email.trim())

    if (adminsWithEmail.length === 0) {
      console.warn('⚠️ No admin users found for feedback notification. Feedback was still saved.')
      console.warn('   Searched for users with role: admin/ADMIN/Admin and status: active')
      console.warn('   Found admins:', admins.length, '| With emails:', adminsWithEmail.length)
      if (admins.length > 0) {
        console.warn('   Admin users found but no email addresses:', admins.map(a => ({ email: a.email, role: a.role, status: a.status })))
      }
      return
    }

    console.log(`📧 Found ${adminsWithEmail.length} admin(s) to notify:`, adminsWithEmail.map(a => a.email).join(', '))

    // Prepare email content
    const userName = submittingUser?.name || submittingUser?.email || 'A user'
    const section = feedback.section || 'general'
    const typeLabel = feedback.type === 'bug' ? '🐛 Bug Report' : 
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
    
    // Send email to all admins
    let successCount = 0
    let failureCount = 0
    
    const emailPromises = adminsWithEmail.map(async (admin) => {
      try {
        console.log(`📧 Attempting to send feedback email to ${admin.email}...`)
        const result = await sendNotificationEmail(
          admin.email,
          subject,
          htmlContent
        )
        console.log(`✅ Feedback email sent successfully to ${admin.email}:`, result.messageId)
        successCount++
        return { success: true, email: admin.email }
      } catch (emailError) {
        console.error(`❌ Failed to send feedback email to ${admin.email}:`, emailError.message)
        console.error('❌ Feedback email error details:', {
          message: emailError.message,
          code: emailError.code,
          response: emailError.response,
          to: admin.email
        })
        if (emailError.stack) {
          console.error('❌ Feedback email error stack:', emailError.stack)
        }
        failureCount++
        return { success: false, email: admin.email, error: emailError.message }
      } catch (err) {
        console.error(`❌ Failed to send feedback notification to ${admin.email}:`, err.message)
        console.error(`❌ Error details:`, {
          code: err.code,
          command: err.command,
          response: err.response,
          stack: err.stack
        })
        failureCount++
        return { success: false, email: admin.email, error: err.message }
      }
    })

    const results = await Promise.all(emailPromises)
    
    console.log(`📧 Feedback email notification summary:`)
    console.log(`   ✅ Successfully sent: ${successCount}`)
    console.log(`   ❌ Failed: ${failureCount}`)
    console.log(`   Total admins found: ${admins.length}`)
    console.log(`   Admins with email: ${adminsWithEmail.length}`)
    
    if (failureCount > 0) {
      console.error(`⚠️ Some feedback emails failed to send. Check email configuration:`)
      console.error(`   - SMTP_HOST: ${process.env.SMTP_HOST || 'NOT SET'}`)
      console.error(`   - SENDGRID_API_KEY: ${process.env.SENDGRID_API_KEY ? 'SET (hidden)' : 'NOT SET'}`)
      console.error(`   - SMTP_PASS: ${process.env.SMTP_PASS ? (process.env.SMTP_PASS.startsWith('SG.') ? 'SET (SendGrid key detected)' : 'SET (hidden)') : 'NOT SET'}`)
      console.error(`   - SMTP_USER: ${process.env.SMTP_USER || 'NOT SET'}`)
      console.error(`   - EMAIL_FROM: ${process.env.EMAIL_FROM || 'NOT SET'}`)
    }
  } catch (error) {
    console.error('❌ Error in notifyAdminsOfFeedback:', error)
    console.error('❌ Stack trace:', error.stack)
    // Don't throw - this is non-critical, but log it thoroughly
  }
}

async function handler(req, res) {
  try {
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
    const pathSegments = urlPath.split('/').filter(Boolean)

    // GET /api/feedback -> list feedback with optional filtering
    if (req.method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'feedback') {
      try {
        const pageUrl = queryParams.pageUrl
        const section = queryParams.section
        const includeUser = queryParams.includeUser === 'true'

        const where = {}
        if (pageUrl) where.pageUrl = pageUrl
        if (section) where.section = section

        const selectFields = {
          id: true,
          userId: true,
          pageUrl: true,
          section: true,
          message: true,
          type: true,
          severity: true,
          meta: true,
          createdAt: true
        }

        if (includeUser) {
          selectFields.user = {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true
            }
          }
        }

        const feedback = await prisma.feedback.findMany({
          where,
          select: selectFields,
          orderBy: { createdAt: 'desc' },
          take: pageUrl && section ? 50 : 200 // More results for specific sections
        })
        return ok(res, feedback)
      } catch (e) {
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
        console.log('📝 Feedback created, triggering email notification...')
        console.log('📝 Feedback data:', {
          id: createdItem.id,
          userId: createdItem.userId,
          section: createdItem.section,
          submittingUser: req.user ? { 
            id: req.user.sub, 
            email: req.user.email, 
            name: req.user.name 
          } : 'not logged in'
        })
        
        notifyAdminsOfFeedback(createdItem, req.user)
          .then(() => {
            console.log('✅ Feedback notification process completed')
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

    return badRequest(res, 'Invalid feedback request')
  } catch (e) {
    return serverError(res, 'Feedback handler failed', e.message)
  }
}

export default withHttp(withLogging(handler))


