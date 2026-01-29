/**
 * Entity URL Utility
 * 
 * Generates URLs for all entities in the system so they can be accessed
 * via comments, notifications, and other linking mechanisms.
 */

(() => {
    if (typeof window === 'undefined') {
        return;
    }

    /**
     * Entity type to page mapping
     * Maps entity types to their corresponding page routes
     */
    const ENTITY_PAGE_MAP = {
        // Client entities
        'client': 'clients',
        'lead': 'clients', // Leads are shown in clients page
        'opportunity': 'clients', // Opportunities are shown in clients page
        
        // Project entities
        'project': 'projects',
        'task': 'tasks', // Tasks have their own URL space
        
        // Invoice entities
        'invoice': 'clients', // Invoices are shown in clients page
        
        // Sales entities
        'salesorder': 'clients', // Sales orders are shown in clients page
        
        // Manufacturing entities
        'productionorder': 'manufacturing',
        'bom': 'manufacturing',
        'inventoryitem': 'manufacturing',
        'stocklocation': 'manufacturing',
        'stockmovement': 'manufacturing',
        'supplier': 'manufacturing',
        'purchaseorder': 'manufacturing',
        
        // Service entities
        'jobcard': 'service-maintenance',
        'vehicle': 'service-maintenance',
        'serviceformtemplate': 'service-maintenance',
        'serviceforminstance': 'service-maintenance',
        
        // User entities
        'user': 'users',
        'usertask': 'my-tasks',
        
        // Team entities
        'team': 'teams',
        'teamdocument': 'teams',
        'teamworkflow': 'teams',
        'teamchecklist': 'teams',
        'teamnotice': 'teams',
        'teamtask': 'teams',
        
        // Meeting entities
        'monthlymeetingnotes': 'teams',
        'weeklymeetingnotes': 'teams',
        'departmentnotes': 'teams',
        'meetingactionitem': 'teams',
        'meetingcomment': 'teams',
        
        // Leave entities
        'leaveapplication': 'leave-platform',
        'leavebalance': 'leave-platform',
        
        // Time tracking
        'timeentry': 'time-tracking',
    };

    /**
     * Nested entity relationships
     * Defines parent-child relationships for nested entities
     */
    const NESTED_ENTITY_MAP = {
        'task': { parent: 'project', parentKey: 'projectId' },
        'comment': { parent: null }, // Comments can belong to multiple entity types
        'feedback': { parent: null }, // Feedback can belong to multiple entity types
        'document': { parent: 'project', parentKey: 'projectId' },
        'section': { parent: null }, // Sections are context-specific
        'subtask': { parent: 'task', parentKey: 'parentTaskId' },
        'invoice': { parent: 'client', parentKey: 'clientId' },
        'opportunity': { parent: 'client', parentKey: 'clientId' },
        'salesorder': { parent: 'client', parentKey: 'clientId' },
    };

    /**
     * Generates a URL for an entity
     * 
     * @param {string} entityType - The type of entity (e.g., 'client', 'project', 'task')
     * @param {string} entityId - The ID of the entity
     * @param {Object} options - Additional options
     * @param {string} options.tab - Optional tab to open (e.g., 'overview', 'comments')
     * @param {string} options.section - Optional section identifier
     * @param {string} options.parentId - Optional parent entity ID for nested entities
     * @param {string} options.parentType - Optional parent entity type for nested entities
     * @returns {string} The URL path (e.g., '/clients/abc123' or '/projects/xyz789/tasks/task123?tab=comments')
     */
    const getEntityUrl = (entityType, entityId, options = {}) => {
        if (!entityType || !entityId) {
            console.warn('getEntityUrl: entityType and entityId are required');
            return '/dashboard';
        }

        const normalizedType = entityType.toLowerCase().trim();
        const page = ENTITY_PAGE_MAP[normalizedType];

        if (!page) {
            console.warn(`getEntityUrl: Unknown entity type "${entityType}", defaulting to dashboard`);
            return '/dashboard';
        }

        // Check if this is a nested entity that should include parent in URL
        const nestedInfo = NESTED_ENTITY_MAP[normalizedType];
        let path = '';
        
        if (nestedInfo && nestedInfo.parent && (options.parentId || options[nestedInfo.parentKey])) {
            // Build nested URL: /parent/{parentId}/child/{childId}
            const parentType = options.parentType || nestedInfo.parent;
            const parentId = options.parentId || options[nestedInfo.parentKey];
            const parentPage = ENTITY_PAGE_MAP[parentType.toLowerCase()] || parentType;
            
            // For nested entities, use format: /parent/{parentId}/{childType}/{childId}
            // e.g., /projects/abc123/tasks/task456
            const childTypePlural = normalizedType === 'task' ? 'tasks' : 
                                   normalizedType === 'comment' ? 'comments' :
                                   normalizedType === 'document' ? 'documents' :
                                   normalizedType === 'subtask' ? 'subtasks' :
                                   normalizedType + 's';
            
            path = `/${parentPage}/${parentId}/${childTypePlural}/${entityId}`;
        } else {
            // Standard entity URL
            path = `/${page}/${entityId}`;
        }

        // Add query parameters if provided
        const queryParams = new URLSearchParams();
        if (options.tab) {
            queryParams.set('tab', options.tab);
        }
        if (options.section) {
            queryParams.set('section', options.section);
        }
        if (options.view) {
            queryParams.set('view', options.view);
        }
        if (options.commentId) {
            queryParams.set('commentId', options.commentId);
        }
        if (options.siteId) {
            queryParams.set('siteId', options.siteId);
            if (!queryParams.has('tab')) queryParams.set('tab', 'sites');
        }

        const queryString = queryParams.toString();
        if (queryString) {
            path += `?${queryString}`;
        }

        return path;
    };

    /**
     * Parses an entity URL to extract entity type, ID, and options
     * Supports both simple and nested URLs
     * 
     * @param {string} url - The URL to parse (e.g., '/clients/abc123?tab=comments' or '/projects/xyz789/tasks/task123')
     * @returns {Object|null} Object with entityType, entityId, and options, or null if invalid
     */
    const parseEntityUrl = (url) => {
        if (!url) {
            return null;
        }

        // Remove leading slash and hash if present
        const cleanUrl = url.replace(/^[#\/]+/, '').split('?')[0];
        const parts = cleanUrl.split('/').filter(Boolean);

        if (parts.length < 2) {
            return null;
        }

        // Check if this is a nested URL (e.g., /projects/abc123/tasks/task456)
        if (parts.length >= 4) {
            const parentPage = parts[0];
            const parentId = parts[1];
            const childTypePlural = parts[2];
            const childId = parts[3];
            
            // Map child type plural to singular
            const childTypeMap = {
                'tasks': 'task',
                'comments': 'comment',
                'documents': 'document',
                'subtasks': 'subtask',
                'invoices': 'invoice',
                'opportunities': 'opportunity',
                'salesorders': 'salesorder',
            };
            
            const childType = childTypeMap[childTypePlural] || childTypePlural.replace(/s$/, '');
            
            // Find parent entity type
            const parentType = Object.keys(ENTITY_PAGE_MAP).find(
                type => ENTITY_PAGE_MAP[type] === parentPage
            );
            
            if (!parentType) {
                return null;
            }
            
            // Parse query parameters
            const urlObj = new URL(url, window.location.origin);
            const options = {
                parentId: parentId,
                parentType: parentType,
                [NESTED_ENTITY_MAP[childType]?.parentKey || `${parentType}Id`]: parentId
            };
            
            if (urlObj.searchParams.get('tab')) {
                options.tab = urlObj.searchParams.get('tab');
            }
            if (urlObj.searchParams.get('section')) {
                options.section = urlObj.searchParams.get('section');
            }
            if (urlObj.searchParams.get('view')) {
                options.view = urlObj.searchParams.get('view');
            }
            if (urlObj.searchParams.get('commentId')) {
                options.commentId = urlObj.searchParams.get('commentId');
            }
            if (urlObj.searchParams.get('siteId')) {
                options.siteId = urlObj.searchParams.get('siteId');
            }
            
            return {
                entityType: childType,
                entityId: childId,
                page: ENTITY_PAGE_MAP[childType] || parentPage,
                options
            };
        }
        
        // Simple URL (e.g., /clients/abc123)
        const page = parts[0];
        const entityId = parts[1];

        // Reverse lookup: find entity type from page
        const entityType = Object.keys(ENTITY_PAGE_MAP).find(
            type => ENTITY_PAGE_MAP[type] === page
        );

        if (!entityType) {
            return null;
        }

        // Parse query parameters
        const urlObj = new URL(url, window.location.origin);
        const options = {};
        if (urlObj.searchParams.get('tab')) {
            options.tab = urlObj.searchParams.get('tab');
        }
        if (urlObj.searchParams.get('section')) {
            options.section = urlObj.searchParams.get('section');
        }
        if (urlObj.searchParams.get('view')) {
            options.view = urlObj.searchParams.get('view');
        }
        if (urlObj.searchParams.get('commentId')) {
            options.commentId = urlObj.searchParams.get('commentId');
        }
        if (urlObj.searchParams.get('siteId')) {
            options.siteId = urlObj.searchParams.get('siteId');
        }

        return {
            entityType,
            entityId,
            page,
            options
        };
    };

    /**
     * Navigates to an entity URL
     * 
     * @param {string} entityType - The type of entity
     * @param {string} entityId - The ID of the entity
     * @param {Object} options - Additional options (tab, section, etc.)
     */
    const navigateToEntity = (entityType, entityId, options = {}) => {
        const url = getEntityUrl(entityType, entityId, options);
        
        if (window.RouteState) {
            const parsed = parseEntityUrl(url);
            if (parsed) {
                const hasSearch = !!(parsed.options?.tab || parsed.options?.siteId);
                if (hasSearch && window.RouteState.navigate) {
                    const search = new URLSearchParams();
                    if (parsed.options.tab) search.set('tab', parsed.options.tab);
                    if (parsed.options.siteId) search.set('siteId', parsed.options.siteId);
                    window.RouteState.navigate({
                        page: parsed.page,
                        segments: [parsed.entityId],
                        search: search.toString(),
                        preserveSearch: false,
                        preserveHash: false,
                        replace: false
                    });
                } else {
                    window.RouteState.setPageSubpath(parsed.page, [parsed.entityId], {
                        replace: false,
                        preserveSearch: false,
                        preserveHash: false
                    });
                }
                
                // Dispatch custom event for entity navigation
                window.dispatchEvent(new CustomEvent('navigateToEntity', {
                    detail: {
                        entityType: parsed.entityType,
                        entityId: parsed.entityId,
                        url: url,
                        options: parsed.options
                    }
                }));
            }
        } else {
            // Fallback to hash-based navigation
            window.location.hash = url;
        }
    };

    /**
     * Gets entity URL from metadata object
     * Useful when you have an entity object with type and id
     * 
     * @param {Object} entity - Entity object with type and id properties
     * @param {Object} options - Additional options
     * @returns {string} The URL
     */
    const getEntityUrlFromObject = (entity, options = {}) => {
        if (!entity) {
            return '/dashboard';
        }

        const entityType = entity.type || entity.entityType || entity.__typename;
        const entityId = entity.id || entity._id;

        if (!entityType || !entityId) {
            console.warn('getEntityUrlFromObject: entity must have type and id properties');
            return '/dashboard';
        }

        return getEntityUrl(entityType, entityId, options);
    };

    /**
     * Gets URL for a comment
     * Comments can belong to different entity types
     * 
     * @param {string} commentId - The comment ID
     * @param {string} parentEntityType - The type of entity the comment belongs to
     * @param {string} parentEntityId - The ID of the entity the comment belongs to
     * @param {Object} options - Additional options
     * @returns {string} The URL
     */
    const getCommentUrl = (commentId, parentEntityType, parentEntityId, options = {}) => {
        return getEntityUrl('comment', commentId, {
            ...options,
            parentType: parentEntityType,
            parentId: parentEntityId,
            commentId: commentId
        });
    };

    /**
     * Gets URL for a section within an entity
     * 
     * @param {string} entityType - The entity type
     * @param {string} entityId - The entity ID
     * @param {string} sectionId - The section identifier
     * @param {Object} options - Additional options
     * @returns {string} The URL
     */
    const getSectionUrl = (entityType, entityId, sectionId, options = {}) => {
        return getEntityUrl(entityType, entityId, {
            ...options,
            section: sectionId
        });
    };

    /**
     * Deep URL for a client or lead site (Sites tab, optionally specific site).
     * Use for links from listings, pipeline, notifications.
     *
     * @param {string} entityType - 'client' or 'lead'
     * @param {string} entityId - Client or lead ID
     * @param {string} siteId - Site ID (optional; if omitted, opens Sites tab without specific site)
     * @param {Object} options - { useHash: boolean } – useHash true returns #/clients/... for SPA hash routing
     * @returns {string} Path like /clients/xyz?tab=sites&siteId=abc or #/clients/xyz?tab=sites&siteId=abc
     */
    const getSiteDeepUrl = (entityType, entityId, siteId, options = {}) => {
        const opts = { tab: 'sites', ...(siteId && { siteId }) };
        const path = getEntityUrl(entityType, entityId, opts);
        if (options.useHash) {
            const pre = path.startsWith('/') ? path : `/${path}`;
            return `#${pre}`;
        }
        return path.startsWith('/') ? path : `/${path}`;
    };

    // Export to window
    if (!window.EntityUrl) {
        window.EntityUrl = {
            getEntityUrl,
            parseEntityUrl,
            navigateToEntity,
            getEntityUrlFromObject,
            getCommentUrl,
            getSectionUrl,
            getSiteDeepUrl,
            ENTITY_PAGE_MAP,
            NESTED_ENTITY_MAP
        };
    }
})();

