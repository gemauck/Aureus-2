// Notifications API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { sendNotificationEmail } from './_lib/email.js'
import { parseJsonBody } from './_lib/body.js'
import { logDatabaseError } from './_lib/dbErrorHandler.js'
import {
    appendTabQueryParamForSource,
    emailTrackerSectionLabel,
    isWeeklyTrackerMetadata
} from './_lib/projectTrackerDeepLink.js'

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
    const id = targetUserId != null ? String(targetUserId) : null;
    if (!id) return null;
    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) return null;

    let settings = await prisma.notificationSetting.findUnique({ where: { userId: id } });
    if (!settings) {
        settings = await prisma.notificationSetting.create({
            data: {
                userId: id,
                emailTasks: true, emailMentions: true, emailComments: true, emailInvoices: true, emailSystem: true,
                inAppTasks: true, inAppMentions: true, inAppComments: true, inAppInvoices: true, inAppSystem: true
            }
        });
    }

    const metadataObj = typeof metadata === 'string' ? (() => { try { return JSON.parse(metadata); } catch (_) { return {}; } })() : (metadata || {});
    // Team discussion notifications always show in the bell (discussions section = in-app)
    const isTeamDiscussion = metadataObj.source === 'team_discussion' || metadataObj.source === 'team_discussion_reply';
    let shouldCreateInApp = isTeamDiscussion || (type === 'mention' && settings.inAppMentions) || (type === 'comment' && settings.inAppComments) ||
        (type === 'task' && settings.inAppTasks) || (type === 'invoice' && settings.inAppInvoices) || (type === 'system' && settings.inAppSystem);

    let validLink = link || '';
    // Prefer frontend-supplied link whenever it has tracker section+document (correct cell; docMonth/docWeek may be in hash)
    const linkHasDocSectionId = validLink && String(validLink).includes('docSectionId=');
    const linkHasDocDocumentId = validLink && String(validLink).includes('docDocumentId=');
    const linkIsFullTrackerDeepLink = linkHasDocSectionId && linkHasDocDocumentId;
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
    // Prefer frontend-supplied link for client/lead/helpdesk/task/teams deep links (same logic as tracker links)
    const linkIsEntityDeepLink = validLink && String(validLink).trim() && (
        validLink.includes('#/clients/') || validLink.includes('#/leads/') ||
        validLink.includes('#/helpdesk/') || validLink.includes('#/teams') ||
        validLink.includes('#/reports') || validLink.includes('#/leave-platform') ||
        (validLink.includes('#/projects/') && validLink.includes('task='))
    );
    // Otherwise build from metadata when we have tracker params (or no link)
    const hasTrackerMetadata = metadataObj.projectId && (
        metadataObj.sectionId || metadataObj.documentId || metadataObj.commentId || metadataObj.month != null ||
        metadataObj.weeklySectionId || metadataObj.weeklyDocumentId || metadataObj.weeklyWeek != null || metadataObj.week != null || metadataObj.weekNumber != null
    );
    if (!linkIsFullTrackerDeepLink && !linkIsEntityDeepLink && (hasTrackerMetadata || !validLink || !validLink.trim())) {
        try {
            const docYearVal = metadataObj.docYear != null ? metadataObj.docYear : metadataObj.year;
            const weeklyWeekLabel = metadataObj.docWeek ?? metadataObj.weeklyWeek ?? metadataObj.week ?? metadataObj.weekNumber ?? metadataObj.weeklyMonth;
            if (
                isWeeklyTrackerMetadata(metadataObj) &&
                metadataObj.projectId &&
                (metadataObj.weeklySectionId || metadataObj.sectionId) &&
                (metadataObj.weeklyDocumentId || metadataObj.documentId)
            ) {
                validLink = `#/projects/${metadataObj.projectId}`;
                const q = [];
                const sectionId = metadataObj.weeklySectionId || metadataObj.sectionId;
                const documentId = metadataObj.weeklyDocumentId || metadataObj.documentId;
                if (sectionId) q.push(`docSectionId=${encodeURIComponent(sectionId)}`);
                if (documentId) q.push(`docDocumentId=${encodeURIComponent(documentId)}`);
                if (weeklyWeekLabel != null) q.push(`docWeek=${encodeURIComponent(weeklyWeekLabel)}`);
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
                appendTabQueryParamForSource(q, metadataObj.source);
                if (q.length) validLink += `?${q.join('&')}`;
            } else if (!validLink || !validLink.trim()) {
                if (metadataObj.projectId) validLink = `#/projects/${metadataObj.projectId}`;
                else if (metadataObj.taskId) {
                    if (metadataObj.projectId) {
                        const tq = [`task=${encodeURIComponent(metadataObj.taskId)}`];
                        if (metadataObj.commentId) tq.push(`commentId=${encodeURIComponent(metadataObj.commentId)}`);
                        validLink = `#/projects/${metadataObj.projectId}?${tq.join('&')}`;
                    } else {
                        validLink = `#/tasks/${metadataObj.taskId}${metadataObj.commentId ? `?commentId=${encodeURIComponent(metadataObj.commentId)}` : ''}`;
                    }
                }
                else if (metadataObj.clientId) validLink = `#/clients/${metadataObj.clientId}`;
                else if (metadataObj.leadId) validLink = `#/clients/${metadataObj.leadId}`;
                else if (metadataObj.ticketId) {
                    validLink = `#/helpdesk/${metadataObj.ticketId}`;
                    if (metadataObj.commentId) {
                        validLink += `?commentId=${encodeURIComponent(metadataObj.commentId)}`;
                    }
                }
                else validLink = '/dashboard';
            }
        } catch (_) {
            if (!validLink || !validLink.trim()) validLink = '/dashboard';
        }
    }
    try {
        const meetingNotesLike =
            metadataObj.source === 'meeting_notes' ||
            (metadataObj.meetingCommentId &&
                (metadataObj.monthlyNotesId || metadataObj.departmentNotesId || metadataObj.actionItemId));
        if (meetingNotesLike) {
            const { resolveMeetingNotesLinkContext, buildMeetingNotesAppLink } = await import('./_lib/meetingNotesDeepLink.js');
            const ctx = await resolveMeetingNotesLinkContext(prisma, {
                monthlyNotesId: metadataObj.monthlyNotesId || null,
                departmentNotesId: metadataObj.departmentNotesId || null,
                actionItemId: metadataObj.actionItemId || null
            });
            validLink = buildMeetingNotesAppLink(ctx, metadataObj.meetingCommentId || metadataObj.commentId || null);
        } else if (metadataObj.type === 'week_created' && metadataObj.monthKey && metadataObj.weekKey) {
            const q = new URLSearchParams();
            q.set('tab', 'meeting-notes');
            q.set('team', 'management');
            q.set('month', String(metadataObj.monthKey));
            q.set('week', String(metadataObj.weekKey));
            validLink = `#/teams/management?${q.toString()}`;
        }
    } catch (_) {
        /* keep prior validLink */
    }
    if (validLink && !validLink.startsWith('/') && !validLink.startsWith('#')) validLink = '/' + validLink;

    // Avoid duplicate in-app rows + emails when the same mention/comment notify runs twice in quick succession
    // (double submit, retry, or overlapping client/server paths). Team discussions can fire rapid legitimate replies.
    const DEDUPE_WINDOW_MS = 120_000;
    if ((type === 'mention' || type === 'comment') && !isTeamDiscussion) {
        const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
        const titleNorm = String(title || '').trim();
        const messageNorm = String(message || '').trim();
        const linkNorm = String(validLink || '').trim();
        const existingDup = await prisma.notification.findFirst({
            where: {
                userId: id,
                type,
                title: titleNorm,
                message: messageNorm,
                link: linkNorm,
                createdAt: { gte: since }
            },
            orderBy: { createdAt: 'desc' }
        });
        if (existingDup) {
            console.warn('📧 Skipping duplicate notification email/in-app (same fingerprint within 120s)', {
                userId: id,
                type,
                titlePreview: titleNorm.slice(0, 48)
            });
            return { notification: existingDup, created: false };
        }
    }

    let notification = null;
    if (shouldCreateInApp) {
        try {
            notification = await prisma.notification.create({
                data: {
                    userId: id,
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
    if (!targetUser.email) {
        if (type === 'comment' || type === 'mention') console.warn('📧 Notification: user has no email, skipping:', id, targetUser.name);
    } else if (!shouldSendEmail && (type === 'comment' || type === 'mention')) {
        console.warn('📧 Notification: user has emailComments/emailMentions disabled, skipping:', id, targetUser.email);
    }
    if (shouldSendEmail && targetUser.email) {
        try {
            let projectName = null, clientName = null, commentText = null, commentLink = validLink || link || null, taskTitle = null;
            let metadataForEmail = {};
            try {
                metadataForEmail = metadata != null
                    ? (typeof metadata === 'string' ? JSON.parse(metadata) : metadata)
                    : {};
            } catch (_) {
                metadataForEmail = typeof metadata === 'object' && metadata !== null ? metadata : {};
            }
            const metadataObj = metadataForEmail;
            if (metadataObj && (type === 'comment' || type === 'mention' || type === 'task' || (type === 'system' && (metadataObj.clientId || metadataObj.leadId)))) {
                commentText = metadataObj.commentText || metadataObj.fullComment || null;
                // For mention emails, ensure the comment shown matches the notification: use the quoted preview from message if present.
                // This fixes cases where metadata comment was missing or wrong (e.g. stale/cached), so the email always shows the comment that triggered the mention.
                if (type === 'mention' && message && typeof message === 'string') {
                    const prefix = ': "';
                    const idx = message.indexOf(prefix);
                    if (idx !== -1) {
                        const start = idx + prefix.length;
                        const after = message.slice(start);
                        const endQuote = after.lastIndexOf('"');
                        if (endQuote !== -1) {
                            const fromMessage = after.slice(0, endQuote).trim();
                            if (fromMessage) commentText = fromMessage;
                        }
                    }
                }
                taskTitle = metadataObj.taskTitle || null;
                if (metadataObj.projectId) {
                    const p = await prisma.project.findUnique({ where: { id: metadataObj.projectId }, include: { client: true } });
                    if (p) {
                        projectName = p.name || null;
                        clientName = p.client?.name || null;
                        // Email must use the same validLink (tracker deep link or rebuilt) so link in email matches notification
                        commentLink = validLink && validLink.trim() ? validLink : (link || `#/projects/${metadataObj.projectId}`);
                        if (metadataObj.taskId && commentLink && !commentLink.includes('task=')) commentLink += (commentLink.includes('?') ? '&' : '?') + `task=${encodeURIComponent(metadataObj.taskId)}`;
                    }
                } else if (metadataObj.clientId || metadataObj.leadId) {
                    const cid = metadataObj.clientId || metadataObj.leadId;
                    const c = await prisma.client.findUnique({ where: { id: cid }, select: { name: true } });
                    if (c) clientName = c.name || null;
                    commentLink = link || `#/clients/${cid}`;
                } else if (metadataObj.ticketId) {
                    commentLink = link || `#/helpdesk/${metadataObj.ticketId}`;
                    if (metadataObj.commentId && commentLink && !String(commentLink).includes('commentId=')) {
                        commentLink += (commentLink.includes('?') ? '&' : '?') + `commentId=${encodeURIComponent(metadataObj.commentId)}`;
                    }
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
                enhancedMessage += '</div>';
            }
            // Source heading: where the activity lives (Projects trackers, Helpdesk, Teams, Tasks)
            const hasPeriod = metadataObj && (metadataObj.month != null || metadataObj.docYear != null || metadataObj.year != null);
            const hasDocCollectionMeta = metadataObj && (metadataObj.sectionId || metadataObj.documentId || metadataObj.projectId) && hasPeriod;
            let appendedWhereBlock = false;
            const pushWhere = (pathStr) => {
                enhancedMessage += `<div style="background:#f0f4f8;border-left:4px solid #64748b;padding:15px;margin-bottom:20px;border-radius:4px;"><h3 style="color:#333;margin:0 0 10px;font-size:16px;">📍 Where</h3><p style="color:#555;margin:5px 0;">${escapeHtml(pathStr)}</p></div>`;
                appendedWhereBlock = true;
            };
            if (hasDocCollectionMeta) {
                const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                const monthNum = metadataObj.month != null ? Number(metadataObj.month) : null;
                const year = metadataObj.docYear != null ? metadataObj.docYear : metadataObj.year;
                const monthLabel = monthNum >= 1 && monthNum <= 12 ? monthNames[monthNum - 1] : (metadataObj.month != null && metadataObj.month !== '' ? String(metadataObj.month) : '');

                const sourceValue = String(metadataObj.source || '').trim();
                const hasWeeklyHint = isWeeklyTrackerMetadata(metadataObj);
                const weeklyLabelFromMeta = metadataObj.docWeek ?? metadataObj.weeklyWeek ?? metadataObj.week ?? metadataObj.weekNumber ?? metadataObj.weeklyMonth;

                const explicitTrackerLabel = emailTrackerSectionLabel(sourceValue);
                const sourceTypeLabel = hasWeeklyHint
                    ? 'Weekly FMS review'
                    : (explicitTrackerLabel || 'Document collection');

                const periodLabel = hasWeeklyHint
                    ? (weeklyLabelFromMeta && year
                        ? `${String(weeklyLabelFromMeta)} ${year}`
                        : (weeklyLabelFromMeta != null
                            ? String(weeklyLabelFromMeta)
                            : (year != null && year !== '' ? String(year) : sourceTypeLabel)))
                    : (monthLabel && year
                        ? `${monthLabel} ${year}`
                        : (year != null && year !== '' ? String(year) : sourceTypeLabel));

                const sourceLabelTitleCase = sourceTypeLabel
                    .replace(/^document collection$/i, 'Document Collection')
                    .replace(/^monthly fms review$/i, 'Monthly FMS review')
                    .replace(/^monthly data review$/i, 'Monthly Data Review')
                    .replace(/^compliance review$/i, 'Compliance Review')
                    .replace(/^weekly fms review$/i, 'Weekly FMS review');
                const sectionName = (metadataObj.sectionName != null ? String(metadataObj.sectionName).trim() : '');
                const documentName = (metadataObj.documentName != null ? String(metadataObj.documentName).trim() : '');
                const pathParts = ['Projects', sourceLabelTitleCase];
                if (sectionName) pathParts.push(sectionName);
                if (documentName) pathParts.push(documentName);
                if (periodLabel) pathParts.push(periodLabel);
                pushWhere(pathParts.join(', '));
            }
            if (!appendedWhereBlock && metadataObj.ticketId && (type === 'comment' || type === 'mention')) {
                let ticketLabel = 'Ticket';
                try {
                    const t = await prisma.ticket.findUnique({
                        where: { id: String(metadataObj.ticketId) },
                        select: { ticketNumber: true, title: true }
                    });
                    if (t) ticketLabel = `Ticket #${t.ticketNumber}${t.title ? ': ' + t.title : ''}`;
                } catch (_) {}
                const parts = ['Helpdesk', ticketLabel];
                if (metadataObj.commentId) parts.push('Comments');
                pushWhere(parts.join(', '));
            }
            if (!appendedWhereBlock && (metadataObj.source === 'team_discussion' || metadataObj.source === 'team_discussion_reply')) {
                const teamNm = (metadataObj.teamName != null ? String(metadataObj.teamName).trim() : '') || 'Team';
                const disc = (metadataObj.discussionTitle != null ? String(metadataObj.discussionTitle).trim() : '') || 'Discussion';
                pushWhere(['Teams', teamNm, 'Discussions', disc].join(', '));
            }
            if (!appendedWhereBlock && metadataObj.taskId && taskTitle && (type === 'task' || type === 'comment' || type === 'mention')) {
                pushWhere(['Projects', 'Tasks', String(taskTitle).trim()].join(', '));
            }
            if (!appendedWhereBlock && (metadataObj.source === 'meeting_notes' || metadataObj.type === 'week_created')) {
                const deptId = metadataObj.departmentId != null ? String(metadataObj.departmentId).trim() : '';
                const parts = ['Teams', 'Management', 'Meeting notes'];
                if (metadataObj.monthKey) parts.push(String(metadataObj.monthKey));
                if (metadataObj.weekKey) parts.push(String(metadataObj.weekKey));
                if (deptId) parts.push(deptId);
                pushWhere(parts.join(', '));
            }
            if (!appendedWhereBlock && metadataObj.feedbackId) {
                const src = String(metadataObj.source || '').trim();
                const whereLabel =
                    src === 'feedback_reply' || src === 'feedback_change'
                        ? 'Reports, My queries'
                        : src === 'feedback_submitted'
                          ? 'Reports, User feedback'
                          : 'Reports, Feedback';
                pushWhere(whereLabel);
            }
            if (!appendedWhereBlock && (metadataObj.source === 'user_note' || metadataObj.source === 'project_note' || metadataObj.source === 'client_note')) {
                const kind =
                    metadataObj.source === 'project_note'
                        ? 'Project notes'
                        : metadataObj.source === 'client_note'
                          ? 'Client notes'
                          : 'My notes';
                pushWhere(['Notes', kind].join(', '));
            }
            if (commentText) {
                const prev = commentText.length > 200 ? commentText.slice(0, 200) + '...' : commentText;
                enhancedMessage += `<div style="background:#f8f9fa;border:1px solid #ddd;border-radius:4px;padding:15px;margin:20px 0;"><h4 style="color:#333;margin:0 0 10px;font-size:14px;">💬 Comment</h4><p style="color:#555;margin:0;line-height:1.6;white-space:pre-wrap;">${escapeHtml(prev)}</p></div>`;
            }
            let commentLinkLabel = null;
            if (type === 'system' && metadataObj && (metadataObj.clientId || metadataObj.leadId)) {
                commentLinkLabel = 'View client';
                const ctx = (clientName || projectName || taskTitle)
                    ? `<div style="background:#e7f3ff;border-left:4px solid #007bff;padding:15px;margin-bottom:20px;border-radius:4px;"><h3 style="color:#333;margin:0 0 10px;font-size:16px;">📋 Context</h3>`
                        + (clientName ? `<p style="color:#555;margin:5px 0;"><strong>Client:</strong> ${escapeHtml(clientName)}</p>` : '')
                        + (projectName ? `<p style="color:#555;margin:5px 0;"><strong>Project:</strong> ${escapeHtml(projectName)}</p>` : '')
                        + (taskTitle ? `<p style="color:#555;margin:5px 0;"><strong>Task:</strong> ${escapeHtml(taskTitle)}</p>` : '')
                        + '</div>'
                    : '';
                enhancedMessage = ctx + `<p style="color:#555;line-height:1.6;white-space:pre-wrap;">${escapeHtml(String(message || ''))}</p>`;
            }
            // So plain-text part does not duplicate Context/Comment (which are already in enhancedMessage)
            const messageAlreadyContainsContext = enhancedMessage !== message;
            const systemClientDeepLink = type === 'system' && metadataObj && (metadataObj.clientId || metadataObj.leadId) && (commentLink || validLink || link);
            await sendNotificationEmail(targetUser.email, enhancedSubject, enhancedMessage, {
                projectName, clientName, commentText, commentLink, commentLinkLabel, taskTitle,
                isProjectRelated: !!(metadataObj && (type === 'comment' || type === 'mention' || type === 'task')) || systemClientDeepLink,
                skipNotificationCreation: true,
                messageAlreadyContainsContext
            });
        } catch (e) {
            console.error('Failed to send email notification to', id, e);
            console.error('📧 Notification email not sent. Ensure RESEND_API_KEY (or SENDGRID_API_KEY/SMTP) is set and sending domain is verified. Recipient:', targetUser.email);
        }
    }
    return { notification, created: !!notification };
}

async function handler(req, res) {
    const safeSend = (fn) => {
        if (!res.headersSent && !res.writableEnded) return fn();
    };
    try {
        // JWT payload uses 'sub' for user ID, not 'id'
        const userId = req.user?.sub || req.user?.id;

        if (!userId) {
            console.error('❌ Notifications: No user ID found in token. req.user =', req.user);
            return unauthorized(res, 'Authentication required');
        }

        if (req.method === 'GET') {
            try {
                const read = req.query.read;
                const limit = Math.min(parseInt(req.query.limit) || 50, 100);
                const offset = Math.max(0, parseInt(req.query.offset) || 0);

                const where = { userId };
                if (read !== undefined) {
                    where.read = read === 'true';
                }

                // Timeout guard: respond with 504 before client (client uses 20s, so respond by 14s)
                const NOTIFICATIONS_GET_TIMEOUT_MS = 14000;
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('NOTIFICATIONS_TIMEOUT')), NOTIFICATIONS_GET_TIMEOUT_MS);
                });

                const fetchPromise = Promise.all([
                    prisma.notification.findMany({
                        where,
                        orderBy: { createdAt: 'desc' },
                        take: limit,
                        skip: offset
                        // Uses index (userId, createdAt) when available for fast list + sort
                    }),
                    prisma.notification.count({
                        where: { userId, read: false }
                        // Uses index (userId, read) when available for fast unread count
                    })
                ]);

                const [notifications, unreadCount] = await Promise.race([fetchPromise, timeoutPromise]);

                return ok(res, {
                    notifications,
                    unreadCount
                });
            } catch (error) {
                if (error?.message === 'NOTIFICATIONS_TIMEOUT') {
                    console.warn('⚠️ Notifications GET timed out');
                    if (!res.headersSent && !res.writableEnded) {
                        res.status(504).json({ error: 'Request timeout', message: 'Notifications took too long. Try again.' });
                    }
                    return;
                }
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
                let body = req.body || await parseJsonBody(req);
                if (body && typeof body === 'object' && body.data && !body.userId && !body.type) {
                    body = body.data;
                }
                const { userId: targetUserId, type, title, message, link, metadata } = body || {};
                if (!targetUserId || !type || !title || !message) {
                    console.error('❌ POST /notifications - Missing required fields:', { hasUserId: !!targetUserId, hasType: !!type, hasTitle: !!title, hasMessage: !!message });
                    return badRequest(res, 'Missing required fields: userId, type, title, message');
                }
                const result = await createNotificationForUser(targetUserId, type, title, message, link ?? null, metadata ?? null);
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
                const body = req.body || await parseJsonBody(req);
                let notificationIds = body?.notificationIds;
                // Fallback: some clients/proxies don't send body with DELETE; accept ids in query
                if (!notificationIds || !Array.isArray(notificationIds)) {
                    const q = req.query?.ids;
                    if (typeof q === 'string' && q.trim()) {
                        notificationIds = q.split(',').map((id) => id.trim()).filter(Boolean);
                    }
                }
                if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
                    return badRequest(res, 'Missing required field: notificationIds (array) or query param ids');
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
    } catch (err) {
        console.error('❌ Notifications handler unexpected error:', err?.message || err, err?.stack);
        safeSend(() => serverError(res, 'Failed to process notifications', err?.message));
    }
}

export default withLogging(withHttp(authRequired(handler)));

