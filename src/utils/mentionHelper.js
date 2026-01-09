// @mention helper utilities
// Version: 2025-11-03-v2 (with enhanced token refresh debugging)
const MentionHelper = {
    /**
     * Normalize identifiers for matching (names, usernames, emails)
     * Removes whitespace and non-alphanumeric characters, lowercases result.
     * @param {string} value
     * @returns {string}
     */
    normalizeIdentifier(value) {
        if (!value) return '';
        return value
            .toString()
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
    },

    /**
     * Shared mention regex allowing spaces, dots, hyphens and underscores within names.
     * Example matches: @john, @John Doe, @john.doe, @john-doe
     */
    get mentionRegex() {
        return /@([A-Za-z0-9._-]+(?:\s+[A-Za-z0-9._-]+)*)/g;
    },

    /**
     * Parse @mentions from text content
     * @param {string} text - The text content to parse
     * @returns {Array} Array of { username, normalized, startIndex, endIndex }
     */
    parseMentions(text) {
        if (!text) return [];

        const mentionRegex = this.mentionRegex;
        const mentions = [];
        let match;

        while ((match = mentionRegex.exec(text)) !== null) {
            const rawUsername = match[1]?.trim();
            if (!rawUsername) continue;

            mentions.push({
                username: rawUsername,
                normalized: this.normalizeIdentifier(rawUsername),
                startIndex: match.index,
                endIndex: match.index + match[0].length
            });
        }

        return mentions;
    },
    
    /**
     * Highlight mentions in text with HTML
     * @param {string} text - The text content
     * @param {boolean} isDark - Dark mode flag
     * @returns {string} HTML string with highlighted mentions
     */
    highlightMentions(text, isDark = false) {
        if (!text) return text;

        const mentionRegex = this.mentionRegex;
        const mentionColor = isDark ? '#60a5fa' : '#3b82f6';

        return text.replace(mentionRegex, (match, username) => {
            const safeUsername = username.trim();
            return `<span style="color: ${mentionColor}; font-weight: 600;">@${safeUsername}</span>`;
        });
    },
    
    /**
     * Check if text contains mentions
     * @param {string} text - The text content
     * @returns {boolean}
     */
    hasMentions(text) {
        if (!text) return false;
        return this.mentionRegex.test(text);
    },
    
    /**
     * Get unique usernames from text
     * @param {string} text - The text content
     * @returns {Array} Array of unique mention objects { raw, normalized }
     */
    getMentionedUsernames(text) {
        if (!text) return [];

        const mentions = this.parseMentions(text);
        const seen = new Set();
        const uniqueMentions = [];

        for (const mention of mentions) {
            const key = mention.normalized;
            if (!key) continue;
            if (seen.has(key)) continue;
            seen.add(key);
            uniqueMentions.push({
                raw: mention.username,
                normalized: key
            });
        }

        return uniqueMentions;
    },
    
    /**
     * Create a mention notification
     * @param {string} mentionedUserId - The user being mentioned
     * @param {string} mentionedByName - The name of the person who mentioned them
     * @param {string} contextTitle - Title of the context (e.g., "Project: ABC", "Task: Build Feature")
     * @param {string} contextLink - Link to the context
     * @param {string} commentText - The full comment text
     * @param {Object} projectInfo - Optional project information (projectId, projectName, taskId, taskTitle)
     * @returns {Promise} - API response
     */
    async createMentionNotification(mentionedUserId, mentionedByName, contextTitle, contextLink, commentText, projectInfo = {}) {
        
        try {
            // Use DatabaseAPI.makeRequest() which handles token refresh automatically
            if (!window.DatabaseAPI || typeof window.DatabaseAPI.makeRequest !== 'function') {
                console.error('❌ DatabaseAPI.makeRequest is not available');
                return null;
            }
            
            // Truncate comment text for preview
            const previewText = commentText.length > 100 
                ? commentText.substring(0, 100) + '...' 
                : commentText;
            
            // Build metadata with base information
            const metadata = {
                mentionedBy: mentionedByName,
                context: contextTitle,
                fullComment: commentText,
                commentText: commentText  // Also include as commentText for consistency
            };
            
            // Add project / context information if available.
            // IMPORTANT: We keep this in sync with NotificationCenter's expectations:
            // - projectId, projectName
            // - taskId, taskTitle
            // - sectionId, documentId, month, commentId (for document collection tracker)
            if (projectInfo && typeof projectInfo === 'object') {
                if (projectInfo.projectId) {
                    metadata.projectId = projectInfo.projectId;
                }
                if (projectInfo.projectName) {
                    metadata.projectName = projectInfo.projectName;
                }
                if (projectInfo.taskId) {
                    metadata.taskId = projectInfo.taskId;
                }
                if (projectInfo.taskTitle) {
                    metadata.taskTitle = projectInfo.taskTitle;
                }
                // MonthlyDocumentCollectionTracker deep-link support
                if (projectInfo.sectionId) {
                    metadata.sectionId = projectInfo.sectionId;
                }
                if (projectInfo.documentId) {
                    metadata.documentId = projectInfo.documentId;
                }
                if (projectInfo.month !== undefined && projectInfo.month !== null) {
                    metadata.month = projectInfo.month;
                }
                if (projectInfo.commentId) {
                    metadata.commentId = projectInfo.commentId;
                }
            }
            
            // Generate entity URL if we have entity information
            // IMPORTANT: If contextLink already contains weekly FMS review or document collection tracker parameters,
            // preserve it as-is instead of generating a new URL
            let entityUrl = contextLink;
            const hasWeeklyFMSReviewParams = contextLink && (
                contextLink.includes('weeklySectionId=') || 
                contextLink.includes('weeklyDocumentId=') || 
                contextLink.includes('weeklyWeek=') || 
                contextLink.includes('weeklyMonth=')
            );
            const hasDocumentCollectionParams = contextLink && (
                contextLink.includes('docSectionId=') || 
                contextLink.includes('docDocumentId=') || 
                contextLink.includes('docMonth=')
            );
            
            // If contextLink has weekly FMS review or document collection tracker parameters, use it as-is
            // Don't generate a new URL that would lose these important parameters
            if (hasWeeklyFMSReviewParams || hasDocumentCollectionParams) {
                entityUrl = contextLink;
                console.log('📧 MentionHelper: Preserving contextLink with tracker params:', entityUrl);
            } else if (window.EntityUrl) {
                // Try to generate URL from metadata (only if contextLink doesn't have tracker params)
                if (metadata.projectId) {
                    // If we have a task, link to the task with parent project; otherwise link to project
                    if (metadata.taskId) {
                        entityUrl = window.EntityUrl.getEntityUrl('task', metadata.taskId, {
                            parentId: metadata.projectId,
                            parentType: 'project',
                            tab: 'comments'
                        });
                    } else {
                        entityUrl = window.EntityUrl.getEntityUrl('project', metadata.projectId, {
                            tab: 'comments'
                        });
                    }
                } else if (metadata.clientId) {
                    entityUrl = window.EntityUrl.getEntityUrl('client', metadata.clientId, {
                        tab: 'comments'
                    });
                } else if (metadata.opportunityId) {
                    entityUrl = window.EntityUrl.getEntityUrl('opportunity', metadata.opportunityId, {
                        parentId: metadata.clientId,
                        parentType: 'client',
                        tab: 'comments'
                    });
                }
            }
            
            // Ensure URL is valid using NotificationUrlHelper if available
            // IMPORTANT: If entityUrl or contextLink already has weekly FMS review or document collection params, preserve it
            // Don't let NotificationUrlHelper reconstruct and lose the params
            const entityUrlHasWeeklyParams = entityUrl && (
                entityUrl.includes('weeklySectionId=') || 
                entityUrl.includes('weeklyDocumentId=') || 
                entityUrl.includes('weeklyWeek=') || 
                entityUrl.includes('weeklyMonth=')
            );
            const contextLinkHasWeeklyParams = contextLink && (
                contextLink.includes('weeklySectionId=') || 
                contextLink.includes('weeklyDocumentId=') || 
                contextLink.includes('weeklyWeek=') || 
                contextLink.includes('weeklyMonth=')
            );
            const entityUrlHasDocParams = entityUrl && (
                entityUrl.includes('docSectionId=') || 
                entityUrl.includes('docDocumentId=') || 
                entityUrl.includes('docMonth=')
            );
            const contextLinkHasDocParams = contextLink && (
                contextLink.includes('docSectionId=') || 
                contextLink.includes('docDocumentId=') || 
                contextLink.includes('docMonth=')
            );
            
            // Prioritize contextLink if it has the correct params, otherwise use entityUrl
            if (contextLinkHasWeeklyParams || contextLinkHasDocParams) {
                // ContextLink has the correct params, use it
                entityUrl = contextLink;
                console.log('📧 MentionHelper: Using contextLink with params:', entityUrl);
            } else if (entityUrlHasWeeklyParams || entityUrlHasDocParams) {
                // Entity URL already has params, use it as-is
                // Don't call ensureUrl as it might reconstruct and lose params
                console.log('📧 MentionHelper: Preserving entityUrl with params:', entityUrl);
            } else if (window.NotificationUrlHelper && typeof window.NotificationUrlHelper.ensureUrl === 'function') {
                entityUrl = window.NotificationUrlHelper.ensureUrl(entityUrl || contextLink, metadata);
                console.log('📧 MentionHelper: Using NotificationUrlHelper.ensureUrl result:', entityUrl);
            } else if (!entityUrl || entityUrl.trim() === '') {
                // Fallback: use contextLink or default to dashboard
                entityUrl = contextLink || '/dashboard';
                console.log('📧 MentionHelper: Using fallback entityUrl:', entityUrl);
            }
            
            // Final validation - if entityUrl is just '#' or empty, try to rebuild from metadata or contextLink
            if (!entityUrl || entityUrl.trim() === '' || entityUrl === '#') {
                console.warn('⚠️ MentionHelper: entityUrl is empty or just "#", rebuilding from contextLink or metadata');
                if (contextLink && contextLink.trim() !== '' && contextLink !== '#') {
                    entityUrl = contextLink;
                    console.log('📧 MentionHelper: Using contextLink as fallback:', entityUrl);
                } else if (metadata.weeklySectionId || metadata.weeklyDocumentId || (metadata.sectionId && metadata.weekNumber)) {
                    // Build hash-based URL from metadata for weekly FMS review
                    const projectId = metadata.projectId;
                    if (projectId) {
                        const queryParams = [];
                        if (metadata.weeklySectionId || metadata.sectionId) queryParams.push(`weeklySectionId=${encodeURIComponent(metadata.weeklySectionId || metadata.sectionId)}`);
                        if (metadata.weeklyDocumentId || metadata.documentId) queryParams.push(`weeklyDocumentId=${encodeURIComponent(metadata.weeklyDocumentId || metadata.documentId)}`);
                        if (metadata.weeklyMonth !== undefined && metadata.weeklyMonth !== null) {
                            queryParams.push(`weeklyMonth=${encodeURIComponent(metadata.weeklyMonth)}`);
                        } else if (metadata.month !== undefined && metadata.month !== null) {
                            queryParams.push(`weeklyMonth=${encodeURIComponent(metadata.month)}`);
                        }
                        if (metadata.weeklyWeek !== undefined && metadata.weeklyWeek !== null) {
                            queryParams.push(`weeklyWeek=${encodeURIComponent(metadata.weeklyWeek)}`);
                        } else if (metadata.weekNumber !== undefined && metadata.weekNumber !== null) {
                            queryParams.push(`weeklyWeek=${encodeURIComponent(metadata.weekNumber)}`);
                        }
                        if (metadata.commentId) queryParams.push(`commentId=${encodeURIComponent(metadata.commentId)}`);
                        entityUrl = `#/projects/${projectId}${queryParams.length > 0 ? '?' + queryParams.join('&') : ''}`;
                        console.log('📧 MentionHelper: Rebuilt entityUrl from weekly FMS review metadata:', entityUrl);
                    }
                } else if (metadata.sectionId || metadata.documentId) {
                    // Build hash-based URL from metadata for document collection
                    const projectId = metadata.projectId;
                    if (projectId) {
                        const queryParams = [];
                        if (metadata.sectionId) queryParams.push(`docSectionId=${encodeURIComponent(metadata.sectionId)}`);
                        if (metadata.documentId) queryParams.push(`docDocumentId=${encodeURIComponent(metadata.documentId)}`);
                        if (metadata.month !== undefined && metadata.month !== null) queryParams.push(`docMonth=${encodeURIComponent(metadata.month)}`);
                        if (metadata.commentId) queryParams.push(`commentId=${encodeURIComponent(metadata.commentId)}`);
                        entityUrl = `#/projects/${projectId}${queryParams.length > 0 ? '?' + queryParams.join('&') : ''}`;
                        console.log('📧 MentionHelper: Rebuilt entityUrl from document collection metadata:', entityUrl);
                    }
                }
            }
            
            console.log('📧 MentionHelper: Final notification payload link:', entityUrl, 'Metadata:', metadata);
            
            const notificationPayload = {
                userId: mentionedUserId,
                type: 'mention',
                title: `${mentionedByName} mentioned you`,
                message: `${mentionedByName} mentioned you in ${contextTitle}: "${previewText}"`,
                link: entityUrl,
                metadata: metadata
            };
            
            
            // Use DatabaseAPI.makeRequest() which automatically handles:
            // - Token extraction from storage
            // - Token refresh on 401 errors
            // - Proper error handling
            const response = await window.DatabaseAPI.makeRequest('/notifications', {
                method: 'POST',
                body: JSON.stringify(notificationPayload)
            });
            
            
            // DatabaseAPI.makeRequest returns { data: {...} } structure
            if (response && (response.data || response)) {
                const notification = response.data || response;
                return notification;
            } else {
                console.error('❌ Unexpected response structure from DatabaseAPI:', response);
                return null;
            }
        } catch (error) {
            console.error('❌ Error creating mention notification:', error);
            console.error('❌ Error details:', {
                message: error.message,
                status: error.status,
                code: error.code,
                stack: error.stack,
                mentionedUserId,
                mentionedByName
            });
            return null;
        }
    },
    
    /**
     * Process mentions in text and create notifications for all mentioned users
     * @param {string} commentText - The comment text
     * @param {string} contextTitle - Title of the context
     * @param {string} contextLink - Link to the context
     * @param {string} authorName - Name of the comment author
     * @param {Array} allUsers - Array of all users to match against
     * @param {Object} projectInfo - Optional project information (projectId, projectName, taskId, taskTitle)
     * @returns {Promise<Array>} Array of notification results
     */
    async processMentions(commentText, contextTitle, contextLink, authorName, allUsers, projectInfo = {}) {
        if (!this.hasMentions(commentText)) {
            return [];
        }

        const mentionedEntries = this.getMentionedUsernames(commentText);
        if (!mentionedEntries || mentionedEntries.length === 0) {
            return [];
        }

        const notificationPromises = [];

        // Match usernames to actual users
        for (const mentionEntry of mentionedEntries) {
            const normalizedMention = typeof mentionEntry === 'string'
                ? this.normalizeIdentifier(mentionEntry)
                : mentionEntry.normalized;
            const rawMention = typeof mentionEntry === 'string'
                ? mentionEntry
                : mentionEntry.raw;

            const matchedUser = allUsers.find(user => {
                // Match by name (case-insensitive, partial match)
                const userNameLower = this.normalizeIdentifier(user.name || '');
                const usernameLower = normalizedMention;

                // Try exact match first
                if (userNameLower === usernameLower) {
                    return true;
                }

                // Try partial match (e.g., "john" matches "John Doe")
                if (userNameLower.includes(usernameLower) || usernameLower.includes(userNameLower)) {
                    return true;
                }

                // Try email match
                const emailUsername = this.normalizeIdentifier(
                    (user.email || '').split('@')[0]
                );
                if (emailUsername === usernameLower) {
                    return true;
                }

                return false;
            });

            if (matchedUser) {
                const currentUser = window.storage?.getUserInfo?.() || {};
                const isSelfMention = matchedUser.id === currentUser.id;
                
                // Don't notify if the user mentioned themselves
                if (isSelfMention) {
                    continue;
                }
                
                // Send notification for mentions (excluding self-mentions)
                notificationPromises.push(
                    this.createMentionNotification(
                        matchedUser.id,
                        authorName,
                        contextTitle,
                        contextLink,
                        commentText,
                        projectInfo
                    ).catch(error => {
                        console.error(`❌ Failed to create mention notification for ${matchedUser.name}:`, error);
                        return null;
                    })
                );
            } else {
                console.warn(`⚠️ No user found matching mention: @${rawMention}`, {
                    normalized: normalizedMention,
                    availableUsers: allUsers.slice(0, 5).map(u => ({ id: u.id, name: u.name, email: u.email }))
                });
            }
        }

        return await Promise.all(notificationPromises);
    },
    
    /**
     * Render mention suggestions dropdown HTML
     * @param {Array} users - Array of users to show
     * @param {boolean} isDark - Dark mode flag
     * @returns {string} HTML string
     */
    renderMentionSuggestions(users, isDark = false) {
        if (!users || users.length === 0) return '';
        
        const bgColor = isDark ? 'bg-gray-800' : 'bg-white';
        const borderColor = isDark ? 'border-gray-700' : 'border-gray-200';
        const textColor = isDark ? 'text-gray-200' : 'text-gray-900';
        const hoverColor = isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50';
        
        return `
            <div class="absolute z-50 mt-1 w-64 ${bgColor} ${borderColor} border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                ${users.map(user => `
                    <div class="mention-suggestion ${hoverColor} px-3 py-2 cursor-pointer" data-userid="${user.id}" data-username="${user.name}">
                        <div class="flex items-center">
                            <div class="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold text-sm mr-2">
                                ${(user.name || user.email || 'U').charAt(0).toUpperCase()}
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="${textColor} font-medium truncate">${user.name || user.email}</div>
                                ${user.email && user.name ? `<div class="${isDark ? 'text-gray-400' : 'text-gray-500'} text-xs truncate">${user.email}</div>` : ''}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
};

// Make available globally and for CommonJS consumers
(function() {
    if (typeof window !== 'undefined') {
        window.MentionHelper = MentionHelper;
    }
    const globalModule = typeof globalThis !== 'undefined' ? globalThis.module : undefined;
    if (globalModule && typeof globalModule.exports !== 'undefined') {
        globalModule.exports = MentionHelper;
    }
})();

