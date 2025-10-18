// User invitation API endpoint
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import crypto from 'crypto'

async function handler(req, res) {
    if (req.method !== 'POST') return badRequest(res, 'Invalid method')
    
    try {
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

        // Create invitation record
        const invitation = await prisma.invitation.create({
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

        // Generate WhatsApp message
        const invitationLink = `${process.env.APP_URL || 'http://localhost:3001'}/accept-invitation?token=${invitationToken}`
        const whatsappMessage = `🎉 You've been invited to join Abcotronics ERP!

👋 Hi ${name},

You've been invited to join our ERP system with the role: ${role}

📱 To accept your invitation, click this link:
${invitationLink}

🔐 This link will expire in 7 days.

Need help? Contact us at admin@abcotronics.com

Best regards,
The Abcotronics Team`

        return ok(res, {
            success: true,
            invitation: {
                id: invitation.id,
                email: invitation.email,
                name: invitation.name,
                role: invitation.role,
                status: invitation.status,
                expiresAt: invitation.expiresAt
            },
            whatsappMessage,
            invitationLink
        })

    } catch (error) {
        console.error('Invitation creation error:', error)
        return serverError(res, 'Failed to create invitation', error.message)
    }
}

export default withHttp(withLogging(handler))
