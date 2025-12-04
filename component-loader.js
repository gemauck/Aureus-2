/**
 * Smart Component Loader
 * Automatically loads components from either:
 * - dist/src/ (production, pre-compiled)
 * - src/ (development, Babel transpiled)
 */

(function() {
    let buildVersion = null;

    const sanitizeVersion = (value) => {
        if (!value) return '';
        return String(value).replace(/[^a-zA-Z0-9_-]/g, '');
    };

    const getProjectsCacheTag = () => {
        const resolved = sanitizeVersion(buildVersion || window.__APP_BUILD_VERSION__);
        if (resolved) {
            return `projects-${resolved}`;
        }
        return `projects-${Date.now()}`;
    };

    const resolveBuildVersion = async () => {
        if (window.__APP_BUILD_VERSION__) {
            buildVersion = window.__APP_BUILD_VERSION__;
            return buildVersion;
        }

        const fallback = () => {
            const generated = Date.now().toString();
            buildVersion = generated;
            window.__APP_BUILD_VERSION__ = generated;
            return generated;
        };

        if (typeof fetch !== 'function') {
            return fallback();
        }

        try {
            const response = await fetch(`/dist/build-version.json?v=${Date.now()}`, { cache: 'no-store' });
            if (!response.ok) {
                console.warn('⚠️ component-loader: build-version.json response not ok, using fallback');
                return fallback();
            }

            const data = await response.json();
            const resolved = sanitizeVersion(data?.version) || fallback();
            buildVersion = resolved;
            window.__APP_BUILD_VERSION__ = resolved;
            console.log(`🧾 component-loader: Using build version ${resolved}`);
            return resolved;
        } catch (error) {
            console.warn('⚠️ component-loader: Failed to fetch build-version.json, using timestamp fallback', error);
            return fallback();
        }
    };

    // Component paths - all components that need to be loaded
    const componentPaths = [
        // Core utilities
        'utils/debug.js',
        'utils/api.js',
        'utils/localStorage.js',
        'utils/dataService.js',
        'utils/authStorage.js',
        'utils/databaseAPI-new.js',
        'utils/offlineScriptLoader.js',
        'utils/cache-manager.js',
        'utils/liveDataSync.js',
        'utils/auditLogger.js',
        'utils/permissions.js',
        'utils/leaveUtils.js',
        'utils/whatsapp.js',
        'utils/routeState.js',
        'utils/entityUrl.js',
        'utils/mentionHelper.js',
        
        // Hooks
        'hooks/usePersistence.js',
        
        // Common components
        'components/common/ErrorBoundary.jsx',
        'components/common/LoadingState.jsx',
        'components/common/QuickFallback.jsx',
        'components/common/SyncStatus.jsx',
        'components/common/DataContext.jsx',
        'components/common/AdvancedSearch.jsx',
        
        // Theme
        'components/theme/ThemeProvider.jsx',
        
        // Auth
        'components/auth/AuthProvider.jsx',
        'components/auth/LoginPage.jsx',
        'components/auth/PasswordChangeModal.jsx',
        
        // Maps
        'components/maps/MapComponent.jsx',
        
        // Dashboard
        'components/dashboard/DashboardSimple.jsx',
        'components/dashboard/DashboardFallback.jsx',
        'components/dashboard/DashboardLive.jsx',
        'components/dashboard/DashboardDatabaseFirst.jsx',
        'components/dashboard/DashboardEnhanced.jsx',
        
        // Clients
        'components/clients/ClientsSimple.jsx',
        // ClientDetailModal and LeadDetailModal are loaded early in index.html - DO NOT load here to avoid conflicts
        // 'components/clients/ClientDetailModal.jsx',
        // 'components/clients/LeadDetailModal.jsx',
        'components/clients/Clients.jsx',
        // 'components/clients/ClientsCached.jsx', // DISABLED: Loads after Clients and overrides pagination
        'components/clients/ClientsDatabaseFirst.jsx',
        'components/clients/ClientDetailModalMobile.jsx',
        'components/clients/ClientsMobile.jsx',
        'components/clients/ClientsMobileOptimized.jsx',
        'components/clients/BulkOperations.jsx',
        'components/clients/Pipeline.jsx',
        
        // Projects
        'components/projects/ProjectsSimple.jsx',
        'components/projects/CustomFieldModal.jsx',
        'components/projects/TaskDetailModal.jsx',
        'components/projects/StatusManagementModal.jsx',
        'components/projects/KanbanView.jsx',
        'components/projects/ListModal.jsx',
        'components/projects/ProjectModal.jsx',
        'components/projects/ProjectProgressTracker.jsx',
        'components/projects/CommentsPopup.jsx',
        'components/projects/DocumentCollectionModal.jsx',
        'components/projects/ProjectDetail.jsx',
        'components/projects/Projects.jsx',
        'components/projects/ProjectsDatabaseFirst.jsx',
        
        // Time Tracking
        'components/time/TimeModal.jsx',
        'components/time/TimeTracking.jsx',
        'components/time/TimeTrackingDatabaseFirst.jsx',
        
        // Invoicing
        'components/invoicing/InvoicingDatabaseFirst.jsx',
        'components/invoicing/RecurringInvoices.jsx',
        
        // Teams
        'components/teams/DocumentModal.jsx',
        'components/teams/WorkflowModal.jsx',
        'components/teams/ChecklistModal.jsx',
        'components/teams/NoticeModal.jsx',
        'components/teams/WorkflowExecutionModal.jsx',
        'components/teams/ManagementMeetingNotes.jsx',
        'components/teams/TeamModals.jsx',
        'components/teams/TeamsEnhanced.jsx',
        'components/teams/Teams.jsx',
        
        // Users
        'components/users/UserModal.jsx',
        'components/users/InviteUserModal.jsx',
        'components/users/PasswordDisplayModal.jsx',
        'components/users/Users.jsx',
        'components/users/UserManagement.jsx',
        
        // Leave Platform - Load before Manufacturing for better availability
        'components/leave-platform/LeavePlatform.jsx',
        'components/leave-platform/EmployeeDetail.jsx',
        
        // Manufacturing
        'components/manufacturing/locations/StockLocations.jsx',
        'components/manufacturing/Manufacturing.jsx',
        
        // Service and Maintenance
        'components/manufacturing/JobCards.jsx',
        'components/service-maintenance/ServiceAndMaintenance.jsx',
        'components/service-maintenance/ServiceFormsManager.jsx',
        
        // Tools
        'components/tools/TankSizeCalculator.jsx',
        'components/tools/PDFToWordConverter.jsx',
        'components/tools/HandwritingToWord.jsx',
        'components/tools/UnitConverter.jsx',
        'components/tools/Tools.jsx',
        
        // Reports
        'components/reports/AuditTrail.jsx',
        'components/reports/Reports.jsx',
        
        // Account & Settings
        'components/account/Account.jsx',
        'components/settings/Settings.jsx',
        
        // Layout
        'components/layout/MainLayout.jsx',
        
        // Services
        'services/GoogleCalendarService.js',
        'components/calendar/GoogleCalendarSync.jsx',
        
        // App
        'App.jsx'
    ];
    
    const offlineCapableComponents = [
        'components/service-maintenance/ServiceAndMaintenance.jsx',
        'components/service-maintenance/ServiceFormsManager.jsx'
    ];

    const componentCacheVersions = {
        // Bump both Service & Maintenance entry and form builder so browsers
        // are forced to fetch the latest logic.
        'components/service-maintenance/ServiceAndMaintenance.jsx': 'service-maintenance-ui-v20251127b',
        'components/service-maintenance/ServiceFormsManager.jsx': 'service-forms-manager-v20251127d'
    };
    
    function loadComponent(path) {
        const isProduction = window.USE_PRODUCTION_BUILD === true;
        const baseDir = isProduction ? './dist/src/' : './src/';
        const fullPath = baseDir + path;
        
        // Convert .jsx to .js in production
        const finalPath = isProduction ? fullPath.replace('.jsx', '.js') : fullPath;

        let cacheBustTag = componentCacheVersions[path] || null;

        const appendCacheParam = (src, tag) => tag ? `${src}${src.includes('?') ? '&' : '?'}v=${tag}` : src;

        const buildScriptSrc = (tag = cacheBustTag) => appendCacheParam(finalPath, tag);

        let scriptSrc = buildScriptSrc();
        let resolvedPath = scriptSrc.replace(/^\.\//, '/');
        
        if (isProduction && window.loadScriptWithOfflineFallback && offlineCapableComponents.includes(path)) {
            const cacheKey = cacheBustTag ? `offline::${path}?v=${cacheBustTag}` : `offline::${path}`;
            window.loadScriptWithOfflineFallback(resolvedPath, { cacheKey })
                .catch((error) => {
                    console.warn(`⚠️ Offline loader fallback for ${path}`, error);
                    appendScriptTag();
                });
            return;
        }
        
        appendScriptTag();
        
        function appendScriptTag() {
            const script = document.createElement('script');
            let dynamicCacheBust = cacheBustTag;
            let currentScriptSrc = buildScriptSrc(dynamicCacheBust);
            
            const existingScript = document.querySelector(`script[data-component-path="${path}"]`);
            
            const applyDynamicCacheBust = (tag) => {
                dynamicCacheBust = tag;
                currentScriptSrc = buildScriptSrc(dynamicCacheBust);
            };
            
            // Add cache-busting for UserManagement to force reload of new permissions
            if (path.includes('UserManagement')) {
                applyDynamicCacheBust('permissions-v2-' + Date.now());
            }
            
            // Force cache-bust for Management Meeting Notes bundle to ensure latest UI is loaded
            if (path.includes('ManagementMeetingNotes') || path.includes('Teams')) {
                applyDynamicCacheBust('teams-permissions-v20251111b');
            }
            
            if (path.includes('MainLayout')) {
                applyDynamicCacheBust('main-layout-v20251110');
            }
            
            if (path.includes('components/clients/Pipeline.jsx')) {
                applyDynamicCacheBust('pipeline-dnd-fix-20251110b');
            }

            if (path.includes('components/clients/Clients.jsx')) {
                applyDynamicCacheBust('clients-title-spacing-20251115');
            }

            if (path.includes('components/service-maintenance/ServiceAndMaintenance.jsx')) {
                applyDynamicCacheBust(componentCacheVersions[path] || 'service-maintenance-ui-v20251111');
            }

            if (path.includes('components/projects/ProjectDetail') || path.includes('components/projects/Projects.jsx') || path.includes('components/projects/ProjectProgressTracker.jsx')) {
                // Force cache-bust for task list UI changes
                if (path.includes('components/projects/ProjectDetail')) {
                    applyDynamicCacheBust('task-list-columns-v20251115-' + Date.now());
                } else {
                    applyDynamicCacheBust(getProjectsCacheTag());
                }
            }

            if (path.includes('components/manufacturing/JobCards.jsx')) {
                applyDynamicCacheBust('jobcards-mobile-toggle-v20251111');
            }

            // Force cache-bust for DashboardLive widget drag-drop and resize features
            // Using timestamp ensures every page load gets a fresh version
            if (path.includes('components/dashboard/DashboardLive.jsx') || path.includes('dashboard/DashboardLive')) {
                const timestamp = Date.now();
                const cacheTag = 'dashboard-widgets-v20251204-' + timestamp;
                applyDynamicCacheBust(cacheTag);
                console.log('🔄 DashboardLive: Loading with cache-bust tag:', cacheTag);
            }

            if (!dynamicCacheBust && cacheBustTag) {
                currentScriptSrc = buildScriptSrc(cacheBustTag);
            }

            if (existingScript) {
                const existingVersion = existingScript.getAttribute('data-component-version') || '';
                const targetVersion = dynamicCacheBust || cacheBustTag;
                if (targetVersion && existingVersion === targetVersion) {
                    return;
                }
                existingScript.remove();
            }

            if (isProduction) {
                // Production: Load pre-compiled JavaScript
                script.src = currentScriptSrc;
                script.defer = true;
            } else {
                // Development: Load JSX with Babel
                script.type = 'text/babel';
                script.src = currentScriptSrc;
            }
            
            script.onerror = () => {
                console.error(`❌ Failed to load: ${finalPath}`);
            };

            script.dataset.componentPath = path;
            const versionToSet = dynamicCacheBust || cacheBustTag;
            if (versionToSet) {
                script.dataset.componentVersion = versionToSet;
            }
            
            document.body.appendChild(script);
        }
        
    }
    
    // Wait for dependencies to be ready
    function waitForDependencies(callback) {
        const checkDeps = () => {
            const isProduction = window.USE_PRODUCTION_BUILD === true;
            
            // In production, just check React and ReactDOM
            if (isProduction) {
                if (window.React && window.ReactDOM) {
                    callback();
                    return true;
                }
            } else {
                // In development, also wait for Babel
                if (window.React && window.ReactDOM && window.Babel) {
                    callback();
                    return true;
                }
            }
            return false;
        };
        
        if (!checkDeps()) {
            const interval = setInterval(() => {
                if (checkDeps()) {
                    clearInterval(interval);
                }
            }, 100);
            
            // Timeout after 10 seconds
            setTimeout(() => {
                clearInterval(interval);
                console.error('❌ Dependencies failed to load');
            }, 10000);
        }
    }
    
    const startLoading = async () => {
        await resolveBuildVersion();

        const isProduction = window.USE_PRODUCTION_BUILD === true;
        console.log(`📦 Loading ${componentPaths.length} components (${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} mode)...`);
        
        const startTime = performance.now();
        
        componentPaths.forEach(loadComponent);
        
        setTimeout(() => {
            const loadTime = performance.now() - startTime;
            console.log(`✅ Components loaded in ${loadTime.toFixed(0)}ms`);
        }, 1000);
    };

    // Start loading when ready
    waitForDependencies(() => {
        startLoading().catch((error) => {
            console.error('❌ component-loader: Failed to start loading components', error);
            buildVersion = buildVersion || Date.now().toString();

            const isProduction = window.USE_PRODUCTION_BUILD === true;
            console.log(`📦 Loading ${componentPaths.length} components with fallback version (${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} mode)...`);

            const startTime = performance.now();
            componentPaths.forEach(loadComponent);

            setTimeout(() => {
                const loadTime = performance.now() - startTime;
                console.log(`✅ Components loaded in ${loadTime.toFixed(0)}ms (fallback)`);
            }, 1000);
        });
    });
})();
