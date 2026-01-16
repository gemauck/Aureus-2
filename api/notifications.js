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
                console.error('❌ POST /notifications - Missing required fields:', {
                    hasUserId: !!targetUserId,
                    hasType: !!type,
                    hasTitle: !!title,
                    hasMessage: !!message
                });
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
                // Create default settings (all notifications enabled by default, including emailTasks)
                settings = await prisma.notificationSetting.create({
                    data: { 
                        userId: targetUserId,
                        emailTasks: true,  // Explicitly set to true for new users
                        emailMentions: true,
                        emailComments: true,
                        emailInvoices: true,
                        emailSystem: true,
                        inAppTasks: true,
                        inAppMentions: true,
                        inAppComments: true,
                        inAppInvoices: true,
                        inAppSystem: true
                    }
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
            
            // Ensure link is valid - construct from metadata if missing
            let validLink = link || '';
            if (!validLink || validLink.trim() === '') {
                // Try to construct link from metadata
                try {
                    const metadataObj = typeof metadata === 'string' ? JSON.parse(metadata) : (metadata || {});
                    
                    // Check for entity IDs in metadata
                    // Handle weekly FMS review tracker links first (check for weekNumber to distinguish from document collection)
                    if (metadataObj.projectId && (metadataObj.weeklySectionId || metadataObj.weeklyDocumentId || metadataObj.weeklyWeek || metadataObj.weeklyMonth || (metadataObj.sectionId && metadataObj.weekNumber))) {
                        // Weekly FMS review tracker comment - build link with weekly parameters
                        validLink = `#/projects/${metadataObj.projectId}`;
                        const queryParams = [];
                        if (metadataObj.weeklySectionId || metadataObj.sectionId) queryParams.push(`weeklySectionId=${encodeURIComponent(metadataObj.weeklySectionId || metadataObj.sectionId)}`);
                        if (metadataObj.weeklyDocumentId || metadataObj.documentId) queryParams.push(`weeklyDocumentId=${encodeURIComponent(metadataObj.weeklyDocumentId || metadataObj.documentId)}`);
                        if (metadataObj.weeklyMonth !== undefined && metadataObj.weeklyMonth !== null) {
                            queryParams.push(`weeklyMonth=${encodeURIComponent(metadataObj.weeklyMonth)}`);
                        } else if (metadataObj.month !== undefined && metadataObj.month !== null) {
                            queryParams.push(`weeklyMonth=${encodeURIComponent(metadataObj.month)}`);
                        }
                        if (metadataObj.weeklyWeek !== undefined && metadataObj.weeklyWeek !== null) {
                            queryParams.push(`weeklyWeek=${encodeURIComponent(metadataObj.weeklyWeek)}`);
                        } else if (metadataObj.weekNumber !== undefined && metadataObj.weekNumber !== null) {
                            queryParams.push(`weeklyWeek=${encodeURIComponent(metadataObj.weekNumber)}`);
                        }
                        if (metadataObj.commentId) queryParams.push(`commentId=${encodeURIComponent(metadataObj.commentId)}`);
                        if (queryParams.length > 0) {
                            validLink += `?${queryParams.join('&')}`;
                        }
                    } else if (metadataObj.projectId && (metadataObj.sectionId || metadataObj.documentId || metadataObj.commentId)) {
                        // Document collection tracker comment - build link with all parameters
                        validLink = `#/projects/${metadataObj.projectId}`;
                        const queryParams = [];
                        if (metadataObj.sectionId) queryParams.push(`docSectionId=${encodeURIComponent(metadataObj.sectionId)}`);
                        if (metadataObj.documentId) queryParams.push(`docDocumentId=${encodeURIComponent(metadataObj.documentId)}`);
                        if (metadataObj.month !== undefined && metadataObj.month !== null) queryParams.push(`docMonth=${encodeURIComponent(metadataObj.month)}`);
                        if (metadataObj.commentId) queryParams.push(`commentId=${encodeURIComponent(metadataObj.commentId)}`);
                        if (queryParams.length > 0) {
                            validLink += `?${queryParams.join('&')}`;
                        }
                    } else if (metadataObj.projectId) {
                        validLink = `/projects/${metadataObj.projectId}`;
                        if (metadataObj.tab) validLink += `?tab=${metadataObj.tab}`;
                    } else if (metadataObj.taskId) {
                        if (metadataObj.projectId) {
                            validLink = `/projects/${metadataObj.projectId}/tasks/${metadataObj.taskId}`;
                        } else {
                            validLink = `/tasks/${metadataObj.taskId}`;
                        }
                        if (metadataObj.tab) validLink += (validLink.includes('?') ? '&' : '?') + `tab=${metadataObj.tab}`;
                    } else if (metadataObj.clientId) {
                        validLink = `/clients/${metadataObj.clientId}`;
                        if (metadataObj.tab) validLink += `?tab=${metadataObj.tab}`;
                    } else if (metadataObj.leadId) {
                        validLink = `/clients/${metadataObj.leadId}`;
                        if (metadataObj.tab) validLink += `?tab=${metadataObj.tab}`;
                    } else if (metadataObj.opportunityId) {
                        validLink = `/clients/${metadataObj.opportunityId}`;
                        if (metadataObj.tab) validLink += `?tab=${metadataObj.tab}`;
                    } else if (metadataObj.invoiceId) {
                        validLink = `/clients/${metadataObj.clientId || metadataObj.invoiceId}`;
                        if (metadataObj.tab) validLink += `?tab=${metadataObj.tab}`;
                    } else if (metadataObj.userId) {
                        validLink = `/users/${metadataObj.userId}`;
                    } else if (metadataObj.teamId) {
                        validLink = `/teams/${metadataObj.teamId}`;
                        if (metadataObj.tab) validLink += `?tab=${metadataObj.tab}`;
                    } else if (metadataObj.jobcardId) {
                        validLink = `/service-maintenance/${metadataObj.jobcardId}`;
                    } else if (metadataObj.vehicleId) {
                        validLink = `/service-maintenance?tab=vehicles&vehicleId=${metadataObj.vehicleId}`;
                    } else if (metadataObj.productionorderId) {
                        validLink = `/manufacturing/${metadataObj.productionorderId}`;
                    } else if (metadataObj.bomId) {
                        validLink = `/manufacturing?tab=boms&bomId=${metadataObj.bomId}`;
                    } else if (metadataObj.inventoryitemId) {
                        validLink = `/manufacturing?tab=inventory&itemId=${metadataObj.inventoryitemId}`;
                    } else if (metadataObj.leaveapplicationId) {
                        validLink = `/leave-platform/${metadataObj.leaveapplicationId}`;
                    } else if (metadataObj.timeentryId) {
                        validLink = `/time-tracking/${metadataObj.timeentryId}`;
                    } else if (metadataObj.component || metadataObj.page) {
                        const componentName = metadataObj.component || metadataObj.page;
                        validLink = `/${componentName}`;
                        if (metadataObj.tab) validLink += `?tab=${metadataObj.tab}`;
                    } else {
                        // Default to dashboard if no entity info found
                        validLink = '/dashboard';
                    }
                } catch (parseError) {
                    console.warn('Failed to parse metadata for link construction:', parseError);
                    validLink = '/dashboard';
                }
            }
            
            // Ensure link starts with / (for hash-based routing)
            if (validLink && !validLink.startsWith('/') && !validLink.startsWith('#')) {
                validLink = '/' + validLink;
            }
            
            // Only create in-app notification if user has enabled it for this type
            if (shouldCreateInAppNotification) {
                try {
                    notification = await prisma.notification.create({
                        data: {
                            userId: targetUserId,
                            type,
                            title,
                            message,
                            link: validLink || '/dashboard',
                            metadata: metadata ? JSON.stringify(metadata) : '{}',
                            read: false
                        }
                    });
                } catch (dbError) {
                    console.error(`❌ Failed to create in-app notification for user ${targetUserId}:`, dbError);
                    console.error('❌ Database error details:', {
                        message: dbError.message,
                        code: dbError.code,
                        meta: dbError.meta
                    });
                    // Don't fail the request if notification creation fails
                }
            } else {
                console.warn(`⏭️ Skipping in-app notification for user ${targetUserId} (type: ${type}) - preference disabled`, {
                    setting: type === 'mention' ? 'inAppMentions' : 
                            type === 'comment' ? 'inAppComments' : 
                            type === 'task' ? 'inAppTasks' : 
                            type === 'invoice' ? 'inAppInvoices' : 
                            type === 'system' ? 'inAppSystem' : 'unknown',
                    value: type === 'mention' ? settings.inAppMentions : 
                            type === 'comment' ? settings.inAppComments : 
                            type === 'task' ? settings.inAppTasks : 
                            type === 'invoice' ? settings.inAppInvoices : 
                            type === 'system' ? settings.inAppSystem : false
                });
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
            
            
            if (!shouldSendEmail) {
                console.warn(`⚠️ Email notification skipped for user ${targetUserId} (type: ${type}) - user preference disabled`, {
                    setting: type === 'mention' ? 'emailMentions' : 
                            type === 'comment' ? 'emailComments' : 
                            type === 'task' ? 'emailTasks' : 
                            type === 'invoice' ? 'emailInvoices' : 
                            type === 'system' ? 'emailSystem' : 'unknown',
                    value: type === 'mention' ? settings.emailMentions : 
                            type === 'comment' ? settings.emailComments : 
                            type === 'task' ? settings.emailTasks : 
                            type === 'invoice' ? settings.emailInvoices : 
                            type === 'system' ? settings.emailSystem : false
                });
            }
            
            if (!targetUser.email) {
                console.warn(`⚠️ Email notification skipped for user ${targetUserId} (type: ${type}) - user has no email address`);
            }
            
            // Send email notification if enabled
            if (shouldSendEmail && targetUser.email) {
                
                // For ALL project-related notifications (including mentions), fetch project and client details
                // This ensures emails include project name, client name, and comment extract
                try {
                    // For project-related notifications, fetch client and project details
                    let projectName = null;
                    let clientName = null;
                    let clientDescription = null;
                    let projectDescription = null;
                    let commentText = null;
                    let commentLink = link || null;
                    let taskTitle = null;
                    let taskDescription = null;
                    let taskStatus = null;
                    let taskPriority = null;
                    let taskDueDate = null;
                    let taskListName = null;
                    
                    if (metadata && (type === 'comment' || type === 'mention' || type === 'task')) {
                        try {
                            const metadataObj = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
                            const projectId = metadataObj?.projectId;
                            const taskId = metadataObj?.taskId;
                            
                            // Extract comment text from metadata
                            if (metadataObj?.commentText) {
                                commentText = metadataObj.commentText;
                            } else if (metadataObj?.fullComment) {
                                commentText = metadataObj.fullComment;
                            }
                            
                            // Extract task information from metadata (if available)
                            if (metadataObj?.taskTitle) {
                                taskTitle = metadataObj.taskTitle;
                            }
                            if (metadataObj?.taskDescription) {
                                taskDescription = metadataObj.taskDescription;
                            }
                            if (metadataObj?.taskStatus) {
                                taskStatus = metadataObj.taskStatus;
                            }
                            if (metadataObj?.taskPriority) {
                                taskPriority = metadataObj.taskPriority;
                            }
                            if (metadataObj?.taskDueDate) {
                                taskDueDate = metadataObj.taskDueDate;
                            }
                            if (metadataObj?.taskListName) {
                                taskListName = metadataObj.taskListName;
                            }
                            
                            // If we have a taskId but missing task details, fetch from database
                            if (taskId && (!taskDescription || !taskStatus || !taskPriority)) {
                                try {
                                    const task = await prisma.task.findUnique({
                                        where: { id: taskId },
                                        include: {
                                            list: {
                                                select: { name: true }
                                            }
                                        }
                                    });
                                    
                                    if (task) {
                                        if (!taskTitle) taskTitle = task.title || null;
                                        if (!taskDescription) taskDescription = task.description || null;
                                        if (!taskStatus) taskStatus = task.status || 'To Do';
                                        if (!taskPriority) taskPriority = task.priority || 'Medium';
                                        if (!taskDueDate) taskDueDate = task.dueDate ? task.dueDate.toISOString() : null;
                                        if (!taskListName && task.list) taskListName = task.list.name || null;
                                    }
                                } catch (taskFetchError) {
                                    console.warn('⚠️ Could not fetch task details from database:', taskFetchError.message);
                                    // Continue with metadata values only
                                }
                            }
                            
                            if (projectId) {
                                // Fetch project with client information
                                const project = await prisma.project.findUnique({
                                    where: { id: projectId },
                                    include: {
                                        client: true
                                    }
                                });
                                
                                if (project) {
                                    // Get project name and description
                                    projectName = project.name || null;
                                    projectDescription = project.description || null;
                                    
                                    // Get client name and description if client exists
                                    if (project.client) {
                                        clientName = project.client.name || null;
                                        clientDescription = project.client.notes || null;
                                    } else if (project.clientId) {
                                        // Try to fetch client separately if not included
                                        const client = await prisma.client.findUnique({
                                            where: { id: project.clientId }
                                        });
                                        if (client) {
                                            clientName = client.name || null;
                                            clientDescription = client.notes || null;
                                        }
                                    }
                                    
                                    // Build comment link - prioritize weekly FMS review tracker links, then document collection tracker links
                                    // First, check if link already contains weekly FMS review parameters - if so, use it as-is
                                    if (link && (link.includes('weeklySectionId=') || link.includes('weeklyDocumentId=') || link.includes('weeklyWeek=') || link.includes('weeklyMonth='))) {
                                        // Link already has weekly FMS review parameters, preserve it
                                        commentLink = link;
                                        console.log('📧 Email link: Using existing link with weekly FMS review params:', commentLink);
                                    } else if (link && (link.includes('docSectionId=') || link.includes('docDocumentId=') || link.includes('commentId='))) {
                                        // Link already has document collection tracker parameters, preserve it
                                        commentLink = link;
                                        console.log('📧 Email link: Using existing link with doc collection params:', commentLink);
                                    } else if (metadataObj?.weeklySectionId || metadataObj?.weeklyDocumentId || metadataObj?.weeklyWeek || metadataObj?.weeklyMonth || (metadataObj?.sectionId && metadataObj?.weekNumber)) {
                                        // Weekly FMS review tracker comment - build link with weekly parameters from metadata
                                        const baseLink = link || `#/projects/${projectId}`;
                                        
                                        // Build weekly FMS review tracker link with all parameters
                                        const queryParams = [];
                                        if (metadataObj.weeklySectionId || metadataObj.sectionId) queryParams.push(`weeklySectionId=${encodeURIComponent(metadataObj.weeklySectionId || metadataObj.sectionId)}`);
                                        if (metadataObj.weeklyDocumentId || metadataObj.documentId) queryParams.push(`weeklyDocumentId=${encodeURIComponent(metadataObj.weeklyDocumentId || metadataObj.documentId)}`);
                                        if (metadataObj.weeklyMonth !== undefined && metadataObj.weeklyMonth !== null) {
                                            queryParams.push(`weeklyMonth=${encodeURIComponent(metadataObj.weeklyMonth)}`);
                                        } else if (metadataObj.month !== undefined && metadataObj.month !== null) {
                                            queryParams.push(`weeklyMonth=${encodeURIComponent(metadataObj.month)}`);
                                        }
                                        if (metadataObj.weeklyWeek !== undefined && metadataObj.weeklyWeek !== null) {
                                            queryParams.push(`weeklyWeek=${encodeURIComponent(metadataObj.weeklyWeek)}`);
                                        } else if (metadataObj.weekNumber !== undefined && metadataObj.weekNumber !== null) {
                                            queryParams.push(`weeklyWeek=${encodeURIComponent(metadataObj.weekNumber)}`);
                                        }
                                        if (metadataObj.commentId) queryParams.push(`commentId=${encodeURIComponent(metadataObj.commentId)}`);
                                        
                                        const separator = baseLink.includes('?') ? '&' : '?';
                                        commentLink = queryParams.length > 0 
                                            ? `${baseLink}${separator}${queryParams.join('&')}`
                                            : baseLink;
                                        console.log('📧 Email link: Built weekly FMS review link from metadata:', commentLink, 'Metadata:', { weeklySectionId: metadataObj.weeklySectionId || metadataObj.sectionId, weeklyDocumentId: metadataObj.weeklyDocumentId || metadataObj.documentId, weeklyMonth: metadataObj.weeklyMonth || metadataObj.month, weeklyWeek: metadataObj.weeklyWeek || metadataObj.weekNumber, commentId: metadataObj.commentId });
                                    } else if (metadataObj?.sectionId || metadataObj?.documentId || metadataObj?.commentId) {
                                        // Document collection tracker comment - build link with all parameters from metadata
                                        const baseLink = link || `#/projects/${projectId}`;
                                        
                                        // Build document collection tracker link with all parameters
                                        const queryParams = [];
                                        if (metadataObj.sectionId) queryParams.push(`docSectionId=${encodeURIComponent(metadataObj.sectionId)}`);
                                        if (metadataObj.documentId) queryParams.push(`docDocumentId=${encodeURIComponent(metadataObj.documentId)}`);
                                        if (metadataObj.month !== undefined && metadataObj.month !== null) queryParams.push(`docMonth=${encodeURIComponent(metadataObj.month)}`);
                                        if (metadataObj.commentId) queryParams.push(`commentId=${encodeURIComponent(metadataObj.commentId)}`);
                                        
                                        const separator = baseLink.includes('?') ? '&' : '?';
                                        commentLink = queryParams.length > 0 
                                            ? `${baseLink}${separator}${queryParams.join('&')}`
                                            : baseLink;
                                        console.log('📧 Email link: Built document collection link from metadata:', commentLink, 'Metadata:', { sectionId: metadataObj.sectionId, documentId: metadataObj.documentId, month: metadataObj.month, commentId: metadataObj.commentId });
                                    } else if (metadataObj?.taskId) {
                                        // Task comment - include task ID and commentId for direct navigation
                                        // Check if link already has task/commentId parameters - if so, use it as-is
                                        if (link && (link.includes('?task=') || link.includes('&task=') || link.includes('commentId='))) {
                                            commentLink = link;
                                        } else {
                                            // Build task-specific link with query parameters
                                            // Use hash-based routing format for frontend navigation
                                            const baseLink = link || `#/projects/${projectId}`;
                                            
                                            // Build query parameters
                                            const queryParams = [];
                                            if (metadataObj.taskId) queryParams.push(`task=${encodeURIComponent(metadataObj.taskId)}`);
                                            if (metadataObj.commentId) queryParams.push(`commentId=${encodeURIComponent(metadataObj.commentId)}`);
                                            
                                            const separator = baseLink.includes('?') ? '&' : '?';
                                            commentLink = queryParams.length > 0 
                                                ? `${baseLink}${separator}${queryParams.join('&')}`
                                                : baseLink;
                                        }
                                    } else {
                                        // For project-level notifications, use project link with hash routing
                                        commentLink = link || `#/projects/${projectId}`;
                                    }
                                }
                            }
                        } catch (fetchError) {
                            console.error('❌ Error fetching project/client details for email:', fetchError.message);
                            // Continue with email even if fetch fails - we'll use what we have
                        }
                    }
                    
                    // Build enhanced email subject with project and client names
                    let enhancedSubject = title;
                    if (projectName || clientName) {
                        const parts = [];
                        if (clientName) parts.push(clientName);
                        if (projectName) parts.push(projectName);
                        if (parts.length > 0) {
                            enhancedSubject = `[${parts.join(' - ')}] ${title}`;
                        }
                    }
                    
                    // Build enhanced message with project/client context and comment extract
                    let enhancedMessage = message;
                    
                    // Add project and client context at the top of the message
                    if (projectName || clientName) {
                        let contextHtml = '<div style="background: #e7f3ff; border-left: 4px solid #007bff; padding: 15px; margin-bottom: 20px; border-radius: 4px;">';
                        contextHtml += '<h3 style="color: #333; margin-top: 0; margin-bottom: 10px; font-size: 16px;">📋 Project Context</h3>';
                        if (clientName) {
                            contextHtml += `<p style="color: #555; margin: 5px 0;"><strong>Client:</strong> ${escapeHtml(clientName)}</p>`;
                        }
                        if (projectName) {
                            contextHtml += `<p style="color: #555; margin: 5px 0;"><strong>Project:</strong> ${escapeHtml(projectName)}</p>`;
                        }
                        if (taskTitle) {
                            contextHtml += `<p style="color: #555; margin: 5px 0;"><strong>Task:</strong> ${escapeHtml(taskTitle)}</p>`;
                        }
                        contextHtml += '</div>';
                        enhancedMessage = contextHtml + enhancedMessage;
                    }
                    
                    // Add comment extract if available
                    if (commentText) {
                        const commentPreview = commentText.length > 200 
                            ? commentText.substring(0, 200) + '...' 
                            : commentText;
                        const commentHtml = `
                            <div style="background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px; padding: 15px; margin: 20px 0;">
                                <h4 style="color: #333; margin-top: 0; margin-bottom: 10px; font-size: 14px;">💬 Comment:</h4>
                                <p style="color: #555; margin: 0; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(commentPreview)}</p>
                            </div>
                        `;
                        enhancedMessage = enhancedMessage + commentHtml;
                    }
                    
                    const emailResult = await sendNotificationEmail(
                        targetUser.email,
                        enhancedSubject,
                        enhancedMessage,
                        {
                            projectName,
                            clientName,
                            clientDescription,
                            projectDescription,
                            commentText,
                            commentLink,
                            taskTitle,
                            taskDescription,
                            taskStatus,
                            taskPriority,
                            taskDueDate,
                            taskListName,
                            isProjectRelated: !!(metadata && (type === 'comment' || type === 'mention' || type === 'task')),
                            skipNotificationCreation: true // Skip because notification is already created above
                        }
                    );
                } catch (emailError) {
                    console.error('❌ Failed to send email notification:', emailError);
                    console.error('❌ Email notification error details:', {
                        message: emailError.message,
                        code: emailError.code,
                        response: emailError.response,
                        to: targetUser.email,
                        subject: title,
                        type,
                        stack: emailError.stack
                    });
                    // Don't fail the request if email fails - notification was still created
                    // But log the error so we can diagnose email configuration issues
                }
            } else if (shouldSendEmail && !targetUser.email) {
                console.warn(`⚠️ Cannot send email notification to user ${targetUserId} - user has no email address`);
            }
            
            const responseData = { notification, created: !!notification };
            
            return ok(res, responseData);
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

