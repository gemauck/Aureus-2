/**
 * Core entry bundle for critical frontend modules.
 * This replaces dozens of individual <script> tags in index.html
 * with a single deferred bundle so the browser can download,
 * parse, and execute the application shell faster.
 *
 * Only include modules required for initial render.
 * Feature areas that can wait continue to be loaded
 * via the existing lazy-load infrastructure.
 */

// Mobile helpers and debug utilities
import './utils/mobileTableConverter.js';
import './utils/debug.js';
import './utils/routeState.js';

// Core services and utilities that must exist before providers render
import './utils/api.js';
import './utils/localStorage.js';
import './utils/dataService.js';
import './utils/authStorage.js';
import './utils/forceLogout.js';
import './utils/permissions.js';
import './utils/databaseAPI.js';
import './utils/cache-manager.js';
import './utils/liveDataSync.js';
import './utils/auditLogger.js';
import './utils/componentDependencyChecker.js';
import './utils/mentionHelper.js';
import './hooks/usePersistence.js';

// Global React providers and shared components
import './components/theme/ThemeProvider.jsx';
import './components/common/DataContext.jsx';
import './components/common/SyncStatus.jsx';
import './components/common/ErrorBoundary.jsx';
import './components/common/LoadingState.jsx';
import './components/common/QuickFallback.jsx';
import './components/common/CommentInputWithMentions.jsx';
import './components/common/NotificationCenter.jsx';
import './components/common/GlobalSearch.jsx';
import './components/maps/MapComponent.jsx';

// Auth flow
import './components/auth/AuthProvider.jsx';
import './components/auth/LoginPage.jsx';
import './components/auth/AcceptInvitation.jsx';
import './components/auth/PasswordChangeModal.jsx';
import './components/auth/ResetPassword.jsx';

// Dashboard essentials
import './components/dashboard/Calendar.jsx';
import './components/dashboard/DashboardSimple.jsx';
import './components/dashboard/DashboardFallback.jsx';

// Core business modules needed immediately
import './components/clients/ClientDetailModal.jsx';
import './components/clients/LeadDetailModal.jsx';
import './components/clients/OpportunityDetailModal.jsx';
import './components/clients/Clients.jsx';
import './components/clients/Pipeline.jsx';
import './components/clients/PipelineIntegration.js';
import './components/settings/NotificationSettings.jsx';
import './utils/leaveUtils.js';
import './components/leave-platform/LeavePlatform.jsx';
import './components/layout/MainLayout.jsx';

// Public access modules
import './components/manufacturing/JobCardFormPublic.jsx';

// Application entry point
import './App.jsx';

// Post-load diagnostics (mirrors previous inline checks in index.html)
if (typeof window !== 'undefined') {
    try {
        window.USE_LOAD_ONCE_ARCHITECTURE = true;
        window.dispatchEvent(new Event('corebundle:ready'));
    } catch (error) {
        console.error('❌ Failed to dispatch corebundle:ready event:', error);
    }
    try {
        if (!window.storage) {
            console.error('❌ CRITICAL: window.storage not available after core bundle');
        } else {
        }
        if (!window.PERMISSION_CATEGORIES) {
            console.warn('⚠️ PERMISSION_CATEGORIES not loaded - permissions modal may not work correctly');
        } else {
        }
    } catch (error) {
        console.error('❌ Core bundle diagnostics failed:', error);
    }
}

