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
        
        // New password is always required
        if (!newPassword || 
            typeof newPassword !== 'string' ||
            newPassword.trim() === '') {
            console.log('❌ Invalid password data: new password required')
            return badRequest(res, 'New password is required')
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

        // Verify current password (required for users with passwordHash)
        if (user.passwordHash) {
            // If user has a password, current password is required
            if (!currentPassword || 
                typeof currentPassword !== 'string' ||
                currentPassword.trim() === '') {
                console.log('❌ Current password required for users with existing password')
                return badRequest(res, 'Current password is required')
            }
            console.log('🔍 Verifying password:', {
                userId: user.id,
                email: user.email,
                hasPasswordHash: !!user.passwordHash,
                passwordHashLength: user.passwordHash?.length,
                currentPasswordLength: currentPassword.trim().length,
                passwordHashPrefix: user.passwordHash?.substring(0, 10) + '...'
            })
            const valid = await bcrypt.compare(currentPassword.trim(), user.passwordHash)
            console.log('🔍 Bcrypt compare result:', valid)
            if (!valid) {
                console.log('❌ Current password is incorrect')
                return unauthorized(res, 'Current password is incorrect')
            }
            console.log('✅ Current password verified')
        } else {
            // Users without passwordHash (OAuth users or new users) can set password without current password
            console.log('🔄 Setting password for user without existing password:', user.email)
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

