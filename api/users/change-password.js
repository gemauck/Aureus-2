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
        const { currentPassword, newPassword } = req.body || {}
        
        if (!currentPassword || !newPassword) {
            return badRequest(res, 'Current password and new password are required')
        }

        if (newPassword.length < 8) {
            return badRequest(res, 'New password must be at least 8 characters long')
        }

        // Get current user
        const user = await prisma.user.findUnique({
            where: { id: req.user.id }
        })

        if (!user) {
            return unauthorized(res, 'User not found')
        }

        // Verify current password
        if (user.passwordHash) {
            const valid = await bcrypt.compare(currentPassword, user.passwordHash)
            if (!valid) {
                return unauthorized(res, 'Current password is incorrect')
            }
        }

        // Hash new password
        const passwordHash = await bcrypt.hash(newPassword, 10)

        // Update password and clear mustChangePassword flag
        await prisma.user.update({
            where: { id: req.user.id },
            data: {
                passwordHash,
                mustChangePassword: false
            }
        })

        console.log('✅ Password changed successfully for user:', req.user.email)

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

