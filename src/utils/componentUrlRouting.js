/**
 * Component URL Routing Utility
 * 
 * Provides reusable functions for components to handle URL-based navigation.
 * This ensures consistent URL routing across all ERP components.
 * 
 * Usage:
 *   const { updateUrl, handleRouteChange, clearUrl } = useComponentUrlRouting('clients', entityId, setViewingEntity);
 */

(() => {
    if (typeof window === 'undefined') {
        return;
    }

    /**
     * Creates URL routing helpers for a component
     * 
     * @param {string} pageName - The page name (e.g., 'clients', 'teams', 'users')
     * @param {string|number} entityId - The current entity ID being viewed
     * @param {Function} setViewingEntity - Function to set the viewing entity
     * @param {Function} findEntityById - Function to find entity by ID (optional)
     * @param {Object} options - Additional options
     * @param {string} options.tab - Current tab
     * @param {string} options.section - Current section
     * @param {string} options.commentId - Current comment ID
     * @returns {Object} URL routing helpers
     */
    const createComponentUrlRouting = (pageName, entityId, setViewingEntity, findEntityById = null, options = {}) => {
        /**
         * Updates the URL with current state
         */
        const updateUrl = (newOptions = {}) => {
            if (!window.RouteState || !entityId) return;
            
            const mergedOptions = { ...options, ...newOptions };
            const segments = [String(entityId)];
            const searchParams = new URLSearchParams();
            
            if (mergedOptions.tab) {
                searchParams.set('tab', mergedOptions.tab);
            }
            if (mergedOptions.section) {
                searchParams.set('section', mergedOptions.section);
            }
            if (mergedOptions.commentId) {
                searchParams.set('commentId', mergedOptions.commentId);
            }
            if (mergedOptions.view) {
                searchParams.set('view', mergedOptions.view);
            }
            
            const search = searchParams.toString();
            window.RouteState.navigate({
                page: pageName,
                segments: segments,
                search: search ? `?${search}` : '',
                hash: '',
                replace: false,
                preserveSearch: false,
                preserveHash: false
            });
        };

        /**
         * Clears the URL (returns to list view)
         */
        const clearUrl = () => {
            if (!window.RouteState) return;
            
            window.RouteState.setPageSubpath(pageName, [], {
                replace: false,
                preserveSearch: false,
                preserveHash: false
            });
        };

        /**
         * Handles route changes and opens entities from URL
         */
        const handleRouteChange = async (route, entities = []) => {
            if (!route || route.page !== pageName) return;
            
            // If no segments, clear viewing entity
            if (!route.segments || route.segments.length === 0) {
                if (entityId) {
                    setViewingEntity(null);
                }
                return;
            }
            
            // URL contains an entity ID - open that entity
            const urlEntityId = route.segments[0];
            if (urlEntityId && String(urlEntityId) !== String(entityId)) {
                // Find entity in cache or fetch it
                let entity = null;
                
                if (findEntityById && typeof findEntityById === 'function') {
                    entity = findEntityById(urlEntityId);
                } else if (Array.isArray(entities)) {
                    entity = entities.find(e => String(e.id) === String(urlEntityId));
                }
                
                if (entity) {
                    setViewingEntity(entity);
                    
                    // Handle tab/section/comment from query params
                    const tab = route.search?.get('tab');
                    const section = route.search?.get('section');
                    const commentId = route.search?.get('commentId');
                    
                    if (tab || section || commentId) {
                        setTimeout(() => {
                            if (tab) {
                                window.dispatchEvent(new CustomEvent(`switch${pageName.charAt(0).toUpperCase() + pageName.slice(1)}Tab`, {
                                    detail: { tab, section, commentId }
                                }));
                            }
                            if (section) {
                                window.dispatchEvent(new CustomEvent(`switch${pageName.charAt(0).toUpperCase() + pageName.slice(1)}Section`, {
                                    detail: { section, commentId }
                                }));
                            }
                            if (commentId) {
                                window.dispatchEvent(new CustomEvent('scrollToComment', {
                                    detail: { commentId }
                                }));
                            }
                        }, 100);
                    }
                } else {
                    // Entity not in cache - try to fetch it
                    // Components should implement their own fetch logic
                    window.dispatchEvent(new CustomEvent(`fetch${pageName.charAt(0).toUpperCase() + pageName.slice(1)}Entity`, {
                        detail: { entityId: urlEntityId, route }
                    }));
                }
            } else if (urlEntityId && String(urlEntityId) === String(entityId)) {
                // Already viewing this entity, but check for tab/section changes
                const tab = route.search?.get('tab');
                const section = route.search?.get('section');
                const commentId = route.search?.get('commentId');
                
                if (tab || section || commentId) {
                    setTimeout(() => {
                        if (tab) {
                            window.dispatchEvent(new CustomEvent(`switch${pageName.charAt(0).toUpperCase() + pageName.slice(1)}Tab`, {
                                detail: { tab, section, commentId }
                            }));
                        }
                        if (section) {
                            window.dispatchEvent(new CustomEvent(`switch${pageName.charAt(0).toUpperCase() + pageName.slice(1)}Section`, {
                                detail: { section, commentId }
                            }));
                        }
                        if (commentId) {
                            window.dispatchEvent(new CustomEvent('scrollToComment', {
                                detail: { commentId }
                            }));
                        }
                    }, 100);
                }
            }
        };

        return {
            updateUrl,
            clearUrl,
            handleRouteChange
        };
    };

    /**
     * Expose to window for use in components
     */
    if (!window.ComponentUrlRouting) {
        window.ComponentUrlRouting = {
            create: createComponentUrlRouting
        };
    }
})();
