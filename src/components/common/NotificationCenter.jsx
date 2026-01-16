// Notification Center Component
const { useState, useEffect, useRef } = React;

const NotificationCenter = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef(null);
    const { isDark } = window.useTheme();
    const consecutiveFailuresRef = useRef(0);
    const pollingIntervalRef = useRef(null);
    const isPollingPausedRef = useRef(false);
    const pollingDelayRef = useRef(15000); // Start with 15 seconds for near real-time updates, will increase on rate limits
    
    // Helper function to restart polling - will be defined after loadNotifications
    const restartPollingRef = useRef(null);
    
    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    // Helper to handle token refresh on 401 errors
    const fetchWithRefresh = async (url, options = {}) => {
        let token = window.storage?.getToken?.();
        if (!token) {
            throw new Error('No token available');
        }
        
        const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
        const fullUrl = url.startsWith('http') ? url : `${apiBase}${url}`;
        
        const requestOptions = {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                ...(options.headers || {})
            },
            credentials: 'include'
        };
        
        let response = await fetch(fullUrl, requestOptions);
        
        // If 401, try to refresh token and retry once
        if (!response.ok && response.status === 401) {
            try {
                const refreshUrl = `${apiBase}/api/auth/refresh`;
                const refreshRes = await fetch(refreshUrl, { 
                    method: 'POST', 
                    credentials: 'include', 
                    headers: { 'Content-Type': 'application/json' } 
                });
                
                if (refreshRes.ok) {
                    const text = await refreshRes.text();
                    const refreshData = text ? JSON.parse(text) : {};
                    const newToken = refreshData?.data?.accessToken || refreshData?.accessToken;
                    
                    if (newToken && window.storage?.setToken) {
                        window.storage.setToken(newToken);
                        requestOptions.headers['Authorization'] = `Bearer ${newToken}`;
                        response = await fetch(fullUrl, requestOptions);
                    }
                }
            } catch (refreshError) {
                console.error('❌ Token refresh failed:', refreshError);
            }
        }
        
        return response;
    };
    
    const loadNotifications = async () => {
        // Prevent concurrent requests - if already loading, skip
        if (loading) {
            return;
        }
        
        // Check for global rate limits before making request
        if (window.RateLimitManager && window.RateLimitManager.isRateLimited()) {
            const waitSeconds = window.RateLimitManager.getWaitTimeRemaining();
            const waitMinutes = Math.round(waitSeconds / 60);
            console.warn(`⏸️ NotificationCenter: Global rate limit active. Pausing polling for ${waitMinutes} minute(s).`);
            isPollingPausedRef.current = true;
            // Schedule restart after rate limit expires
            const waitTime = waitSeconds * 1000;
            setTimeout(() => {
                isPollingPausedRef.current = false;
                pollingDelayRef.current = 15000; // Reset to 15 seconds
                if (restartPollingRef.current) restartPollingRef.current();
            }, waitTime);
            return;
        }
        
        try {
            setLoading(true);
            
            // Use DatabaseAPI.makeRequest() which handles authentication and token refresh automatically
            if (!window.DatabaseAPI || typeof window.DatabaseAPI.makeRequest !== 'function') {
                console.warn('⚠️ NotificationCenter: DatabaseAPI.makeRequest is not available');
                consecutiveFailuresRef.current++;
                if (consecutiveFailuresRef.current >= 3) {
                    isPollingPausedRef.current = true;
                }
                return;
            }
            
            // Check rate limit before making request
            if (window.RateLimitManager && window.RateLimitManager.isRateLimited()) {
                const waitSeconds = window.RateLimitManager.getWaitTimeRemaining();
                const waitMinutes = Math.round(waitSeconds / 60);
                console.warn(`⏸️ NotificationCenter: Rate limit active, skipping load. Waiting ${waitMinutes} minute(s)...`);
                // Increase polling delay and restart
                pollingDelayRef.current = Math.max(pollingDelayRef.current, waitSeconds * 1000);
                if (restartPollingRef.current) restartPollingRef.current();
                return;
            }
            
            try {
                const response = await window.DatabaseAPI.makeRequest('/notifications', {
                    method: 'GET'
                });
                
                // DatabaseAPI.makeRequest returns { data: {...} } structure
                const responseData = response?.data || response;
                setNotifications(responseData?.notifications || []);
                setUnreadCount(responseData?.unreadCount || 0);
                
                // Reset failure counter on success
                if (consecutiveFailuresRef.current > 0) {
                    consecutiveFailuresRef.current = 0;
                    // Reset polling delay to normal (15 seconds)
                    pollingDelayRef.current = 15000;
                    // Resume polling if it was paused
                    if (isPollingPausedRef.current) {
                        isPollingPausedRef.current = false;
                        // Restart polling with normal delay
                        if (restartPollingRef.current) restartPollingRef.current();
                    } else if (pollingDelayRef.current !== 15000) {
                        // If delay was increased due to rate limiting, restart with normal delay
                        if (restartPollingRef.current) restartPollingRef.current();
                    }
                }
            } catch (error) {
                // DatabaseAPI.makeRequest throws errors for failed requests
                const errorMessage = error?.message || error?.toString() || 'Unknown error';
                const isRateLimit = error?.status === 429 || errorMessage.includes('429') || errorMessage.includes('Too many requests') || errorMessage.includes('rate limit');
                
                if (isRateLimit) {
                    consecutiveFailuresRef.current++;
                    // Check for global rate limit state
                    const retryAfter = error?.retryAfter || 900; // Default 15 minutes
                    const waitSeconds = retryAfter;
                    const waitMinutes = Math.round(waitSeconds / 60);
                    
                    // Pause polling completely until rate limit expires
                    isPollingPausedRef.current = true;
                    pollingDelayRef.current = Math.max(waitSeconds * 1000, 300000); // At least 5 minutes
                    
                    console.warn(`⏸️ NotificationCenter: Rate limit hit. Pausing polling for ${waitMinutes} minute(s).`);
                    
                    // Schedule restart after rate limit expires
                    setTimeout(() => {
                        isPollingPausedRef.current = false;
                        pollingDelayRef.current = 15000; // Reset to 15 seconds
                        consecutiveFailuresRef.current = 0; // Reset failure counter
                        if (restartPollingRef.current) restartPollingRef.current();
                    }, waitSeconds * 1000);
                    
                    // Re-throw to be caught by outer catch
                    throw error;
                } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('Authentication expired')) {
                    consecutiveFailuresRef.current++;
                    // Pause polling after 3 consecutive 401 errors
                    if (consecutiveFailuresRef.current >= 3) {
                        isPollingPausedRef.current = true;
                        console.warn('⏸️ NotificationCenter: Pausing polling due to consecutive 401 errors. Token may be invalid.');
                    } else {
                        console.warn(`⚠️ NotificationCenter: Unauthorized (${consecutiveFailuresRef.current}/3 failures)`);
                    }
                } else {
                    // For other errors, don't increment failure counter (might be temporary network issues)
                    console.warn(`⚠️ NotificationCenter: Failed to load:`, errorMessage);
                }
                // Re-throw to be caught by outer catch if needed
                throw error;
            }
        } catch (error) {
            // Suppress error logs for database connection errors and server errors (500, 502, 503, 504)
            const errorMessage = error?.message || String(error);
            const isDatabaseError = errorMessage.includes('Database connection failed') ||
                                  errorMessage.includes('unreachable') ||
                                  errorMessage.includes('ECONNREFUSED') ||
                                  errorMessage.includes('ETIMEDOUT');
            const isServerError = errorMessage.includes('500') || 
                                 errorMessage.includes('502') || 
                                 errorMessage.includes('503') || 
                                 errorMessage.includes('504');
            
            if (!isDatabaseError && !isServerError) {
                console.error('❌ Error loading notifications:', error);
            }
            consecutiveFailuresRef.current++;
            // Pause polling after 5 total failures (including network errors)
            if (consecutiveFailuresRef.current >= 5) {
                isPollingPausedRef.current = true;
                console.warn('⏸️ NotificationCenter: Pausing polling due to repeated errors');
            }
        } finally {
            setLoading(false);
        }
    };
    
    // Initialize polling after loadNotifications is defined
    useEffect(() => {
        // Define restart polling function that calls loadNotifications
        restartPollingRef.current = () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
            if (!isPollingPausedRef.current) {
                pollingIntervalRef.current = setInterval(() => {
                    if (!isPollingPausedRef.current) {
                        // Check rate limit before polling
                        if (window.RateLimitManager && window.RateLimitManager.isRateLimited()) {
                            const waitSeconds = window.RateLimitManager.getWaitTimeRemaining();
                            const waitMinutes = Math.round(waitSeconds / 60);
                            console.warn(`⏸️ NotificationCenter: Rate limit active, skipping poll. Waiting ${waitMinutes} minute(s)...`);
                            return;
                        }
                        loadNotifications();
                    }
                }, pollingDelayRef.current);
            }
        };
        
        // Load notifications immediately on mount (with a small delay to avoid rate limiting)
        // Then start polling at regular intervals
        setTimeout(() => {
            loadNotifications();
            restartPollingRef.current();
        }, 1000); // Small 1-second delay to avoid immediate requests on page load
        
        // Reload notifications when window regains focus (user returns to tab)
        const handleFocus = () => {
            if (!isPollingPausedRef.current) {
                loadNotifications();
            }
        };
        window.addEventListener('focus', handleFocus);
        
        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
            window.removeEventListener('focus', handleFocus);
        };
    }, []);
    
    const markAsRead = async (notificationIds) => {
        try {
            if (!window.DatabaseAPI || typeof window.DatabaseAPI.makeRequest !== 'function') {
                console.warn('⚠️ NotificationCenter: DatabaseAPI.makeRequest not available for markAsRead');
                return;
            }
            
            await window.DatabaseAPI.makeRequest('/notifications', {
                method: 'PATCH',
                body: JSON.stringify({ read: true, notificationIds })
            });
            
            loadNotifications(); // Reload to update counts
        } catch (error) {
            console.error('❌ Error marking notifications as read:', error);
            // Don't throw - this is a non-critical operation
        }
    };
    
    const deleteNotification = async (notificationIds) => {
        try {
            if (!window.DatabaseAPI || typeof window.DatabaseAPI.makeRequest !== 'function') {
                console.warn('⚠️ NotificationCenter: DatabaseAPI.makeRequest not available for deleteNotification');
                return;
            }
            
            await window.DatabaseAPI.makeRequest('/notifications', {
                method: 'DELETE',
                body: JSON.stringify({ notificationIds })
            });
            
            loadNotifications();
        } catch (error) {
            console.error('❌ Error deleting notification:', error);
            // Don't throw - this is a non-critical operation
        }
    };
    
    const formatTimeAgo = (date) => {
        const now = new Date();
        const notificationDate = new Date(date);
        const diffInSeconds = Math.floor((now - notificationDate) / 1000);
        
        if (diffInSeconds < 60) return 'just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
        return notificationDate.toLocaleDateString();
    };
    
    const getNotificationIcon = (type) => {
        switch(type) {
            case 'mention': return 'fa-at';
            case 'comment': return 'fa-comment';
            case 'task': return 'fa-tasks';
            case 'invoice': return 'fa-file-invoice';
            case 'system': return 'fa-info-circle';
            default: return 'fa-bell';
        }
    };
    
    const getNotificationColor = (type) => {
        switch(type) {
            case 'mention': return 'text-blue-600';
            case 'comment': return 'text-green-600';
            case 'task': return 'text-purple-600';
            case 'invoice': return 'text-orange-600';
            case 'system': return 'text-gray-600';
            default: return 'text-gray-600';
        }
    };
    
    const handleNotificationClick = (notification, event) => {
        // Prevent any event bubbling issues
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        // Mark as read
        if (!notification.read) {
            markAsRead([notification.id]);
        }
        
        // Close dropdown
        setIsOpen(false);
        
        // Navigate to link if available - ALWAYS navigate even if no link
        if (notification.link) {
            // Parse metadata if available for more specific navigation
            let metadata = null;
            if (notification.metadata) {
                try {
                    metadata = typeof notification.metadata === 'string' 
                        ? JSON.parse(notification.metadata) 
                        : notification.metadata;
                } catch (e) {
                    console.warn('Failed to parse notification metadata:', e);
                }
            }
            
            // Normalize the link - ensure it starts with # for hash-based routing
            let normalizedLink = notification.link.trim();
            
            // Store original link for EntityUrl parsing (without hash prefix)
            let linkForParsing = normalizedLink;
            
            // If link doesn't start with # or /, assume it's a relative path
            if (!normalizedLink.startsWith('#') && !normalizedLink.startsWith('/')) {
                normalizedLink = '/' + normalizedLink;
                linkForParsing = normalizedLink;
            }
            
            // Convert paths starting with / to hash-based routing for navigation
            // But keep the original format for EntityUrl parsing
            if (normalizedLink.startsWith('/')) {
                linkForParsing = normalizedLink; // For EntityUrl, use path without #
                normalizedLink = '#' + normalizedLink; // For hash navigation, use # prefix
            } else if (normalizedLink.startsWith('#')) {
                linkForParsing = normalizedLink.substring(1); // Remove # for EntityUrl parsing
            }
            
            // Navigate to the link FIRST
            // Use entity URL navigation if available, otherwise fall back to hash navigation
            let navigationSuccessful = false;
            
            if (window.EntityUrl && linkForParsing) {
                try {
                    const parsed = window.EntityUrl.parseEntityUrl(linkForParsing);
                    if (parsed) {
                        // Use entity navigation
                        window.EntityUrl.navigateToEntity(parsed.entityType, parsed.entityId, parsed.options);
                        navigationSuccessful = true;
                    }
                } catch (e) {
                    console.warn('EntityUrl parsing failed, falling back to hash navigation:', e);
                }
            }
            
            // Fall back to hash navigation if EntityUrl navigation didn't work
            if (!navigationSuccessful) {
                // Handle query parameters
                if (normalizedLink.includes('?')) {
                    const [hash, query] = normalizedLink.split('?');
                    // Set hash navigation
                    window.location.hash = hash;
                    // Update URL with query parameters
                    try {
                        const url = new URL(window.location);
                        const params = new URLSearchParams(query);
                        params.forEach((value, key) => {
                            url.searchParams.set(key, value);
                        });
                        window.history.replaceState({}, '', url);
                    } catch (e) {
                        console.warn('Failed to update URL with query params:', e);
                        // Still navigate using hash with query string
                        window.location.hash = normalizedLink;
                    }
                } else {
                    // Simple hash navigation - ALWAYS navigate if EntityUrl didn't work
                    window.location.hash = normalizedLink;
                }
            } else {
                // EntityUrl navigation succeeded, but ensure hash is also set for routing consistency
                // This helps ensure the route is properly reflected in the URL
                if (!window.location.hash || window.location.hash !== normalizedLink) {
                    window.location.hash = normalizedLink;
                }
            }
            
            // Wait a bit for navigation to start before trying to find elements
            // This is especially important for route changes that load new components
            // Wrap element finding in setTimeout to give navigation time to complete
            setTimeout(() => {
                // Helper function to highlight an element
            const highlightElement = (element) => {
                if (!element) return;
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Highlight the element briefly
                const originalBg = window.getComputedStyle(element).backgroundColor;
                const originalTransition = element.style.transition;
                element.style.transition = 'background-color 0.3s, box-shadow 0.3s';
                element.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
                element.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.3)';
                setTimeout(() => {
                    element.style.backgroundColor = originalBg;
                    element.style.boxShadow = '';
                    element.style.transition = originalTransition;
                }, 2000);
            };
            
            // Helper function to find and scroll to element with retries
            const findAndScrollToElement = (selectors, maxRetries = 10, delay = 300) => {
                let retries = 0;
                const tryFind = () => {
                    for (const selector of selectors) {
                        let element = null;
                        try {
                            element = typeof selector === 'string' 
                                ? document.querySelector(selector)
                                : selector();
                        } catch (e) {
                            console.warn('Error in selector:', e);
                        }
                        if (element) {
                            highlightElement(element);
                            return true;
                        }
                    }
                    return false;
                };
                
                const attempt = () => {
                    if (tryFind()) {
                        return; // Found it!
                    }
                    retries++;
                    if (retries < maxRetries) {
                        setTimeout(attempt, delay);
                    } else {
                        console.warn('Could not find element after', maxRetries, 'attempts');
                    }
                };
                
                // Start trying after initial delay (give page time to load)
                setTimeout(attempt, delay);
            };
            
            // After navigation, try to scroll to specific elements if metadata provides them
            if (metadata) {
                // Handle MonthlyDocumentCollectionTracker comment cell navigation
                // This is for comments on documents in the monthly tracker
                if (metadata.sectionId && metadata.documentId && metadata.month !== undefined) {
                    const sectionId = String(metadata.sectionId);
                    const documentId = String(metadata.documentId);
                    const month = String(metadata.month);
                    const commentId = metadata.commentId ? String(metadata.commentId) : null;
                    
                    // Create the comment cell key (same format as used in MonthlyDocumentCollectionTracker)
                    // The cell key format is: `${sectionId}-${documentId}-${month}`
                    const commentCellKey = `${sectionId}-${documentId}-${month}`;
                    
                    // First, try to find and click the comment cell button to open the popup
                    const findAndClickCommentCell = (maxRetries = 20, delay = 500) => {
                        let retries = 0;
                        const tryFindAndClick = () => {
                            // Use getAttribute approach to avoid CSS selector issues with special characters
                            // This is more reliable than querySelector for attribute values that may contain dots, quotes, etc.
                            const cells = document.querySelectorAll('[data-comment-cell]');
                            for (const cell of cells) {
                                const cellKey = cell.getAttribute('data-comment-cell');
                                if (cellKey === commentCellKey) {
                                    // Found the cell - scroll to it and click
                                    cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    // Find the button (could be the cell itself or a child)
                                    const button = cell.tagName === 'BUTTON' ? cell : cell.closest('button') || cell.querySelector('button');
                                    if (button) {
                                        button.click();
                                    }
                                    return true;
                                }
                            }
                            return false;
                        };
                        
                        const attempt = () => {
                            if (tryFindAndClick()) {
                                return; // Found and clicked!
                            }
                            retries++;
                            if (retries < maxRetries) {
                                setTimeout(attempt, delay);
                            } else {
                                console.warn('Could not find comment cell button after', maxRetries, 'attempts');
                            }
                        };
                        
                        // Start trying after initial delay
                        setTimeout(attempt, delay);
                    };
                    
                    findAndClickCommentCell(20, 500); // More retries and longer delay for comment cells
                    
                    // If a specific comment ID is provided, wait for popup to open and scroll to that comment
                    if (commentId) {
                        setTimeout(() => {
                            findAndScrollToElement([
                                () => {
                                    // Use getAttribute to find comments (more reliable than querySelector)
                                    const popup = document.querySelector('.comment-popup');
                                    if (popup) {
                                        // First try within popup
                                        const comments = popup.querySelectorAll('[data-comment-id]');
                                        for (const comment of comments) {
                                            if (comment.getAttribute('data-comment-id') === commentId) {
                                                return comment;
                                            }
                                        }
                                        // Also try by ID if commentId doesn't contain special characters
                                        if (!commentId.includes('.')) {
                                            const byId = popup.querySelector(`#comment-${commentId}`);
                                            if (byId) return byId;
                                        }
                                    }
                                    // Fallback: search entire document
                                    const allComments = document.querySelectorAll('[data-comment-id]');
                                    for (const comment of allComments) {
                                        if (comment.getAttribute('data-comment-id') === commentId) {
                                            return comment;
                                        }
                                    }
                                    return null;
                                },
                                // Only use querySelector if commentId doesn't contain dots
                                ...(commentId.includes('.') ? [] : [
                                    `[data-comment-id="${commentId}"]`,
                                    `#comment-${commentId}`
                                ])
                            ], 15, 300);
                        }, 800); // Wait for popup to open (longer delay)
                    }
                }
                
                // Handle document navigation (for MonthlyDocumentCollectionTracker)
                // Skip document navigation if we're already handling comment cell navigation
                // (to avoid invalid selector errors with IDs containing dots)
                if (metadata.documentId && !(metadata.sectionId && metadata.documentId && metadata.month !== undefined)) {
                    const documentId = String(metadata.documentId);
                    // Use getAttribute instead of querySelector for IDs with special characters (dots, etc.)
                    findAndScrollToElement([
                        () => {
                            // Try to find by data-document-id attribute (safer than ID selector)
                            const elements = document.querySelectorAll('[data-document-id]');
                            for (const el of elements) {
                                if (el.getAttribute('data-document-id') === documentId) {
                                    return el;
                                }
                            }
                            return null;
                        },
                        `[data-document-id="${documentId}"]`,
                        // Only try ID selector if documentId doesn't contain dots (invalid in CSS)
                        ...(documentId.includes('.') ? [] : [`#document-${documentId}`])
                    ]);
                }
                
                // Handle proposal stage navigation
                if (metadata.stageId || metadata.stageIndex !== undefined) {
                    const stageId = metadata.stageId;
                    const stageIndex = metadata.stageIndex;
                    const proposalId = metadata.proposalId;
                    
                    const selectors = [];
                    if (stageId) {
                        selectors.push(
                            `[data-stage-id="${stageId}"]`,
                            `#stage-${stageId}`,
                            `[data-proposal-stage="${stageId}"]`,
                            `[id*="stage"][id*="${stageId}"]`
                        );
                    }
                    if (stageIndex !== undefined && proposalId) {
                        selectors.push(() => {
                            // Try multiple ways to find the proposal element
                            const proposalElement = document.querySelector(`[data-proposal-id="${proposalId}"]`) ||
                                                  document.querySelector(`[data-proposal-id*="${proposalId}"]`) ||
                                                  document.querySelector(`[id*="proposal"][id*="${proposalId}"]`) ||
                                                  document.querySelector(`[id*="proposal-${proposalId}"]`);
                            if (proposalElement) {
                                // Try to find stage by index in various ways
                                const stages = proposalElement.querySelectorAll('[data-stage-index], [class*="stage"], [data-stage-id]');
                                if (stages.length > stageIndex) {
                                    return stages[stageIndex];
                                }
                                // Also try finding by stage ID if available
                                if (stageId) {
                                    const stageById = proposalElement.querySelector(`[data-stage-id="${stageId}"]`);
                                    if (stageById) return stageById;
                                }
                            }
                            return null;
                        });
                    }
                    
                    if (selectors.length > 0) {
                        // Use more retries for proposal stages as they may take longer to render
                        findAndScrollToElement(selectors, 15, 400);
                    }
                }
                
                // Handle task navigation
                if (metadata.taskId) {
                    const taskId = metadata.taskId;
                    findAndScrollToElement([
                        `#task-${taskId}`,
                        `[data-task-id="${taskId}"]`,
                        `[id*="task"][id*="${taskId}"]`
                    ]);
                }
                
                // Handle comment navigation (generic) - only if not already handled by MonthlyDocumentCollectionTracker
                if (metadata.commentId && !(metadata.sectionId && metadata.documentId && metadata.month !== undefined)) {
                    const commentId = String(metadata.commentId);
                    findAndScrollToElement([
                        () => {
                            // Use getAttribute to find comments (handles special characters in IDs)
                            const allComments = document.querySelectorAll('[data-comment-id]');
                            for (const comment of allComments) {
                                if (comment.getAttribute('data-comment-id') === commentId) {
                                    return comment;
                                }
                            }
                            // Also try in comment containers
                            const commentContainers = document.querySelectorAll('[class*="comment"], [id*="comment"], .comments-container');
                            for (const container of commentContainers) {
                                const comments = container.querySelectorAll('[data-comment-id]');
                                for (const comment of comments) {
                                    if (comment.getAttribute('data-comment-id') === commentId) {
                                        return comment;
                                    }
                                }
                            }
                            return null;
                        },
                        // Only use querySelector if commentId doesn't contain dots
                        ...(commentId.includes('.') ? [] : [
                            `[data-comment-id="${commentId}"]`,
                            `#comment-${commentId}`
                        ])
                    ], 15, 400);
                }
                
                // Handle proposal navigation
                if (metadata.proposalId && !metadata.stageId && metadata.stageIndex === undefined) {
                    const proposalId = metadata.proposalId;
                    findAndScrollToElement([
                        `[data-proposal-id="${proposalId}"]`,
                        `[data-proposal-id*="${proposalId}"]`,
                        `#proposal-${proposalId}`,
                        `[id*="proposal"][id*="${proposalId}"]`,
                        `[id*="proposal-${proposalId}"]`
                    ], 15, 400);
                }
            }
            
            // Also try to scroll to any hash anchor in the link
            const hashMatch = notification.link.match(/#([^?&]+)/);
            if (hashMatch && hashMatch[1]) {
                const anchorId = hashMatch[1];

                // If the anchor looks like a route (e.g. "/clients") it is NOT a valid CSS id,
                // so avoid building a selector like "#/clients" which throws errors.
                const maybeIdSelector = (id) => {
                    // Valid CSS id must not start with "/" and must not contain spaces
                    if (!id || id.startsWith('/') || /\s/.test(id)) {
                        return null;
                    }
                    return `#${id}`;
                };

                const idSelector = maybeIdSelector(anchorId);
                const selectors = [
                    `[data-id="${anchorId}"]`,
                    `[name="${anchorId}"]`,
                    `[id*="${anchorId}"]`
                ];

                // Only include the id selector if it is valid
                if (idSelector) {
                    selectors.unshift(idSelector);
                }

                findAndScrollToElement(selectors);
            }
            }, 500); // Initial delay to allow navigation to complete
        } else {
            // Even if no link, try to navigate based on metadata
            let metadata = null;
            if (notification.metadata) {
                try {
                    metadata = typeof notification.metadata === 'string' 
                        ? JSON.parse(notification.metadata) 
                        : notification.metadata;
                } catch (e) {
                    console.warn('Failed to parse notification metadata:', e);
                }
            }
            
            // Try to construct a link from metadata
            if (metadata) {
                let constructedLink = null;
                
                if (metadata.projectId) {
                    if (metadata.taskId) {
                        constructedLink = `#/projects/${metadata.projectId}?task=${metadata.taskId}`;
                    } else {
                        constructedLink = `#/projects/${metadata.projectId}`;
                    }
                } else if (metadata.clientId) {
                    constructedLink = `#/clients/${metadata.clientId}`;
                } else if (metadata.leadId) {
                    constructedLink = `#/clients/${metadata.leadId}`;
                } else if (metadata.taskId) {
                    constructedLink = `#/projects?task=${metadata.taskId}`;
                }
                
                if (constructedLink) {
                    // Try EntityUrl navigation first
                    let navigationSuccessful = false;
                    if (window.EntityUrl) {
                        const linkForParsing = constructedLink.startsWith('#') ? constructedLink.substring(1) : constructedLink;
                        const parsed = window.EntityUrl.parseEntityUrl(linkForParsing);
                        if (parsed) {
                            window.EntityUrl.navigateToEntity(parsed.entityType, parsed.entityId, parsed.options);
                            navigationSuccessful = true;
                        }
                    }
                    
                    // Fall back to hash navigation
                    if (!navigationSuccessful) {
                        window.location.hash = constructedLink;
                    }
                }
            }
        }
    };
    
    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Icon Button */}
            <button
                onClick={() => {
                    setIsOpen(!isOpen);
                    // Reload notifications when opening dropdown and resume polling if paused
                    if (!isOpen) {
                        // Force resume polling when user opens dropdown
                        if (isPollingPausedRef.current) {
                            isPollingPausedRef.current = false;
                            consecutiveFailuresRef.current = 0;
                        }
                        loadNotifications();
                    }
                }}
                className={`relative ${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'} p-2 lg:p-1.5 rounded-lg transition-all duration-200 touch-target border ${isDark ? 'border-gray-600 hover:border-gray-500' : 'border-gray-200 hover:border-gray-300'} min-w-[44px] min-h-[44px] max-w-[44px] max-h-[44px] flex items-center justify-center notification-button`}
                title="Notifications"
                style={{ overflow: 'hidden', position: 'relative' }}
            >
                <span className="relative inline-flex items-center justify-center notification-icon-wrapper" style={{ width: '100%', height: '100%', position: 'relative' }}>
                    <i className="fas fa-bell text-sm"></i>
                    {unreadCount > 0 && (
                        <span className="absolute notification-badge bg-red-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center z-10" style={{ top: '4px', right: '4px', position: 'absolute' }}>
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    )}
                </span>
            </button>
            
            {/* Dropdown Panel */}
            {isOpen && (
                <div className={`absolute right-0 mt-2 w-80 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl shadow-xl z-50 backdrop-blur-sm`}>
                    {/* Header */}
                    <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                        <h3 className={`font-semibold ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                            Notifications
                            {unreadCount > 0 && (
                                <span className={`ml-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    ({unreadCount} unread)
                                </span>
                            )}
                        </h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={() => {
                                    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
                                    if (unreadIds.length > 0) {
                                        markAsRead(unreadIds);
                                    }
                                }}
                                className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                            >
                                Mark all read
                            </button>
                        )}
                    </div>
                    
                    {/* Notifications List */}
                    <div className="max-h-96 overflow-y-auto">
                        {loading && notifications.length === 0 ? (
                            <div className={`px-4 py-8 text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                <i className="fas fa-spinner fa-spin text-2xl mb-2"></i>
                                <p className="text-sm">Loading notifications...</p>
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className={`px-4 py-8 text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                <i className="fas fa-bell-slash text-2xl mb-2"></i>
                                <p className="text-sm">No notifications yet</p>
                            </div>
                        ) : (
                            <div>
                                {notifications.map((notification) => (
                                    <div
                                        key={notification.id}
                                        onClick={(e) => handleNotificationClick(notification, e)}
                                        onMouseDown={(e) => {
                                            // Ensure clicks work even on child elements
                                            if (e.target.closest('button[data-delete-notification]')) {
                                                return; // Let delete button handle its own click
                                            }
                                        }}
                                        className={`border-b ${isDark ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-100 hover:bg-gray-50'} cursor-pointer transition-colors ${
                                            !notification.read && (isDark ? 'bg-gray-750' : 'bg-blue-50')
                                        }`}
                                        style={{ userSelect: 'none' }}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                handleNotificationClick(notification, e);
                                            }
                                        }}
                                    >
                                        <div className="px-4 py-3">
                                            <div className="flex items-start gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                                    <i className={`fas ${getNotificationIcon(notification.type)} ${getNotificationColor(notification.type)} text-sm`}></i>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between">
                                                        <p className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                                                            {notification.title}
                                                        </p>
                                                        {!notification.read && (
                                                            <span className="w-2 h-2 rounded-full bg-primary-600 ml-2 flex-shrink-0 mt-1"></span>
                                                        )}
                                                    </div>
                                                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mt-1 line-clamp-2`}>
                                                        {notification.message}
                                                    </p>
                                                    <div className="flex items-center justify-between mt-2">
                                                        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                                            {formatTimeAgo(notification.createdAt)}
                                                        </span>
                                                        <button
                                                            data-delete-notification="true"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                deleteNotification([notification.id]);
                                                            }}
                                                            onMouseDown={(e) => {
                                                                e.stopPropagation();
                                                            }}
                                                            className={`text-xs ${isDark ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-600'} p-1`}
                                                            title="Delete notification"
                                                        >
                                                            <i className="fas fa-times"></i>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// Make available globally
if (typeof window !== 'undefined') {
    window.NotificationCenter = NotificationCenter;
}

