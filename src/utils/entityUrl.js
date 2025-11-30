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
        'task': 'projects', // Tasks are shown within projects
        
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
     * Generates a URL for an entity
     * 
     * @param {string} entityType - The type of entity (e.g., 'client', 'project', 'task')
     * @param {string} entityId - The ID of the entity
     * @param {Object} options - Additional options
     * @param {string} options.tab - Optional tab to open (e.g., 'overview', 'comments')
     * @param {string} options.section - Optional section identifier
     * @returns {string} The URL path (e.g., '/clients/abc123' or '/projects/xyz789?tab=comments')
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

        // Build the path with entity ID
        let path = `/${page}/${entityId}`;

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

        const queryString = queryParams.toString();
        if (queryString) {
            path += `?${queryString}`;
        }

        return path;
    };

    /**
     * Parses an entity URL to extract entity type, ID, and options
     * 
     * @param {string} url - The URL to parse (e.g., '/clients/abc123?tab=comments')
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
                window.RouteState.setPageSubpath(parsed.page, [parsed.entityId], {
                    replace: false,
                    preserveSearch: false,
                    preserveHash: false
                });
                
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

    // Export to window
    if (!window.EntityUrl) {
        window.EntityUrl = {
            getEntityUrl,
            parseEntityUrl,
            navigateToEntity,
            getEntityUrlFromObject,
            ENTITY_PAGE_MAP
        };
    }
})();

