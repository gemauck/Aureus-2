// Invitation management API endpoint (update, delete, resend)
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { sendInvitationEmail } from '../_lib/email.js'
import { authRequired } from '../_lib/authRequired.js'
import crypto from 'crypto'

async function handler(req, res) {
    // Extract invitation ID from Express route params or URL
    let invitationId = req.params?.id
    if (!invitationId) {
        const urlPart = req.url.split('/').pop()
        invitationId = urlPart ? urlPart.split('?')[0] : null
    }
    
    // Update invitation (PUT)
    if (req.method === 'PUT') {
        try {
            const { name, role, email } = req.body || {}
            
            if (!invitationId) {
                return badRequest(res, 'Invitation ID is required')
            }
            
            // Find invitation
            const invitation = await prisma.invitation.findUnique({
                where: { id: invitationId }
            })
            
            if (!invitation) {
                return badRequest(res, 'Invitation not found')
            }
            
            if (invitation.status !== 'pending') {
                return badRequest(res, 'Can only update pending invitations')
            }
            
            // Update invitation
            const updated = await prisma.invitation.update({
                where: { id: invitationId },
                data: {
                    ...(name && { name }),
                    ...(role && { role }),
                    ...(email && { email })
                }
            })
            
            console.log('✅ Invitation updated:', updated.id)
            
            return ok(res, {
                success: true,
                message: 'Invitation updated successfully',
                invitation: updated
            })
            
        } catch (error) {
            console.error('Update invitation error:', error)
            return serverError(res, 'Failed to update invitation', error.message)
        }
    }
    
    // Delete invitation (DELETE)
    if (req.method === 'DELETE') {
        try {
            console.log('🗑️ Delete invitation request:', { 
                invitationId, 
                url: req.url, 
                params: req.params,
                method: req.method 
            });
            
            if (!invitationId) {
                console.error('❌ No invitation ID provided');
                return badRequest(res, 'Invitation ID is required')
            }
            
            // Find and delete invitation
            const invitation = await prisma.invitation.findUnique({
                where: { id: invitationId }
            })
            
            if (!invitation) {
                console.error('❌ Invitation not found:', invitationId);
                return badRequest(res, 'Invitation not found')
            }
            
            console.log('✅ Found invitation to delete:', { 
                id: invitation.id, 
                email: invitation.email,
                status: invitation.status 
            });
            
            await prisma.invitation.delete({
                where: { id: invitationId }
            })
            
            console.log('✅ Invitation deleted successfully:', invitationId)
            
            return ok(res, {
                success: true,
                message: 'Invitation deleted successfully'
            })
            
        } catch (error) {
            console.error('❌ Delete invitation error:', error)
            console.error('Error stack:', error.stack);
            return serverError(res, 'Failed to delete invitation', error.message)
        }
    }
    
    // Resend invitation (POST)
    if (req.method === 'POST') {
        try {
            if (!invitationId) {
                return badRequest(res, 'Invitation ID is required')
            }
            
            // Find invitation
            const invitation = await prisma.invitation.findUnique({
                where: { id: invitationId }
            })
            
            if (!invitation) {
                return badRequest(res, 'Invitation not found')
            }
            
            if (invitation.status !== 'pending') {
                return badRequest(res, 'Can only resend pending invitations')
            }
            
            // Generate new token and extend expiry
            const newToken = crypto.randomBytes(32).toString('hex')
            const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
            
            // Update invitation with new token
            const updated = await prisma.invitation.update({
                where: { id: invitationId },
                data: {
                    token: newToken,
                    expiresAt: newExpiresAt,
                    updatedAt: new Date()
                }
            })
            
            // Generate invitation link
            const invitationLink = `${process.env.APP_URL || 'http://localhost:3001'}/accept-invitation?token=${newToken}`
            
            // Send email
            let emailSent = false
            try {
                await sendInvitationEmail({
                    email: invitation.email,
                    name: invitation.name,
                    role: invitation.role,
                    invitationLink
                })
                emailSent = true
                console.log('✅ Invitation email resent successfully')
            } catch (emailError) {
                console.error('❌ Failed to resend invitation email:', emailError.message)
            }
            
            return ok(res, {
                success: true,
                message: emailSent ? 'Invitation resent successfully' : 'Invitation updated. Email sending failed.',
                invitation: updated,
                invitationLink,
                emailSent
            })
            
        } catch (error) {
            console.error('Resend invitation error:', error)
            return serverError(res, 'Failed to resend invitation', error.message)
        }
    }
    
    return badRequest(res, 'Invalid method')
}

export default withHttp(withLogging(authRequired(handler)))
