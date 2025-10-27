// Change Password API endpoint
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import bcrypt from 'bcryptjs'

async function handler(req, res) {
    if (req.method !== 'POST') return badRequest(res, 'Invalid method')
    
    try {
        console.log('📥 Change password request body:', req.body)
        console.log('📥 Change password user:', req.user)
        
        const { currentPassword, newPassword } = req.body || {}
        
        console.log('📥 Parsed passwords:', { 
            currentPassword: currentPassword ? '***' : 'empty', 
            newPassword: newPassword ? '***' : 'empty',
            currentPasswordLength: currentPassword?.length,
            newPasswordLength: newPassword?.length
        })
        
        if (!currentPassword || !newPassword || 
            typeof currentPassword !== 'string' || 
            typeof newPassword !== 'string' ||
            currentPassword.trim() === '' || 
            newPassword.trim() === '') {
            console.log('❌ Invalid password data')
            return badRequest(res, 'Current password and new password are required')
        }

        if (newPassword.length < 8) {
            return badRequest(res, 'New password must be at least 8 characters long')
        }

        // Get current user (use sub from JWT payload as the user ID)
        const userId = req.user.sub || req.user.id
        if (!userId) {
            console.log('❌ No user ID found in token')
            return unauthorized(res, 'Invalid user token')
        }
        
        const user = await prisma.user.findUnique({
            where: { id: userId }
        })

        if (!user) {
            console.log('❌ User not found:', userId)
            return unauthorized(res, 'User not found')
        }

        // Verify current password
        if (user.passwordHash) {
            const valid = await bcrypt.compare(currentPassword, user.passwordHash)
            if (!valid) {
                console.log('❌ Current password is incorrect')
                return unauthorized(res, 'Current password is incorrect')
            }
        }

        // Hash new password
        const passwordHash = await bcrypt.hash(newPassword, 10)

        // Update password and clear mustChangePassword flag
        await prisma.user.update({
            where: { id: userId },
            data: {
                passwordHash,
                mustChangePassword: false
            }
        })

        console.log('✅ Password changed successfully for user:', req.user.email || user.email)

        return ok(res, { 
            success: true, 
            message: 'Password changed successfully' 
        })

    } catch (error) {
        console.error('Change password error:', error)
        return serverError(res, 'Failed to change password', error.message)
    }
}

export default withHttp(withLogging(authRequired(handler)))

