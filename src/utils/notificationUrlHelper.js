/**
 * Notification URL Helper
 * 
 * Ensures that all notifications have unique, accessible URLs for each component.
 * This utility extends EntityUrl to provide URL generation specifically for notifications.
 * 
 * Usage:
 *   const url = NotificationUrlHelper.getUrlForEntity('project', projectId, { tab: 'comments' });
 *   const url = NotificationUrlHelper.getUrlForComponent('dashboard');
 *   const url = NotificationUrlHelper.ensureUrl(link, metadata);
 */

(() => {
    if (typeof window === 'undefined') {
        return;
    }

    /**
     * Component to URL mapping
     * Maps all components/pages to their base URLs
     */
    const COMPONENT_URL_MAP = {
        // Main pages
        'dashboard': '/dashboard',
        'clients': '/clients',
        'projects': '/projects',
        'tasks': '/tasks',
        'teams': '/teams',
        'users': '/users',
        'manufacturing': '/manufacturing',
        'service-maintenance': '/service-maintenance',
        'tools': '/tools',
        'documents': '/documents',
        'reports': '/reports',
        'settings': '/settings',
        'account': '/account',
        'time-tracking': '/time-tracking',
        'my-tasks': '/my-tasks',
        'leave-platform': '/leave-platform',
        
        // Settings sub-pages
        'settings-notifications': '/settings?tab=notifications',
        'settings-profile': '/settings?tab=profile',
        'settings-security': '/settings?tab=security',
        'settings-preferences': '/settings?tab=preferences',
        
        // Reports sub-pages
        'reports-analytics': '/reports?tab=analytics',
        'reports-financial': '/reports?tab=financial',
        'reports-operational': '/reports?tab=operational',
    };

    /**
     * Gets URL for a component/page
     * @param {string} componentName - Name of the component
     * @param {Object} options - Optional parameters (tab, section, etc.)
     * @returns {string} URL for the component
     */
    const getUrlForComponent = (componentName, options = {}) => {
        if (!componentName) {
            return '/dashboard';
        }

        const normalizedName = componentName.toLowerCase().trim();
        let baseUrl = COMPONENT_URL_MAP[normalizedName];

        if (!baseUrl) {
            // Try to construct from component name
            baseUrl = `/${normalizedName}`;
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
        if (options.id) {
            // If ID is provided, append to path
            baseUrl = `${baseUrl}/${options.id}`;
        }

        const queryString = queryParams.toString();
        if (queryString) {
            baseUrl += `?${queryString}`;
        }

        return baseUrl;
    };

    /**
     * Gets URL for an entity using EntityUrl if available
     * Falls back to component-based URL if EntityUrl is not available
     * @param {string} entityType - Type of entity (e.g., 'project', 'client', 'task')
     * @param {string} entityId - ID of the entity
     * @param {Object} options - Additional options (tab, section, parentId, etc.)
     * @returns {string} URL for the entity
     */
    const getUrlForEntity = (entityType, entityId, options = {}) => {
        if (!entityType || !entityId) {
            console.warn('NotificationUrlHelper.getUrlForEntity: entityType and entityId are required');
            return '/dashboard';
        }

        // Use EntityUrl if available (preferred method)
        if (window.EntityUrl && typeof window.EntityUrl.getEntityUrl === 'function') {
            try {
                return window.EntityUrl.getEntityUrl(entityType, entityId, options);
            } catch (error) {
                console.warn('NotificationUrlHelper: EntityUrl.getEntityUrl failed, using fallback:', error);
            }
        }

        // Fallback: construct URL manually
        const normalizedType = entityType.toLowerCase().trim();
        const pageMap = {
            'client': 'clients',
            'lead': 'clients',
            'opportunity': 'clients',
            'project': 'projects',
            'task': 'tasks',
            'invoice': 'clients',
            'salesorder': 'clients',
            'productionorder': 'manufacturing',
            'bom': 'manufacturing',
            'inventoryitem': 'manufacturing',
            'stocklocation': 'manufacturing',
            'stockmovement': 'manufacturing',
            'supplier': 'manufacturing',
            'purchaseorder': 'manufacturing',
            'jobcard': 'service-maintenance',
            'vehicle': 'service-maintenance',
            'serviceformtemplate': 'service-maintenance',
            'serviceforminstance': 'service-maintenance',
            'user': 'users',
            'usertask': 'my-tasks',
            'team': 'teams',
            'teamdocument': 'teams',
            'teamworkflow': 'teams',
            'teamchecklist': 'teams',
            'teamnotice': 'teams',
            'teamtask': 'teams',
            'monthlymeetingnotes': 'teams',
            'weeklymeetingnotes': 'teams',
            'departmentnotes': 'teams',
            'meetingactionitem': 'teams',
            'meetingcomment': 'teams',
            'leaveapplication': 'leave-platform',
            'leavebalance': 'leave-platform',
            'timeentry': 'time-tracking',
        };

        const page = pageMap[normalizedType] || 'dashboard';
        let url = `/${page}/${entityId}`;

        // Handle nested entities (e.g., tasks within projects)
        if (options.parentId && options.parentType) {
            const parentPage = pageMap[options.parentType.toLowerCase()] || options.parentType;
            const childType = normalizedType === 'task' ? 'tasks' : 
                           normalizedType === 'comment' ? 'comments' :
                           normalizedType === 'document' ? 'documents' :
                           normalizedType + 's';
            url = `/${parentPage}/${options.parentId}/${childType}/${entityId}`;
        }

        // Add query parameters
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

        const queryString = queryParams.toString();
        if (queryString) {
            url += `?${queryString}`;
        }

        return url;
    };

    /**
     * Ensures a notification has a valid URL
     * If link is missing or invalid, attempts to construct from metadata
     * @param {string} link - Existing link (may be empty or invalid)
     * @param {string|Object} metadata - Metadata object or JSON string
     * @returns {string} Valid URL for the notification
     */
    const ensureUrl = (link, metadata = null) => {
        // If link is already valid, return it
        if (link && typeof link === 'string' && link.trim() && link !== '') {
            // Ensure it starts with / or #
            const normalizedLink = link.startsWith('/') || link.startsWith('#') 
                ? link 
                : `/${link}`;
            return normalizedLink;
        }

        // Try to construct from metadata
        if (metadata) {
            try {
                const metadataObj = typeof metadata === 'string' 
                    ? JSON.parse(metadata) 
                    : metadata;

                if (!metadataObj || typeof metadataObj !== 'object') {
                    return '/dashboard';
                }

                // Try to find entity information in metadata
                const entityTypes = [
                    'projectId', 'taskId', 'clientId', 'leadId', 'opportunityId',
                    'invoiceId', 'userId', 'teamId', 'jobcardId', 'vehicleId',
                    'productionorderId', 'bomId', 'inventoryitemId', 'supplierId',
                    'leaveapplicationId', 'timeentryId'
                ];

                for (const entityTypeKey of entityTypes) {
                    if (metadataObj[entityTypeKey]) {
                        const entityId = metadataObj[entityTypeKey];
                        const entityType = entityTypeKey.replace('Id', '');
                        
                        // Build options from metadata
                        const options = {};
                        if (metadataObj.tab) options.tab = metadataObj.tab;
                        if (metadataObj.section) options.section = metadataObj.section;
                        if (metadataObj.commentId) options.commentId = metadataObj.commentId;
                        
                        // Handle nested entities
                        if (entityType === 'task' && metadataObj.projectId) {
                            options.parentId = metadataObj.projectId;
                            options.parentType = 'project';
                        }
                        
                        return getUrlForEntity(entityType, entityId, options);
                    }
                }

                // Try component/page name
                if (metadataObj.component || metadataObj.page) {
                    const componentName = metadataObj.component || metadataObj.page;
                    const options = {};
                    if (metadataObj.tab) options.tab = metadataObj.tab;
                    if (metadataObj.section) options.section = metadataObj.section;
                    return getUrlForComponent(componentName, options);
                }

            } catch (error) {
                console.warn('NotificationUrlHelper.ensureUrl: Failed to parse metadata:', error);
            }
        }

        // Default fallback
        return '/dashboard';
    };

    /**
     * Gets URL from notification object
     * Extracts and ensures URL from notification data
     * @param {Object} notification - Notification object with link and metadata
     * @returns {string} Valid URL
     */
    const getUrlFromNotification = (notification) => {
        if (!notification) {
            return '/dashboard';
        }

        return ensureUrl(notification.link, notification.metadata);
    };

    /**
     * Validates if a URL is valid for the application
     * @param {string} url - URL to validate
     * @returns {boolean} True if URL is valid
     */
    const isValidUrl = (url) => {
        if (!url || typeof url !== 'string') {
            return false;
        }

        const trimmed = url.trim();
        if (trimmed === '' || trimmed === '#') {
            return false;
        }

        // Must start with / or #
        if (!trimmed.startsWith('/') && !trimmed.startsWith('#')) {
            return false;
        }

        return true;
    };

    /**
     * Gets all available component URLs
     * Useful for documentation or debugging
     * @returns {Object} Map of component names to URLs
     */
    const getAllComponentUrls = () => {
        return { ...COMPONENT_URL_MAP };
    };

    // Export to window
    if (!window.NotificationUrlHelper) {
        window.NotificationUrlHelper = {
            getUrlForComponent,
            getUrlForEntity,
            ensureUrl,
            getUrlFromNotification,
            isValidUrl,
            getAllComponentUrls,
            COMPONENT_URL_MAP
        };
    }
})();

