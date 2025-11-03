// Test Notification Endpoint - Create a test notification for the current user
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

async function handler(req, res) {
    if (req.method !== 'POST') {
        return badRequest(res, 'Method not allowed');
    }
    
    const userId = req.user?.id;
    
    if (!userId) {
        return badRequest(res, 'Authentication required');
    }
    
    try {
        const { type = 'system', title, message } = req.body || {};
        
        // Create a test notification
        const notification = await prisma.notification.create({
            data: {
                userId,
                type: type || 'system',
                title: title || 'Test Notification',
                message: message || `This is a test notification created at ${new Date().toLocaleString()}`,
                link: '/settings?tab=notifications',
                metadata: JSON.stringify({ test: true, createdAt: new Date().toISOString() }),
                read: false
            }
        });
        
        return ok(res, {
            success: true,
            message: 'Test notification created',
            notification
        });
    } catch (error) {
        console.error('Create test notification error:', error);
        return serverError(res, 'Failed to create test notification', error.message);
    }
}

export default withLogging(withHttp(authRequired(handler)));

