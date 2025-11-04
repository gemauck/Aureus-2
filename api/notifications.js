// Notifications API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { sendNotificationEmail } from './_lib/email.js'
import { parseJsonBody } from './_lib/body.js'
import { logDatabaseError } from './_lib/dbErrorHandler.js'

async function handler(req, res) {
    // JWT payload uses 'sub' for user ID, not 'id'
    const userId = req.user?.sub || req.user?.id;
    
    if (!userId) {
        console.error('❌ Notifications: No user ID found in token. req.user =', req.user);
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
            logDatabaseError(error, 'getting notifications');
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
                // Create default settings (all in-app notifications enabled by default)
                settings = await prisma.notificationSetting.create({
                    data: { userId: targetUserId }
                });
            }
            
            // Check if user wants in-app notifications for this type
            let shouldCreateInAppNotification = false;
            if (type === 'mention' && settings.inAppMentions) {
                shouldCreateInAppNotification = true;
            } else if (type === 'comment' && settings.inAppComments) {
                shouldCreateInAppNotification = true;
            } else if (type === 'task' && settings.inAppTasks) {
                shouldCreateInAppNotification = true;
            } else if (type === 'invoice' && settings.inAppInvoices) {
                shouldCreateInAppNotification = true;
            } else if (type === 'system' && settings.inAppSystem) {
                shouldCreateInAppNotification = true;
            }
            
            let notification = null;
            
            // Only create in-app notification if user has enabled it for this type
            if (shouldCreateInAppNotification) {
                notification = await prisma.notification.create({
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
                console.log(`✅ In-app notification created for user ${targetUserId} (type: ${type})`);
            } else {
                console.log(`⏭️ Skipping in-app notification for user ${targetUserId} (type: ${type}) - preference disabled`);
            }
            
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
                    console.error('❌ Failed to send email notification:', emailError.message);
                    console.error('❌ Email notification error details:', {
                        message: emailError.message,
                        code: emailError.code,
                        response: emailError.response,
                        to: targetUser.email,
                        subject: title
                    });
                    // Log full error for debugging
                    if (emailError.stack) {
                        console.error('❌ Email notification error stack:', emailError.stack);
                    }
                    // Don't fail the request if email fails
                }
            }
            
            return ok(res, { notification, created: !!notification });
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

