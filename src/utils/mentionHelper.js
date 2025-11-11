// @mention helper utilities
// Version: 2025-11-03-v2 (with enhanced token refresh debugging)
const MentionHelper = {
    /**
     * Parse @mentions from text content
     * @param {string} text - The text content to parse
     * @returns {Array} Array of {username, startIndex, endIndex}
     */
    parseMentions(text) {
        if (!text) return [];
        
        const mentionRegex = /@(\w+)/g;
        const mentions = [];
        let match;
        
        while ((match = mentionRegex.exec(text)) !== null) {
            mentions.push({
                username: match[1],
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
        
        const mentionRegex = /@(\w+)/g;
        const mentionColor = isDark ? '#60a5fa' : '#3b82f6';
        
        return text.replace(mentionRegex, (match, username) => {
            return `<span style="color: ${mentionColor}; font-weight: 600;">@${username}</span>`;
        });
    },
    
    /**
     * Check if text contains mentions
     * @param {string} text - The text content
     * @returns {boolean}
     */
    hasMentions(text) {
        if (!text) return false;
        return /@\w+/.test(text);
    },
    
    /**
     * Get unique usernames from text
     * @param {string} text - The text content
     * @returns {Array} Array of unique usernames
     */
    getMentionedUsernames(text) {
        if (!text) return [];
        
        const mentions = this.parseMentions(text);
        const usernames = mentions.map(m => m.username.toLowerCase());
        return [...new Set(usernames)]; // Return unique usernames
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
        // Version check - this log confirms new code is loaded
        console.log('🔔 MentionHelper v3: Creating notification for user:', mentionedUserId);
        console.log('🔔 Using DatabaseAPI.makeRequest() with built-in token refresh');
        
        try {
            // Use DatabaseAPI.makeRequest() which handles token refresh automatically
            // This is the same method used by all other successful API calls (projects, clients, etc.)
            if (!window.DatabaseAPI || typeof window.DatabaseAPI.makeRequest !== 'function') {
                console.error('❌ DatabaseAPI.makeRequest is not available');
                return null;
            }
            
            // Truncate comment text for preview
            const previewText = commentText.length > 100 
                ? commentText.substring(0, 100) + '...' 
                : commentText;
            
            // Build metadata with project information if available
            const metadata = {
                mentionedBy: mentionedByName,
                context: contextTitle,
                fullComment: commentText
            };
            
            // Add project information if available
            if (projectInfo.projectId) {
                metadata.projectId = projectInfo.projectId;
                metadata.projectName = projectInfo.projectName;
                if (projectInfo.taskId) {
                    metadata.taskId = projectInfo.taskId;
                    metadata.taskTitle = projectInfo.taskTitle;
                }
            }
            
            // Use DatabaseAPI.makeRequest() which automatically handles:
            // - Token extraction from storage
            // - Token refresh on 401 errors
            // - Proper error handling
            const response = await window.DatabaseAPI.makeRequest('/notifications', {
                method: 'POST',
                body: JSON.stringify({
                    userId: mentionedUserId,
                    type: 'mention',
                    title: `${mentionedByName} mentioned you`,
                    message: `${mentionedByName} mentioned you in ${contextTitle}: "${previewText}"`,
                    link: contextLink,
                    metadata: metadata
                })
            });
            
            // DatabaseAPI.makeRequest returns { data: {...} } structure
            if (response && (response.data || response)) {
                console.log(`✅ Mention notification created for user ${mentionedUserId}`);
                return response.data || response;
            } else {
                console.error('❌ Unexpected response structure from DatabaseAPI:', response);
                return null;
            }
        } catch (error) {
            console.error('❌ Error creating mention notification:', error);
            console.error('❌ Error details:', {
                message: error.message,
                status: error.status,
                code: error.code
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
        
        const mentionedUsernames = this.getMentionedUsernames(commentText);
        const notificationPromises = [];
        
        // Match usernames to actual users
        for (const username of mentionedUsernames) {
            const matchedUser = allUsers.find(user => {
                // Match by name (case-insensitive, partial match)
                const userNameLower = (user.name || '').toLowerCase().replace(/\s+/g, '');
                const usernameLower = username.toLowerCase();
                
                // Try exact match first
                if (userNameLower === usernameLower) {
                    return true;
                }
                
                // Try partial match (e.g., "john" matches "John Doe")
                if (userNameLower.includes(usernameLower) || usernameLower.includes(userNameLower)) {
                    return true;
                }
                
                // Try email match
                const emailUsername = (user.email || '').split('@')[0].toLowerCase();
                if (emailUsername === usernameLower) {
                    return true;
                }
                
                return false;
            });
            
            if (matchedUser) {
                // Don't notify if the user mentioned themselves
                if (matchedUser.id === window.storage?.getUserInfo?.()?.id) {
                    console.log(`⚠️ Skipping self-mention for ${matchedUser.name}`);
                    continue;
                }
                
                notificationPromises.push(
                    this.createMentionNotification(
                        matchedUser.id,
                        authorName,
                        contextTitle,
                        contextLink,
                        commentText,
                        projectInfo
                    )
                );
            } else {
                console.log(`⚠️ No user found matching mention: @${username}`);
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

