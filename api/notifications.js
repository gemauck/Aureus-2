// Notifications API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { sendNotificationEmail } from './_lib/email.js'
import { parseJsonBody } from './_lib/body.js'

async function handler(req, res) {
    const userId = req.user?.id;
    
    if (!userId) {
        return unauthorized(res, 'Authentication required');
    }

    if (req.method === 'GET') {
        try {
            // Get query parameters
            const read = req.query.read;
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;
            
            // Build where clause
            const where = { userId };
            if (read !== undefined) {
                where.read = read === 'true';
            }
            
            // Fetch notifications
            const notifications = await prisma.notification.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset
            });
            
            // Count total unread notifications
            const unreadCount = await prisma.notification.count({
                where: { userId, read: false }
            });
            
            return ok(res, {
                notifications,
                unreadCount
            });
        } catch (error) {
            console.error('Get notifications error:', error);
            return serverError(res, 'Failed to get notifications', error.message);
        }
    }
    
    if (req.method === 'PATCH') {
        try {
            const body = req.body || await parseJsonBody(req);
            const { read, notificationIds } = body;
            
            if (read === undefined || notificationIds === undefined) {
                return badRequest(res, 'Missing required fields: read, notificationIds');
            }
            
            // Mark notifications as read/unread
            await prisma.notification.updateMany({
                where: {
                    id: { in: notificationIds },
                    userId // Ensure user can only update their own notifications
                },
                data: { read }
            });
            
            return ok(res, { success: true });
        } catch (error) {
            console.error('Update notifications error:', error);
            return serverError(res, 'Failed to update notifications', error.message);
        }
    }
    
    if (req.method === 'POST') {
        try {
            const body = req.body || await parseJsonBody(req);
            const { userId: targetUserId, type, title, message, link, metadata } = body;
            
            if (!targetUserId || !type || !title || !message) {
                return badRequest(res, 'Missing required fields: userId, type, title, message');
            }
            
            // Check if target user exists
            const targetUser = await prisma.user.findUnique({
                where: { id: targetUserId }
            });
            
            if (!targetUser) {
                return badRequest(res, 'User not found');
            }
            
            // Get or create notification settings
            let settings = await prisma.notificationSetting.findUnique({
                where: { userId: targetUserId }
            });
            
            if (!settings) {
                // Create default settings
                settings = await prisma.notificationSetting.create({
                    data: { userId: targetUserId }
                });
            }
            
            // Create notification
            const notification = await prisma.notification.create({
                data: {
                    userId: targetUserId,
                    type,
                    title,
                    message,
                    link: link || '',
                    metadata: metadata ? JSON.stringify(metadata) : '{}',
                    read: false
                }
            });
            
            // Determine if email should be sent based on type and user settings
            let shouldSendEmail = false;
            if (type === 'mention' && settings.emailMentions) {
                shouldSendEmail = true;
            } else if (type === 'comment' && settings.emailComments) {
                shouldSendEmail = true;
            } else if (type === 'task' && settings.emailTasks) {
                shouldSendEmail = true;
            } else if (type === 'invoice' && settings.emailInvoices) {
                shouldSendEmail = true;
            } else if (type === 'system' && settings.emailSystem) {
                shouldSendEmail = true;
            }
            
            // Send email notification if enabled
            if (shouldSendEmail && targetUser.email) {
                try {
                    await sendNotificationEmail(
                        targetUser.email,
                        title,
                        message
                    );
                    console.log(`✅ Email notification sent to ${targetUser.email}`);
                } catch (emailError) {
                    console.error('❌ Failed to send email notification:', emailError);
                    // Don't fail the request if email fails
                }
            }
            
            return ok(res, { notification });
        } catch (error) {
            console.error('Create notification error:', error);
            return serverError(res, 'Failed to create notification', error.message);
        }
    }
    
    if (req.method === 'DELETE') {
        try {
            const { notificationIds } = req.body;
            
            if (!notificationIds || !Array.isArray(notificationIds)) {
                return badRequest(res, 'Missing required field: notificationIds (array)');
            }
            
            // Delete notifications
            await prisma.notification.deleteMany({
                where: {
                    id: { in: notificationIds },
                    userId // Ensure user can only delete their own notifications
                }
            });
            
            return ok(res, { success: true });
        } catch (error) {
            console.error('Delete notifications error:', error);
            return serverError(res, 'Failed to delete notifications', error.message);
        }
    }
    
    return badRequest(res, 'Method not allowed');
}

export default withLogging(withHttp(authRequired(handler)));

