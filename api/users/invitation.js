// Invitation management API endpoint (update, delete, resend)
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { sendInvitationEmail } from '../_lib/email.js'
import { authRequired } from '../_lib/authRequired.js'
import { getAppUrl } from '../_lib/getAppUrl.js'
import crypto from 'crypto'

async function handler(req, res) {
    console.log('🔄 Invitation handler called - Method:', req.method, 'URL:', req.url);
    // Extract invitation ID from Express route params or URL
    let invitationId = req.params?.id
    console.log('🔄 Extracted invitationId from params:', invitationId);
    if (!invitationId) {
        const urlPart = req.url.split('/').pop()
        invitationId = urlPart ? urlPart.split('?')[0] : null
        console.log('🔄 Extracted invitationId from URL:', invitationId);
    }
    console.log('🔄 Final invitationId:', invitationId);
    
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
            
            
            await prisma.invitation.delete({
                where: { id: invitationId }
            })
            
            
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
        console.log('🔄 Resend invitation endpoint called')
        console.log('🔄 Invitation ID:', invitationId)
        console.log('🔄 Request URL:', req.url)
        console.log('🔄 Request method:', req.method)
        try {
            if (!invitationId) {
                console.error('❌ No invitation ID provided')
                return badRequest(res, 'Invitation ID is required')
            }
            
            console.log('🔍 Looking up invitation:', invitationId)
            // Find invitation
            const invitation = await prisma.invitation.findUnique({
                where: { id: invitationId }
            })
            
            console.log('🔍 Invitation found:', invitation ? { id: invitation.id, email: invitation.email, status: invitation.status } : 'NOT FOUND')
            
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
            
            // Generate invitation link using the token that was ACTUALLY saved to the database
            const savedToken = updated.token || newToken
            const invitationLink = `${getAppUrl()}/accept-invitation?token=${savedToken}`
            
            // Verify the token matches what was saved
            if (updated.token !== newToken) {
                console.warn('⚠️ Token mismatch in resend! Intended:', newToken.substring(0, 20) + '...', 'Saved:', updated.token.substring(0, 20) + '...')
            }
            
            // Send email
            let emailSent = false
            let emailErrorDetails = null
            try {
                // Always use the token from the database (updated.token) as source of truth
                const emailLink = updated.token 
                    ? `${getAppUrl()}/accept-invitation?token=${updated.token}`
                    : invitationLink
                
                console.log('📧 Attempting to resend invitation email...')
                console.log('📧 Email config check:', {
                    hasResendKey: !!process.env.RESEND_API_KEY,
                    hasSendGridKey: !!process.env.SENDGRID_API_KEY,
                    emailFrom: process.env.EMAIL_FROM,
                    recipient: invitation.email
                })
                
                await sendInvitationEmail({
                    email: invitation.email,
                    name: invitation.name,
                    role: invitation.role,
                    invitationLink: emailLink
                })
                emailSent = true
                console.log('✅ Invitation email resent successfully to:', invitation.email)
            } catch (emailError) {
                emailErrorDetails = emailError.message
                console.error('❌ Failed to resend invitation email:', emailError.message)
                console.error('❌ Email error stack:', emailError.stack)
            }
            
            return ok(res, {
                success: true,
                message: emailSent ? 'Invitation resent successfully' : 'Invitation updated. Email sending failed.',
                invitation: updated,
                invitationLink: updated.token 
                    ? `${getAppUrl()}/accept-invitation?token=${updated.token}`
                    : invitationLink,
                emailSent,
                emailError: emailErrorDetails || null
            })
            
        } catch (error) {
            console.error('Resend invitation error:', error)
            return serverError(res, 'Failed to resend invitation', error.message)
        }
    }
    
    return badRequest(res, 'Invalid method')
}

export default withHttp(withLogging(authRequired(handler)))
