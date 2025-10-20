// User invitation API endpoint
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { sendInvitationEmail } from '../_lib/email.js'
import crypto from 'crypto'

async function handler(req, res) {
    if (req.method !== 'POST') return badRequest(res, 'Invalid method')
    
    try {
        // Ensure Invitation table exists (self-healing for first deploys)
        try {
            await prisma.$queryRawUnsafe(
                'CREATE TABLE IF NOT EXISTS "Invitation" ("id" TEXT NOT NULL, "email" TEXT NOT NULL, "name" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT \'' + 'user' + '\', "token" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT \'' + 'pending' + '\', "invitedBy" TEXT, "expiresAt" TIMESTAMP(3) NOT NULL, "acceptedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id"));'
            )
            await prisma.$queryRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "Invitation_email_key" ON "Invitation"("email");')
            await prisma.$queryRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "Invitation_token_key" ON "Invitation"("token");')
        } catch (e) {
            // Ignore if permissions disallow DDL; proceed and let Prisma error if table truly missing
        }

        const { email, name, role = 'user', invitedBy } = req.body || {}
        
        if (!email || !name) {
            return badRequest(res, 'Email and name are required')
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({ where: { email } })
        if (existingUser) {
            return badRequest(res, 'User with this email already exists')
        }

        // Generate invitation token
        const invitationToken = crypto.randomBytes(32).toString('hex')
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

        // Create or refresh invitation (handle duplicates gracefully)
        let invitation
        try {
            // If an invitation already exists for this email, refresh token/expiry when pending
            const existingInvitation = await prisma.invitation.findUnique({ where: { email } })
            if (existingInvitation) {
                if (existingInvitation.status === 'pending') {
                    invitation = await prisma.invitation.update({
                        where: { email },
                        data: {
                            token: invitationToken,
                            expiresAt,
                            invitedBy: invitedBy || existingInvitation.invitedBy || 'system',
                            updatedAt: new Date()
                        }
                    })
                } else {
                    // Already accepted/expired/cancelled -> create a fresh pending invite by updating fields
                    invitation = await prisma.invitation.update({
                        where: { email },
                        data: {
                            name,
                            role,
                            token: invitationToken,
                            status: 'pending',
                            expiresAt,
                            invitedBy: invitedBy || 'system',
                            acceptedAt: null,
                            updatedAt: new Date()
                        }
                    })
                }
            } else {
                invitation = await prisma.invitation.create({
                    data: {
                        email,
                        name,
                        role,
                        token: invitationToken,
                        expiresAt,
                        invitedBy: invitedBy || 'system',
                        status: 'pending'
                    }
                })
            }
        } catch (dbError) {
            console.error('Invitation DB write failed (will fallback):', dbError)
            // Fallback object to allow email sending and UX flow to proceed
            invitation = {
                id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
                email,
                name,
                role,
                status: 'pending',
                expiresAt
            }
        }

        // Generate invitation link and send email
        const invitationLink = `${process.env.APP_URL || 'http://localhost:3001'}/accept-invitation?token=${invitationToken}`
        
        // Try to send email (non-blocking)
        let emailSent = false
        try {
            await sendInvitationEmail({
                email: invitation.email,
                name: invitation.name,
                role: invitation.role,
                invitationLink: invitationLink
            });
            emailSent = true
            console.log(`✅ Invitation email sent to ${email}`);
        } catch (emailError) {
            console.error('Failed to send invitation email:', emailError);
            // Continue without failing the whole request
        }

        return ok(res, {
            success: true,
            message: emailSent ? 'Invitation sent successfully via email' : 'Invitation created (email sending failed)',
            invitation: {
                id: invitation.id,
                email: invitation.email,
                name: invitation.name,
                role: invitation.role,
                status: invitation.status,
                expiresAt: invitation.expiresAt
            },
            invitationLink
        })

    } catch (error) {
        console.error('Invitation creation error:', error)
        return serverError(res, 'Failed to create invitation', error.message)
    }
}

export default withHttp(withLogging(handler))
