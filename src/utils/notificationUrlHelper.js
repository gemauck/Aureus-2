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

    function notificationHelperIsWeeklyTrackerMetadata(o) {
        if (!o || typeof o !== 'object') return false;
        if (String(o.source || '').trim() === 'weeklyFMSReview') return true;
        if (o.docWeek != null && String(o.docWeek).trim() !== '') return true;
        if (o.weeklyWeek != null && String(o.weeklyWeek).trim() !== '') return true;
        return false;
    }
    function notificationHelperAppendTabForSource(q, source) {
        const s = String(source || '').trim();
        const m = {
            documentCollection: 'documentCollection',
            monthlyFMSReview: 'monthlyFMSReview',
            monthlyDataReview: 'monthlyDataReview',
            complianceReview: 'complianceReview'
        };
        const tab = m[s];
        if (tab) q.push(`tab=${encodeURIComponent(tab)}`);
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
        'expense-capture': '/expense-capture',
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
        if (normalizedType === 'leavebalance') {
            url = '/leave-platform';
        }

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
        if (normalizedType === 'leavebalance' && !queryParams.has('tab')) {
            queryParams.set('tab', 'balances');
        }
        if (normalizedType === 'leavebalance' && entityId && !queryParams.has('highlight')) {
            queryParams.set('highlight', entityId);
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
        // If link is already valid and contains tracker deep-link params, preserve it as-is
        const hasDocCollectionParams = link && (
            link.includes('docSectionId=') || 
            link.includes('docDocumentId=') || 
            link.includes('docMonth=')
        );
        const hasWeeklyFMSParams = link && (
            link.includes('weeklySectionId=') || link.includes('docWeek=') ||
            link.includes('weeklyDocumentId=') || link.includes('weeklyWeek=')
        );
        const hasTrackerParams = hasDocCollectionParams || hasWeeklyFMSParams;
        
        // If link is already valid, return it (preserve hash-based URLs and all tracker params)
        if (link && typeof link === 'string' && link.trim() && link !== '') {
            const normalizedLink = link.startsWith('/') || link.startsWith('#') 
                ? link 
                : `/${link}`;
            if (hasTrackerParams || normalizedLink.startsWith('#')) {
                return normalizedLink;
            }
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
                
                // PRIORITY 1: Weekly FMS only (never use docMonth as docWeek)
                if (
                    notificationHelperIsWeeklyTrackerMetadata(metadataObj) &&
                    metadataObj.projectId &&
                    (metadataObj.weeklySectionId || metadataObj.sectionId) &&
                    (metadataObj.weeklyDocumentId || metadataObj.documentId)
                ) {
                    const weekLabel = metadataObj.docWeek ?? metadataObj.weeklyWeek ?? metadataObj.week ?? metadataObj.weekNumber ?? metadataObj.weeklyMonth;
                    const queryParams = [];
                    const sectionId = metadataObj.weeklySectionId || metadataObj.sectionId;
                    const documentId = metadataObj.weeklyDocumentId || metadataObj.documentId;
                    if (sectionId) queryParams.push(`docSectionId=${encodeURIComponent(sectionId)}`);
                    if (documentId) queryParams.push(`docDocumentId=${encodeURIComponent(documentId)}`);
                    if (weekLabel != null) queryParams.push(`docWeek=${encodeURIComponent(weekLabel)}`);
                    if (metadataObj.docYear != null) queryParams.push(`docYear=${encodeURIComponent(metadataObj.docYear)}`);
                    if (metadataObj.year != null) queryParams.push(`docYear=${encodeURIComponent(metadataObj.year)}`);
                    if (metadataObj.commentId) queryParams.push(`commentId=${encodeURIComponent(metadataObj.commentId)}`);
                    if (sectionId) queryParams.push(`weeklySectionId=${encodeURIComponent(sectionId)}`);
                    const hashUrl = `#/projects/${metadataObj.projectId}?${queryParams.join('&')}`;
                    return hashUrl;
                }
                // PRIORITY 2: Document collection / Monthly FMS / Data & Compliance trackers
                if (metadataObj.projectId && (metadataObj.sectionId || metadataObj.documentId || metadataObj.month !== undefined || metadataObj.commentId)) {
                    const queryParams = [];
                    if (metadataObj.sectionId) queryParams.push(`docSectionId=${encodeURIComponent(metadataObj.sectionId)}`);
                    if (metadataObj.documentId) queryParams.push(`docDocumentId=${encodeURIComponent(metadataObj.documentId)}`);
                    if (metadataObj.month !== undefined && metadataObj.month !== null) queryParams.push(`docMonth=${encodeURIComponent(metadataObj.month)}`);
                    if (metadataObj.docYear != null) queryParams.push(`docYear=${encodeURIComponent(metadataObj.docYear)}`);
                    if (metadataObj.year != null) queryParams.push(`docYear=${encodeURIComponent(metadataObj.year)}`);
                    if (metadataObj.commentId) queryParams.push(`commentId=${encodeURIComponent(metadataObj.commentId)}`);
                    notificationHelperAppendTabForSource(queryParams, metadataObj.source);
                    const hashUrl = `#/projects/${metadataObj.projectId}?${queryParams.join('&')}`;
                    return hashUrl;
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
                        
                        const url = getUrlForEntity(entityType, entityId, options);
                        // If EntityUrl returns a path-based URL, convert to hash-based for notifications
                        const hashUrl = url.startsWith('/') && !url.startsWith('#') ? `#${url}` : url;
                        return hashUrl;
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

    /**
     * Navigate to the target of a notification (project, client, comment, etc.).
     * Uses getUrlFromNotification then either EntityUrl (for simple entity links) or
     * direct hash navigation (for tracker deep-links with docSectionId, docWeek, etc.).
     * @param {Object} notification - Notification object with link and metadata
     */
    const navigateToNotification = (notification) => {
        if (!notification) return;
        const rawUrl = getUrlFromNotification(notification);
        if (!rawUrl || rawUrl === '/dashboard') {
            window.location.hash = '#/dashboard';
            return;
        }
        // Normalize to hash for in-app routing
        let normalizedHash = rawUrl;
        if (!normalizedHash.startsWith('#')) {
            normalizedHash = normalizedHash.startsWith('/') ? '#' + normalizedHash : '#/' + normalizedHash;
        }
        const pathForEntity = normalizedHash.startsWith('#') ? normalizedHash.substring(1) : normalizedHash;
        const hasTrackerParams = pathForEntity.includes('docSectionId=') || pathForEntity.includes('docWeek=') ||
            pathForEntity.includes('commentId=') || pathForEntity.includes('weeklySectionId=') || pathForEntity.includes('docMonth=');
        // EntityUrl.parseEntityUrl/navigateToEntity do not preserve task= query param; use direct hash so project+task opens
        const hasTaskParam = pathForEntity.includes('task=');
        let navigationSuccessful = false;
        if (!hasTrackerParams && !hasTaskParam && window.EntityUrl && pathForEntity) {
            try {
                const parsed = window.EntityUrl.parseEntityUrl(pathForEntity);
                if (parsed && window.EntityUrl.navigateToEntity) {
                    window.EntityUrl.navigateToEntity(parsed.entityType, parsed.entityId, parsed.options || {});
                    navigationSuccessful = true;
                }
            } catch (e) {
                // fall through to hash
            }
        }
        if (!navigationSuccessful) {
            window.location.hash = normalizedHash;
        } else if (window.location.hash !== normalizedHash) {
            window.location.hash = normalizedHash;
        }
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
            navigateToNotification,
            COMPONENT_URL_MAP
        };
    }
})();

