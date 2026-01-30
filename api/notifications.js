// Notifications API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { sendNotificationEmail } from './_lib/email.js'
import { parseJsonBody } from './_lib/body.js'
import { logDatabaseError } from './_lib/dbErrorHandler.js'

// Helper function to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Create in-app and email notification for a single user.
 * Used by POST /notifications and by notifyCommentParticipants.
 * @returns {{ notification, created } | null} null if user not found
 */
export async function createNotificationForUser(targetUserId, type, title, message, link, metadata) {
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) return null;

    let settings = await prisma.notificationSetting.findUnique({ where: { userId: targetUserId } });
    if (!settings) {
        settings = await prisma.notificationSetting.create({
            data: {
                userId: targetUserId,
                emailTasks: true, emailMentions: true, emailComments: true, emailInvoices: true, emailSystem: true,
                inAppTasks: true, inAppMentions: true, inAppComments: true, inAppInvoices: true, inAppSystem: true
            }
        });
    }

    let shouldCreateInApp = (type === 'mention' && settings.inAppMentions) || (type === 'comment' && settings.inAppComments) ||
        (type === 'task' && settings.inAppTasks) || (type === 'invoice' && settings.inAppInvoices) || (type === 'system' && settings.inAppSystem);

    const metadataObj = typeof metadata === 'string' ? (() => { try { return JSON.parse(metadata); } catch (_) { return {}; } })() : (metadata || {});
    let validLink = link || '';
    // Prefer frontend-supplied link when it's already a full tracker deep link (correct section/document/cell)
    const linkHasDocSectionId = validLink && validLink.includes('docSectionId=');
    const linkHasDocDocumentId = validLink && validLink.includes('docDocumentId=');
    const linkHasDocMonthOrWeek = validLink && (validLink.includes('docMonth=') || validLink.includes('docWeek='));
    const linkIsFullTrackerDeepLink = linkHasDocSectionId && linkHasDocDocumentId && linkHasDocMonthOrWeek;
    if (linkIsFullTrackerDeepLink) {
        // Strip duplicate query params (e.g. docYear=2026&docYear=2026) by normalizing to single docYear
        const hashPart = validLink.includes('#') ? validLink.slice(validLink.indexOf('#')) : validLink;
        const qIdx = hashPart.indexOf('?');
        if (qIdx !== -1) {
            const params = new URLSearchParams(hashPart.slice(qIdx + 1));
            const singleYear = params.get('docYear') || params.get('year');
            params.delete('docYear');
            params.delete('year');
            if (singleYear != null) params.set('docYear', singleYear);
            validLink = (validLink.startsWith('#') ? '' : (validLink.split('#')[0] || '')) + hashPart.slice(0, qIdx + 1) + params.toString();
        }
    }
    // Otherwise build from metadata when we have tracker params (or no link)
    const hasTrackerMetadata = metadataObj.projectId && (
        metadataObj.sectionId || metadataObj.documentId || metadataObj.commentId || metadataObj.month != null ||
        metadataObj.weeklySectionId || metadataObj.weeklyDocumentId || metadataObj.weeklyWeek != null || metadataObj.week != null || metadataObj.weekNumber != null
    );
    if (!linkIsFullTrackerDeepLink && (hasTrackerMetadata || !validLink || !validLink.trim())) {
        try {
            const docYearVal = metadataObj.docYear != null ? metadataObj.docYear : metadataObj.year;
            const weekLabelFromMeta = metadataObj.weeklyWeek ?? metadataObj.week ?? metadataObj.weekNumber ?? metadataObj.weeklyMonth ?? metadataObj.month;
            const isWeeklyFMS = metadataObj.projectId && (metadataObj.weeklySectionId || metadataObj.weeklyDocumentId || metadataObj.weeklyWeek != null || metadataObj.weeklyMonth != null || (metadataObj.sectionId && (metadataObj.weekNumber != null || metadataObj.week != null)));
            if (isWeeklyFMS) {
                validLink = `#/projects/${metadataObj.projectId}`;
                const q = [];
                const sectionId = metadataObj.weeklySectionId || metadataObj.sectionId;
                const documentId = metadataObj.weeklyDocumentId || metadataObj.documentId;
                const weekLabel = weekLabelFromMeta;
                if (sectionId) q.push(`docSectionId=${encodeURIComponent(sectionId)}`);
                if (documentId) q.push(`docDocumentId=${encodeURIComponent(documentId)}`);
                if (weekLabel != null) q.push(`docWeek=${encodeURIComponent(weekLabel)}`);
                if (docYearVal != null) q.push(`docYear=${encodeURIComponent(docYearVal)}`);
                if (metadataObj.commentId) q.push(`commentId=${encodeURIComponent(metadataObj.commentId)}`);
                if (q.length) validLink += `?${q.join('&')}`;
            } else if (metadataObj.projectId && (metadataObj.sectionId || metadataObj.documentId || metadataObj.commentId || metadataObj.month != null)) {
                validLink = `#/projects/${metadataObj.projectId}`;
                const q = [];
                if (metadataObj.sectionId) q.push(`docSectionId=${encodeURIComponent(metadataObj.sectionId)}`);
                if (metadataObj.documentId) q.push(`docDocumentId=${encodeURIComponent(metadataObj.documentId)}`);
                if (metadataObj.month != null) q.push(`docMonth=${encodeURIComponent(metadataObj.month)}`);
                if (docYearVal != null) q.push(`docYear=${encodeURIComponent(docYearVal)}`);
                if (metadataObj.commentId) q.push(`commentId=${encodeURIComponent(metadataObj.commentId)}`);
                if (metadataObj.source === 'monthlyFMSReview') q.push(`tab=${encodeURIComponent('monthlyFMSReview')}`);
                if (q.length) validLink += `?${q.join('&')}`;
            } else if (!validLink || !validLink.trim()) {
                if (metadataObj.projectId) validLink = `#/projects/${metadataObj.projectId}`;
                else if (metadataObj.taskId) validLink = metadataObj.projectId ? `#/projects/${metadataObj.projectId}?task=${encodeURIComponent(metadataObj.taskId)}` : `#/tasks/${metadataObj.taskId}`;
                else if (metadataObj.clientId) validLink = `#/clients/${metadataObj.clientId}`;
                else if (metadataObj.leadId) validLink = `#/clients/${metadataObj.leadId}`;
                else if (metadataObj.ticketId) validLink = `#/helpdesk/${metadataObj.ticketId}`;
                else validLink = '/dashboard';
            }
        } catch (_) {
            if (!validLink || !validLink.trim()) validLink = '/dashboard';
        }
    }
    if (validLink && !validLink.startsWith('/') && !validLink.startsWith('#')) validLink = '/' + validLink;

    let notification = null;
    if (shouldCreateInApp) {
        try {
            notification = await prisma.notification.create({
                data: {
                    userId: targetUserId,
                    type, title, message,
                    link: validLink || '/dashboard',
                    metadata: metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : '{}',
                    read: false
                }
            });
        } catch (e) {
            console.error('Failed to create in-app notification for user', targetUserId, e);
        }
    }

    const shouldSendEmail = (type === 'mention' && settings.emailMentions) || (type === 'comment' && settings.emailComments) ||
        (type === 'task' && settings.emailTasks) || (type === 'invoice' && settings.emailInvoices) || (type === 'system' && settings.emailSystem);
    if (shouldSendEmail && targetUser.email) {
        try {
            let projectName = null, clientName = null, commentText = null, commentLink = link || null, taskTitle = null;
            const metadataObj = metadata && (typeof metadata === 'string' ? JSON.parse(metadata) : metadata);
            if (metadataObj && (type === 'comment' || type === 'mention' || type === 'task')) {
                commentText = metadataObj.commentText || metadataObj.fullComment || null;
                taskTitle = metadataObj.taskTitle || null;
                if (metadataObj.projectId) {
                    const p = await prisma.project.findUnique({ where: { id: metadataObj.projectId }, include: { client: true } });
                    if (p) {
                        projectName = p.name || null;
                        clientName = p.client?.name || null;
                        // Use the same validLink we built (with docSectionId, commentId, etc.) so email goes to the comment
                        commentLink = validLink && validLink.includes('?') ? validLink : (link || `#/projects/${metadataObj.projectId}`);
                        if (metadataObj.taskId && !commentLink.includes('task=')) commentLink += (commentLink.includes('?') ? '&' : '?') + `task=${encodeURIComponent(metadataObj.taskId)}`;
                    }
                } else if (metadataObj.clientId || metadataObj.leadId) {
                    const cid = metadataObj.clientId || metadataObj.leadId;
                    const c = await prisma.client.findUnique({ where: { id: cid }, select: { name: true } });
                    if (c) clientName = c.name || null;
                    commentLink = link || `#/clients/${cid}`;
                } else if (metadataObj.ticketId) {
                    commentLink = link || `#/helpdesk/${metadataObj.ticketId}`;
                }
            }
            let enhancedSubject = title;
            if (clientName || projectName) enhancedSubject = `[${[clientName, projectName].filter(Boolean).join(' - ')}] ${title}`;
            let enhancedMessage = message;
            if (clientName || projectName || taskTitle) {
                enhancedMessage = '<div style="background:#e7f3ff;border-left:4px solid #007bff;padding:15px;margin-bottom:20px;border-radius:4px;"><h3 style="color:#333;margin:0 0 10px;font-size:16px;">📋 Context</h3>';
                if (clientName) enhancedMessage += `<p style="color:#555;margin:5px 0;"><strong>Client:</strong> ${escapeHtml(clientName)}</p>`;
                if (projectName) enhancedMessage += `<p style="color:#555;margin:5px 0;"><strong>Project:</strong> ${escapeHtml(projectName)}</p>`;
                if (taskTitle) enhancedMessage += `<p style="color:#555;margin:5px 0;"><strong>Task:</strong> ${escapeHtml(taskTitle)}</p>`;
                enhancedMessage += '</div>' + enhancedMessage;
            }
            if (commentText) {
                const prev = commentText.length > 200 ? commentText.slice(0, 200) + '...' : commentText;
                enhancedMessage += `<div style="background:#f8f9fa;border:1px solid #ddd;border-radius:4px;padding:15px;margin:20px 0;"><h4 style="color:#333;margin:0 0 10px;font-size:14px;">💬 Comment</h4><p style="color:#555;margin:0;line-height:1.6;white-space:pre-wrap;">${escapeHtml(prev)}</p></div>`;
            }
            await sendNotificationEmail(targetUser.email, enhancedSubject, enhancedMessage, {
                projectName, clientName, commentText, commentLink, taskTitle,
                isProjectRelated: !!(metadataObj && (type === 'comment' || type === 'mention' || type === 'task')),
                skipNotificationCreation: true
            });
        } catch (e) {
            console.error('Failed to send email notification to', targetUserId, e);
        }
    }
    return { notification, created: !!notification };
}

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
            const isConnError = logDatabaseError(error, 'getting notifications');
            if (isConnError) {
                return serverError(res, `Database connection failed: ${error.message}`, 'The database server is unreachable. Please check your network connection and ensure the database server is running.');
            }
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
                console.error('❌ POST /notifications - Missing required fields:', { hasUserId: !!targetUserId, hasType: !!type, hasTitle: !!title, hasMessage: !!message });
                return badRequest(res, 'Missing required fields: userId, type, title, message');
            }
            const result = await createNotificationForUser(targetUserId, type, title, message, link, metadata);
            if (!result) return badRequest(res, 'User not found');
            return ok(res, result);
        } catch (error) {
            console.error('❌ POST /notifications - Error creating notification:', error);
            console.error('❌ Error details:', {
                message: error.message,
                stack: error.stack,
                code: error.code,
                meta: error.meta
            });
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

