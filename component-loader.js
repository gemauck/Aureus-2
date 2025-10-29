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
        'utils/cache-manager.js',
        'utils/liveDataSync.js',
        'utils/auditLogger.js',
        'utils/permissions.js',
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
        'components/clients/ClientDetailModal.jsx',
        'components/clients/LeadDetailModal.jsx',
        'components/clients/Clients.jsx',
        'components/clients/ClientsCached.jsx',
        'components/clients/ClientsDatabaseFirst.jsx',
        'components/clients/ClientDetailModalMobile.jsx',
        'components/clients/ClientsMobile.jsx',
        'components/clients/ClientsMobileOptimized.jsx',
        'components/clients/BulkOperations.jsx',
        'components/clients/Pipeline.jsx', // Load Pipeline BEFORE PipelineIntegration
        'components/clients/PipelineIntegration.js',
        
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
        'components/teams/TeamModals.jsx',
        'components/teams/TeamsEnhanced.jsx',
        'components/teams/Teams.jsx',
        
        // Users
        'components/users/UserModal.jsx',
        'components/users/InviteUserModal.jsx',
        'components/users/PasswordDisplayModal.jsx',
        'components/users/Users.jsx',
        'components/users/UserManagement.jsx',
        
        // Manufacturing
        'components/manufacturing/locations/StockLocations.jsx',
        'components/manufacturing/Manufacturing.jsx',
        
        // Tools
        'components/tools/TankSizeCalculator.jsx',
        'components/tools/PDFToWordConverter.jsx',
        'components/tools/HandwritingToWord.jsx',
        'components/tools/UnitConverter.jsx',
        'components/tools/Tools.jsx',
        
        // HR
        'components/hr/EmployeeManagement.jsx',
        'components/hr/LeaveManagement.jsx',
        'components/hr/LeaveBalance.jsx',
        'components/hr/Attendance.jsx',
        'components/hr/QuickBooksPayrollSync.jsx',
        'components/hr/Payroll.jsx',
        'components/hr/HR.jsx',
        
        // Reports
        'components/reports/AuditTrail.jsx',
        'components/reports/Reports.jsx',
        
        // Account & Settings
        'components/account/Account.jsx',
        'components/settings/Settings.jsx',
        'components/settings/SettingsPortal.jsx',
        
        // Layout
        'components/layout/MainLayout.jsx',
        
        // Services
        'services/GoogleCalendarService.js',
        'components/calendar/GoogleCalendarSync.jsx',
        
        // App
        'App.jsx'
    ];
    
    function loadComponent(path) {
        const isProduction = window.USE_PRODUCTION_BUILD === true;
        const baseDir = isProduction ? './dist/src/' : './src/';
        const fullPath = baseDir + path;
        
        // Convert .jsx to .js in production
        const finalPath = isProduction ? fullPath.replace('.jsx', '.js') : fullPath;
        
        const script = document.createElement('script');
        
        if (isProduction) {
            // Production: Load pre-compiled JavaScript
            script.src = finalPath;
            script.defer = true;
        } else {
            // Development: Load JSX with Babel
            script.type = 'text/babel';
            script.src = finalPath;
        }
        
        script.onerror = () => {
            console.error(`❌ Failed to load: ${finalPath}`);
        };
        
        document.body.appendChild(script);
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
