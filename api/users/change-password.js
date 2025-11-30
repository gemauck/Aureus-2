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
        
        
        // New password is always required
        if (!newPassword || 
            typeof newPassword !== 'string' ||
            newPassword.trim() === '') {
            return badRequest(res, 'New password is required')
        }

        if (newPassword.length < 8) {
            return badRequest(res, 'New password must be at least 8 characters long')
        }

        // Get current user (use sub from JWT payload as the user ID)
        const userId = req.user.sub || req.user.id
        if (!userId) {
            return unauthorized(res, 'Invalid user token')
        }
        
        const user = await prisma.user.findUnique({
            where: { id: userId }
        })

        if (!user) {
            return unauthorized(res, 'User not found')
        }

        // Verify current password (required for users with passwordHash)
        if (user.passwordHash) {
            // If user has a password, current password is required
            if (!currentPassword || 
                typeof currentPassword !== 'string' ||
                currentPassword.trim() === '') {
                return badRequest(res, 'Current password is required')
            }
            const valid = await bcrypt.compare(currentPassword.trim(), user.passwordHash)
            if (!valid) {
                return unauthorized(res, 'Current password is incorrect')
            }
        } else {
            // Users without passwordHash (OAuth users or new users) can set password without current password
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

