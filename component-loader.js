/**
 * Smart Component Loader
 * Automatically loads components from either:
 * - dist/src/ (production, pre-compiled)
 * - src/ (development, Babel transpiled)
 */

(function() {
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
        
        // Manufacturing
        'components/manufacturing/locations/StockLocations.jsx',
        'components/manufacturing/Manufacturing.jsx',
        
        // Service and Maintenance
        'components/manufacturing/JobCards.jsx',
        'components/service-maintenance/ServiceAndMaintenance.jsx',
        
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
        'components/service-maintenance/ServiceAndMaintenance.jsx'
    ];
    
    function loadComponent(path) {
        const isProduction = window.USE_PRODUCTION_BUILD === true;
        const baseDir = isProduction ? './dist/src/' : './src/';
        const fullPath = baseDir + path;
        
        // Convert .jsx to .js in production
        const finalPath = isProduction ? fullPath.replace('.jsx', '.js') : fullPath;
        const resolvedPath = finalPath.replace(/^\.\//, '/');
        
        if (isProduction && window.loadScriptWithOfflineFallback && offlineCapableComponents.includes(path)) {
            const cacheKey = `offline::${path}`;
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
            let cacheBustTag = null;
            
            const existingScript = document.querySelector(`script[data-component-path="${path}"]`);
            
            // Add cache-busting for UserManagement to force reload of new permissions
            let scriptSrc = finalPath;
            if (path.includes('UserManagement')) {
                scriptSrc += '?v=permissions-v2-' + Date.now();
            }
            
            // Force cache-bust for Management Meeting Notes bundle to ensure latest UI is loaded
            if (path.includes('ManagementMeetingNotes') || path.includes('Teams')) {
                cacheBustTag = 'teams-permissions-v20251110c';
                scriptSrc += (scriptSrc.includes('?') ? '&' : '?') + 'v=' + cacheBustTag;
            }
            
            if (path.includes('MainLayout')) {
                cacheBustTag = 'main-layout-v20251110';
                scriptSrc += (scriptSrc.includes('?') ? '&' : '?') + 'v=' + cacheBustTag;
            }
            
            if (path.includes('components/clients/Pipeline.jsx')) {
                cacheBustTag = 'pipeline-dnd-fix-20251110b';
                scriptSrc += (scriptSrc.includes('?') ? '&' : '?') + 'v=' + cacheBustTag;
            }

            if (path.includes('components/clients/Clients.jsx')) {
                cacheBustTag = 'clients-pipeline-fallback-logs-20251110';
                scriptSrc += (scriptSrc.includes('?') ? '&' : '?') + 'v=' + cacheBustTag;
            }

            if (existingScript) {
                const existingVersion = existingScript.getAttribute('data-component-version') || '';
                if (cacheBustTag && existingVersion === cacheBustTag) {
                    return;
                }
                existingScript.remove();
            }

            if (isProduction) {
                // Production: Load pre-compiled JavaScript
                script.src = scriptSrc;
                script.defer = true;
            } else {
                // Development: Load JSX with Babel
                script.type = 'text/babel';
                script.src = scriptSrc;
            }
            
            script.onerror = () => {
                console.error(`❌ Failed to load: ${finalPath}`);
            };

            script.dataset.componentPath = path;
            if (cacheBustTag) {
                script.dataset.componentVersion = cacheBustTag;
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
    
    // Start loading when ready
    waitForDependencies(() => {
        const isProduction = window.USE_PRODUCTION_BUILD === true;
        console.log(`📦 Loading ${componentPaths.length} components (${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} mode)...`);
        
        const startTime = performance.now();
        
        // Load all components
        componentPaths.forEach(loadComponent);
        
        // Log completion
        setTimeout(() => {
            const loadTime = performance.now() - startTime;
            console.log(`✅ Components loaded in ${loadTime.toFixed(0)}ms`);
        }, 1000);
    });
})();
