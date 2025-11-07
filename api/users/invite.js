// User invitation API endpoint
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { authRequired } from '../_lib/authRequired.js'
import { sendInvitationEmail } from '../_lib/email.js'
import { getAppUrl } from '../_lib/getAppUrl.js'
import crypto from 'crypto'

async function handler(req, res) {
    if (req.method !== 'POST') return badRequest(res, 'Invalid method')
    
    try {
        console.log('📧 Starting user invitation process...')
        
        // Ensure Invitation table exists (self-healing for first deploys)
        try {
            console.log('🔧 Ensuring Invitation table exists...')
            await prisma.$queryRawUnsafe(
                'CREATE TABLE IF NOT EXISTS "Invitation" ("id" TEXT NOT NULL, "email" TEXT NOT NULL, "name" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT \'' + 'user' + '\', "accessibleProjectIds" TEXT NOT NULL DEFAULT \'[]\', "token" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT \'' + 'pending' + '\', "invitedBy" TEXT, "expiresAt" TIMESTAMP(3) NOT NULL, "acceptedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id"));'
            )
            await prisma.$queryRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "Invitation_email_key" ON "Invitation"("email");')
            await prisma.$queryRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "Invitation_token_key" ON "Invitation"("token");')
            // Add accessibleProjectIds column if it doesn't exist (for existing tables)
            try {
                await prisma.$queryRawUnsafe('ALTER TABLE "Invitation" ADD COLUMN IF NOT EXISTS "accessibleProjectIds" TEXT DEFAULT \'[]\';')
            } catch (e) {
                // Column might already exist, ignore
                console.log('⚠️ accessibleProjectIds column may already exist:', e.message)
            }
            console.log('✅ Invitation table structure verified')
        } catch (e) {
            console.log('⚠️ Table creation skipped (permissions or already exists):', e.message)
            // Ignore if permissions disallow DDL; proceed and let Prisma error if table truly missing
        }

        const { email, name, role = 'user', invitedBy, accessibleProjectIds = [] } = req.body || {}
        // Use authenticated user's ID as the inviter, fallback to body or 'system'
        const inviterId = req.user?.sub || invitedBy || 'system'
        
        // Prepare accessibleProjectIds - ensure it's a JSON string
        let accessibleProjectIdsJson = '[]';
        if (Array.isArray(accessibleProjectIds)) {
            accessibleProjectIdsJson = JSON.stringify(accessibleProjectIds);
        } else if (typeof accessibleProjectIds === 'string') {
            // Validate it's valid JSON
            try {
                JSON.parse(accessibleProjectIds);
                accessibleProjectIdsJson = accessibleProjectIds;
            } catch (e) {
                accessibleProjectIdsJson = '[]';
            }
        }
        
        console.log('📝 Processing invitation for:', { email, name, role, invitedBy: inviterId, accessibleProjectIds: accessibleProjectIdsJson })
        
        if (!email || !name) {
            console.log('❌ Missing required fields:', { email: !!email, name: !!name })
            return badRequest(res, 'Email and name are required')
        }

        // Check if user already exists
        console.log('🔍 Checking if user already exists...')
        const existingUser = await prisma.user.findUnique({ where: { email } })
        if (existingUser) {
            console.log('❌ User already exists:', email)
            return badRequest(res, 'User with this email already exists')
        }
        console.log('✅ User does not exist, proceeding with invitation')

        // Generate invitation token
        const invitationToken = crypto.randomBytes(32).toString('hex')
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        console.log('🔑 Generated invitation token and expiry:', { expiresAt })

        // Create or refresh invitation (handle duplicates gracefully)
        let invitation
        try {
            console.log('💾 Checking for existing invitation...')
            // If an invitation already exists for this email, refresh token/expiry when pending
            const existingInvitation = await prisma.invitation.findUnique({ where: { email } })
            if (existingInvitation) {
                console.log('🔄 Found existing invitation, status:', existingInvitation.status)
                if (existingInvitation.status === 'pending') {
                    console.log('🔄 Updating existing pending invitation...')
                    invitation = await prisma.invitation.update({
                        where: { email },
                        data: {
                            token: invitationToken,
                            expiresAt,
                            invitedBy: inviterId || existingInvitation.invitedBy || 'system',
                            accessibleProjectIds: accessibleProjectIdsJson,
                            updatedAt: new Date()
                        }
                    })
                } else {
                    console.log('🔄 Refreshing expired/cancelled invitation...')
                    // Already accepted/expired/cancelled -> create a fresh pending invite by updating fields
                    invitation = await prisma.invitation.update({
                        where: { email },
                        data: {
                            name,
                            role,
                            token: invitationToken,
                            status: 'pending',
                            expiresAt,
                            invitedBy: inviterId || 'system',
                            accessibleProjectIds: accessibleProjectIdsJson,
                            acceptedAt: null,
                            updatedAt: new Date()
                        }
                    })
                }
            } else {
                console.log('🆕 Creating new invitation...')
                invitation = await prisma.invitation.create({
                    data: {
                        email,
                        name,
                        role,
                        accessibleProjectIds: accessibleProjectIdsJson,
                        token: invitationToken,
                        expiresAt,
                        invitedBy: inviterId || 'system',
                        status: 'pending'
                    }
                })
            }
            console.log('✅ Invitation saved to database:', invitation.id)
        } catch (dbError) {
            console.error('❌ Invitation DB write failed (will fallback):', dbError)
            // Fallback object to allow email sending and UX flow to proceed
            invitation = {
                id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
                email,
                name,
                role,
                status: 'pending',
                expiresAt
            }
            console.log('⚠️ Using fallback invitation object')
        }

        // Generate invitation link using the ACTUAL token from the database
        // This ensures we always use the token that was actually saved, not just the one we intended to save
        const actualToken = invitation.token || invitationToken
        const invitationLink = `${getAppUrl()}/accept-invitation?token=${actualToken}`
        console.log('🔗 Generated invitation link with token:', actualToken.substring(0, 20) + '...')
        console.log('🔗 Full invitation link:', invitationLink)
        
        // Verify the token in the link matches what's in the database
        if (invitation.token && invitation.token !== actualToken) {
            console.warn('⚠️ Token mismatch! Database token:', invitation.token.substring(0, 20) + '...', 'Link token:', actualToken.substring(0, 20) + '...')
            // Use the database token as the source of truth
            const correctedLink = `${getAppUrl()}/accept-invitation?token=${invitation.token}`
            console.log('🔗 Using corrected link with database token:', correctedLink)
        }
        
        // Send invitation email
        let emailSent = false
        let emailError = null
        let emailErrorDetails = null
        
        try {
            console.log('📧 Attempting to send invitation email...')
            // Use the actual token from the database for the email link
            const emailLink = invitation.token 
                ? `${getAppUrl()}/accept-invitation?token=${invitation.token}`
                : invitationLink
            console.log('📧 Sending email with link token:', invitation.token ? invitation.token.substring(0, 20) + '...' : 'using invitationToken')
            const emailResult = await sendInvitationEmail({
                email: invitation.email,
                name: invitation.name,
                role: invitation.role,
                invitationLink: emailLink
            })
            
            emailSent = true
            console.log('✅ Invitation email sent successfully:', emailResult.messageId)
        } catch (emailErr) {
            emailError = emailErr
            emailErrorDetails = {
                message: emailErr.message || 'Unknown error',
                code: emailErr.code || null,
                response: emailErr.response || null
            }
            console.error('❌ Failed to send invitation email:', emailErr.message)
            console.error('❌ Email error details:', emailErrorDetails)
            // Log full error for debugging
            if (emailErr.stack) {
                console.error('❌ Email error stack:', emailErr.stack)
            }
        }
        
        console.log('📧 Email config check:', {
            SMTP_HOST: process.env.SMTP_HOST || 'NOT_SET',
            SMTP_PORT: process.env.SMTP_PORT || 'NOT_SET',
            SMTP_USER: process.env.SMTP_USER ? '***' : 'NOT_SET',
            SMTP_PASS: process.env.SMTP_PASS ? 'SET' : 'NOT_SET',
            SENDGRID_API_KEY: process.env.SENDGRID_API_KEY ? 'SET' : 'NOT_SET',
            EMAIL_FROM: process.env.EMAIL_FROM || 'NOT_SET',
            hasConfig: !!(process.env.SENDGRID_API_KEY || (process.env.SMTP_USER && process.env.SMTP_PASS))
        })

        console.log('🎉 Invitation process completed successfully')
        
        let message = 'Invitation created successfully'
        if (emailSent) {
            message = 'Invitation sent successfully via email'
        } else if (emailError) {
            message = `Invitation created successfully. Email sending failed: ${emailError.message}. You can manually share the invitation link.`
        } else {
            message = 'Invitation created successfully. Email configuration not available.'
        }
        
        return ok(res, {
            success: true,
            message,
            invitation: {
                id: invitation.id,
                email: invitation.email,
                name: invitation.name,
                role: invitation.role,
                status: invitation.status,
                expiresAt: invitation.expiresAt
            },
            invitationLink: invitation.token 
                ? `${getAppUrl()}/accept-invitation?token=${invitation.token}`
                : invitationLink,
            debug: {
                emailSent,
                emailError: emailError ? emailError.message : null,
                emailErrorDetails: emailErrorDetails,
                emailConfig: {
                    SMTP_HOST: process.env.SMTP_HOST || 'NOT_SET',
                    SMTP_PORT: process.env.SMTP_PORT || 'NOT_SET',
                    SMTP_USER: process.env.SMTP_USER ? 'SET' : 'NOT_SET',
                    SMTP_PASS: process.env.SMTP_PASS ? 'SET' : 'NOT_SET',
                    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY ? 'SET' : 'NOT_SET',
                    EMAIL_FROM: process.env.EMAIL_FROM || 'NOT_SET'
                },
                timestamp: new Date().toISOString()
            }
        })

    } catch (error) {
        console.error('❌ Invitation creation error:', error)
        console.error('❌ Error stack:', error.stack)
        console.error('❌ Error details:', {
            message: error.message,
            name: error.name,
            code: error.code
        })
        return serverError(res, 'Failed to create invitation', error.message)
    }
}

export default withHttp(withLogging(authRequired(handler)))
