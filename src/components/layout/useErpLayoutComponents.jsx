/**
 * Lazy-loaded ERP module resolution for MainLayout (window.* components + polling).
 */
import { useWindowComponent, useResolvedWindowComponent } from './useWindowComponent.js';
import {
    isReactComponent,
    isFullProjectsComponent,
    plainLoadingFallback,
    spinnerCardFallback,
    centeredSpinnerFallback,
} from './windowComponentUtils.js';

/**
 * @param {{ effectiveIsMobile: boolean, isDark: boolean }} layout
 */
export function useErpLayoutComponents({ effectiveIsMobile, isDark }) {
    const [dashboardLiveReady, setDashboardLiveReady] = React.useState(
        !!(window.DashboardLive && typeof window.DashboardLive === 'function')
    );
    const [dashboardLiveWaitTimedOut, setDashboardLiveWaitTimedOut] = React.useState(false);

    React.useEffect(() => {
        const checkDashboardLive = () => {
            if (window.DashboardLive && typeof window.DashboardLive === 'function') {
                setDashboardLiveReady(true);
                return true;
            }
            return false;
        };

        if (checkDashboardLive()) return undefined;

        const handleDashboardLiveReady = () => {
            checkDashboardLive();
        };
        window.addEventListener('dashboardLiveReady', handleDashboardLiveReady);

        const interval = setInterval(() => {
            if (checkDashboardLive()) {
                clearInterval(interval);
            }
        }, 100);

        const timeout = setTimeout(() => {
            clearInterval(interval);
            window.removeEventListener('dashboardLiveReady', handleDashboardLiveReady);
            if (!window.DashboardLive) {
                setDashboardLiveWaitTimedOut(true);
                console.warn('⚠️ DashboardLive not loaded after 30s — using fallback dashboard');
            }
        }, 30000);

        return () => {
            clearInterval(interval);
            clearTimeout(timeout);
            window.removeEventListener('dashboardLiveReady', handleDashboardLiveReady);
        };
    }, []);

    const Dashboard = React.useMemo(() => {
        if (dashboardLiveReady && window.DashboardLive) {
            return window.DashboardLive;
        }
        if (dashboardLiveWaitTimedOut) {
            return (
                window.DashboardSimple ||
                window.DashboardFallback ||
                window.DashboardDatabaseFirst ||
                window.Dashboard ||
                plainLoadingFallback('Dashboard loading...')
            );
        }
        return window.QuickDashboard || plainLoadingFallback('Dashboard loading...');
    }, [dashboardLiveReady, dashboardLiveWaitTimedOut]);

    const ErrorBoundary = React.useMemo(
        () => window.ErrorBoundary || (({ children }) => children),
        []
    );

    const [mainClientsAvailable, setMainClientsAvailable] = React.useState(() => isReactComponent(window.Clients));

    React.useEffect(() => {
        const checkMainClients = () => {
            if (isReactComponent(window.Clients)) {
                if (!mainClientsAvailable) {
                    console.log('🔄 Main Clients component detected, updating state');
                    setMainClientsAvailable(true);
                }
                return true;
            }
            return false;
        };

        if (checkMainClients()) return undefined;

        const handleClientsAvailable = () => {
            checkMainClients();
        };
        window.addEventListener('clientsComponentReady', handleClientsAvailable);

        if (window._clientsComponentReady) {
            checkMainClients();
        }

        const interval = setInterval(() => {
            if (checkMainClients()) {
                clearInterval(interval);
            }
        }, 200);

        const timeout = setTimeout(() => {
            clearInterval(interval);
            window.removeEventListener('clientsComponentReady', handleClientsAvailable);
            if (!mainClientsAvailable) {
                console.warn('⚠️ Main Clients component not loaded after 30 seconds');
            }
        }, 30000);

        return () => {
            clearInterval(interval);
            clearTimeout(timeout);
            window.removeEventListener('clientsComponentReady', handleClientsAvailable);
        };
    }, [mainClientsAvailable]);

    const getClientsComponent = React.useCallback(() => {
        if (effectiveIsMobile && window.ClientsMobileOptimized) {
            return window.ClientsMobileOptimized;
        }
        if (effectiveIsMobile && window.ClientsMobile) {
            return window.ClientsMobile;
        }
        if (isReactComponent(window.Clients)) {
            return window.Clients;
        }
        return plainLoadingFallback('Clients loading...');
    }, [effectiveIsMobile, mainClientsAvailable]);

    const notificationCenterReady = useWindowComponent({
        resolve: () => window.NotificationCenter,
        timeoutMs: 10000,
    });

    const messageCenterReady = useWindowComponent({
        resolve: () => window.MessageCenter,
        timeoutMs: 10000,
    });

    const taskManagementReady = useWindowComponent({
        resolve: () => window.TaskManagement,
        readyEvents: 'taskManagementComponentReady',
        timeoutMs: 10000,
    });

    const TaskManagementComponent = useResolvedWindowComponent({
        ready: taskManagementReady,
        resolve: () => window.TaskManagement,
        fallback: spinnerCardFallback('Loading My Tasks...', isDark),
        deps: [isDark],
    });

    const myNotesReady = useWindowComponent({
        resolve: () => window.MyNotes,
        readyEvents: 'myNotesComponentReady',
        timeoutMs: 10000,
    });

    const MyNotesComponent = useResolvedWindowComponent({
        ready: myNotesReady,
        resolve: () => window.MyNotes,
        fallback: spinnerCardFallback('Loading My Notes...', isDark),
        deps: [isDark],
    });

    const resolveProjectsComponent = () => {
        if (isFullProjectsComponent(window.Projects)) return window.Projects;
        return null;
    };

    const [projectsComponentReady, setProjectsComponentReady] = React.useState(
        !!(typeof window !== 'undefined' && isFullProjectsComponent(window.Projects))
    );

    React.useEffect(() => {
        const checkProjects = () => {
            if (resolveProjectsComponent()) {
                setProjectsComponentReady(true);
                return true;
            }
            return false;
        };

        if (checkProjects()) return undefined;

        const handleFullReady = () => {
            checkProjects();
        };
        window.addEventListener('projectsFullComponentReady', handleFullReady);

        let intervalId = null;
        const maxAttempts = 30;
        let attempts = 0;
        intervalId = setInterval(() => {
            attempts += 1;
            if (checkProjects() || attempts >= maxAttempts) {
                clearInterval(intervalId);
            }
        }, 1000);

        const timeout = setTimeout(() => {
            if (intervalId) clearInterval(intervalId);
        }, 31000);

        return () => {
            if (intervalId) clearInterval(intervalId);
            clearTimeout(timeout);
            window.removeEventListener('projectsFullComponentReady', handleFullReady);
        };
    }, []);

    const Projects = React.useMemo(() => {
        const ProjectsComponent = resolveProjectsComponent();
        if (ProjectsComponent) {
            return ProjectsComponent;
        }
        return plainLoadingFallback('Projects loading...');
    }, [projectsComponentReady]);

    const usersComponentReady = useWindowComponent({
        resolve: () => window.Users || window.UserManagement,
        readyEvents: 'usersComponentReady',
        timeoutMs: 20000,
        timeoutWarn: '⚠️ MainLayout: Users component not loaded after 20 seconds',
    });

    const Users = useResolvedWindowComponent({
        ready: usersComponentReady,
        resolve: () => window.Users || window.UserManagement,
        fallback: plainLoadingFallback('Users component loading...'),
    });

    const manufacturingComponentReady = useWindowComponent({
        resolve: () => window.Manufacturing,
        readyEvents: 'manufacturingComponentReady',
        timeoutMs: 30000,
        timeoutWarn: '⚠️ MainLayout: Manufacturing component not loaded after 30 seconds (lazy load may still succeed)',
    });

    const Manufacturing = useResolvedWindowComponent({
        ready: manufacturingComponentReady,
        resolve: () => window.Manufacturing,
        fallback: plainLoadingFallback('Manufacturing loading...'),
    });

    const serviceMaintenanceReady = useWindowComponent({
        resolve: () => window.ServiceAndMaintenance,
        readyEvents: 'serviceMaintenanceComponentReady',
        timeoutMs: 15000,
        timeoutWarn: '⚠️ MainLayout: ServiceAndMaintenance component not loaded after 15 seconds (lazy load may still succeed)',
    });

    React.useEffect(() => {
        if (serviceMaintenanceReady) {
            return undefined;
        }

        const loaderId = 'service-maintenance-component-loader';
        if (window.loadScriptWithOfflineFallback) {
            const scriptElement = document.querySelector('[data-offline-cache-key="offline::components/service-maintenance/ServiceAndMaintenance.jsx"]');
            if (!scriptElement) {
                console.warn('⚠️ ServiceAndMaintenance component not loaded yet. Attempting offline-capable load...');
                window.loadScriptWithOfflineFallback('/dist/src/components/service-maintenance/ServiceAndMaintenance.js', {
                    cacheKey: 'offline::components/service-maintenance/ServiceAndMaintenance.jsx',
                }).catch((error) => {
                    console.error('❌ Offline ServiceAndMaintenance loader failed, falling back to dynamic script tag', error);
                    createFallbackScript();
                });
            }
        } else if (!document.getElementById(loaderId)) {
            createFallbackScript();
        }

        function createFallbackScript() {
            if (document.getElementById(loaderId)) {
                return;
            }
            console.warn('⚠️ ServiceAndMaintenance component not loaded yet. Attempting dynamic script load...');
            const script = document.createElement('script');
            script.id = loaderId;
            script.defer = true;
            script.src = `/dist/src/components/service-maintenance/ServiceAndMaintenance.js?v=sm-${Date.now()}`;
            script.onerror = (error) => {
                console.error('❌ Failed to dynamically load ServiceAndMaintenance component:', error);
            };
            document.body.appendChild(script);
        }
    }, [serviceMaintenanceReady]);

    const ServiceAndMaintenanceFallback = React.useMemo(
        () => centeredSpinnerFallback('Loading Service & Maintenance...'),
        []
    );

    const ServiceAndMaintenance = serviceMaintenanceReady &&
        window.ServiceAndMaintenance &&
        typeof window.ServiceAndMaintenance === 'function'
        ? window.ServiceAndMaintenance
        : ServiceAndMaintenanceFallback;

    const helpdeskReady = useWindowComponent({
        resolve: () => window.Helpdesk,
        readyEvents: 'componentLoaded',
        readyEventFilter: (event) => event.detail?.component === 'Helpdesk',
        timeoutMs: 15000,
        timeoutWarn: '⚠️ MainLayout: Helpdesk component not loaded after 15 seconds (lazy load may still succeed)',
    });

    const HelpdeskFallback = React.useMemo(() => centeredSpinnerFallback('Loading Helpdesk...'), []);

    const Helpdesk = helpdeskReady && window.Helpdesk && typeof window.Helpdesk === 'function'
        ? window.Helpdesk
        : HelpdeskFallback;

    const leavePlatformReady = useWindowComponent({
        resolve: () => window.LeavePlatform,
        readyEvents: 'leavePlatformComponentReady',
        timeoutMs: 10000,
        timeoutWarn: '⚠️ MainLayout: LeavePlatform component not loaded after 10 seconds',
    });

    const LeavePlatform = React.useMemo(() => {
        const component = window.LeavePlatform;
        if (component && typeof component === 'function') {
            return component;
        }
        console.warn('⚠️ MainLayout: LeavePlatform component not available, using fallback');
        return () => React.createElement(
            'div',
            { className: 'text-center py-12 text-gray-500' },
            React.createElement('div', { className: 'animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-4' }),
            React.createElement('p', null, 'Leave & HR loading…'),
            React.createElement('p', { className: 'text-xs text-gray-400 mt-2' }, `Component status: ${typeof window.LeavePlatform}`)
        );
    }, [leavePlatformReady]);

    const erpCalendarReady = useWindowComponent({
        resolve: () => window.ErpCalendar,
        readyEvents: 'erpCalendarComponentReady',
        timeoutMs: 0,
    });

    const Teams = window.Teams || window.TeamsSimple || plainLoadingFallback('Teams module loading...');
    const Messenger = window.Messenger || plainLoadingFallback('Messages loading...');
    const TimeTracking = window.TimeTracking || window.TimeTrackingDatabaseFirst || plainLoadingFallback('Time Tracking loading...');
    const Tools = window.Tools || plainLoadingFallback('Tools loading...');
    const Reports = window.Reports || plainLoadingFallback('Reports loading...');
    const Settings = window.Settings || plainLoadingFallback('Settings loading...');
    const Account = window.Account || plainLoadingFallback('Account loading...');
    const PasswordChangeModal = window.PasswordChangeModal;

    return {
        Dashboard,
        ErrorBoundary,
        getClientsComponent,
        mainClientsAvailable,
        notificationCenterReady,
        messageCenterReady,
        TaskManagementComponent,
        MyNotesComponent,
        Projects,
        Teams,
        Messenger,
        Users,
        TimeTracking,
        Manufacturing,
        ServiceAndMaintenance,
        Helpdesk,
        Tools,
        Reports,
        Settings,
        Account,
        LeavePlatform,
        erpCalendarReady,
        PasswordChangeModal,
    };
}

export default useErpLayoutComponents;
