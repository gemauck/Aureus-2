import React from 'react';
import { canAccessErpCalendar } from './erpNavigationConfig.js';

/**
 * Renders the active ERP module for `currentPage`.
 * Component resolution and lazy-load polling stay in MainLayout; this module owns routing → UI mapping.
 */
const ErpPageRenderer = ({
    currentPage,
    ErrorBoundary,
    user,
    isAdmin,
    isDark,
    permissionChecker,
    erpCalendarReady,
    getClientsComponent,
    mainClientsAvailable,
    components,
}) => {
    const {
        Dashboard,
        Projects,
        Teams,
        Messenger,
        Users,
        Account,
        TimeTracking,
        LeavePlatform,
        Manufacturing,
        ServiceAndMaintenance,
        Helpdesk,
        Tools,
        Reports,
        TaskManagementComponent,
        MyNotesComponent,
        Settings,
    } = components;

    switch (currentPage) {
        case 'dashboard':
            return <ErrorBoundary key="dashboard"><Dashboard /></ErrorBoundary>;
        case 'erp-calendar': {
            if (!user) {
                return (
                    <div key="erp-calendar-auth-wait" className="flex flex-col items-center justify-center min-h-[320px] text-gray-500">
                        <i className="fas fa-spinner fa-spin text-3xl mb-3" />
                        <p>Loading…</p>
                    </div>
                );
            }
            if (!canAccessErpCalendar(user)) {
                return (
                    <div key="erp-calendar-access-denied" className="flex items-center justify-center min-h-[400px]">
                        <div className="text-center max-w-md px-4">
                            <i className="fas fa-lock text-4xl text-gray-400 mb-4" />
                            <h2 className={`text-xl font-semibold mb-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Not available</h2>
                            <p className={isDark ? 'text-gray-400' : 'text-gray-600'}>
                                The Calendar page is not enabled for your account.
                            </p>
                        </div>
                    </div>
                );
            }
            const ErpCal = window.ErpCalendar;
            if (!erpCalendarReady || !ErpCal || typeof ErpCal !== 'function') {
                return (
                    <div key="erp-calendar-loading" className="flex flex-col items-center justify-center min-h-[320px] text-gray-500">
                        <i className="fas fa-spinner fa-spin text-3xl mb-3" />
                        <p>Loading calendar…</p>
                    </div>
                );
            }
            return <ErrorBoundary key="erp-calendar"><ErpCal /></ErrorBoundary>;
        }
        case 'clients': {
            const ClientsComponent = getClientsComponent();
            const MainClientsComponent = window.Clients;
            const isValidComponent = MainClientsComponent && (
                typeof MainClientsComponent === 'function' ||
                (typeof MainClientsComponent === 'object' && MainClientsComponent.$$typeof)
            );
            const clientsKey = isValidComponent ? 'clients-main' : 'clients-loading';
            if (!isValidComponent) {
                console.log('⚠️ MainLayout: window.Clients not available yet, showing loading state');
            }
            return <ErrorBoundary key={clientsKey}><ClientsComponent /></ErrorBoundary>;
        }
        case 'projects':
            return <ErrorBoundary key="projects"><Projects /></ErrorBoundary>;
        case 'teams':
            return <ErrorBoundary key="teams"><Teams /></ErrorBoundary>;
        case 'messages':
            return <ErrorBoundary key="messages"><Messenger /></ErrorBoundary>;
        case 'users':
            if (permissionChecker && window.PERMISSIONS) {
                if (!permissionChecker.hasPermission(window.PERMISSIONS.ACCESS_USERS)) {
                    return (
                        <div key="users-access-denied" className="flex items-center justify-center min-h-[400px]">
                            <div className="text-center">
                                <i className="fas fa-lock text-4xl text-gray-400 mb-4"></i>
                                <h2 className={`text-xl font-semibold mb-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Access Denied</h2>
                                <p className={isDark ? 'text-gray-400' : 'text-gray-600'}>You need administrator privileges to access this page.</p>
                            </div>
                        </div>
                    );
                }
            } else if (!isAdmin) {
                return (
                    <div key="users-access-denied" className="flex items-center justify-center min-h-[400px]">
                        <div className="text-center">
                            <i className="fas fa-lock text-4xl text-gray-400 mb-4"></i>
                            <h2 className={`text-xl font-semibold mb-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Access Denied</h2>
                            <p className={isDark ? 'text-gray-400' : 'text-gray-600'}>You need administrator privileges to access this page.</p>
                        </div>
                    </div>
                );
            }
            return <ErrorBoundary key="users"><Users /></ErrorBoundary>;
        case 'account':
            return <ErrorBoundary key="account"><Account /></ErrorBoundary>;
        case 'time-tracking':
            return <ErrorBoundary key="time-tracking"><TimeTracking /></ErrorBoundary>;
        case 'leave-platform':
            if (!window.LeavePlatform) {
                console.warn('⚠️ MainLayout: window.LeavePlatform is not available!');
                return (
                    <div key="leave-platform-error" className="p-8 text-center">
                        <div className="text-red-600 mb-4">
                            <i className="fas fa-exclamation-triangle text-4xl mb-4"></i>
                            <p>Leave &amp; HR module did not load. Please refresh the page.</p>
                            <p className="text-sm text-gray-500 mt-2">Checking component availability...</p>
                        </div>
                    </div>
                );
            }
            return <ErrorBoundary key="leave-platform"><LeavePlatform /></ErrorBoundary>;
        case 'manufacturing':
            return <ErrorBoundary key="manufacturing"><Manufacturing /></ErrorBoundary>;
        case 'service-maintenance':
            return <ErrorBoundary key="service-maintenance"><ServiceAndMaintenance /></ErrorBoundary>;
        case 'helpdesk':
            return <ErrorBoundary key="helpdesk"><Helpdesk /></ErrorBoundary>;
        case 'tools':
            return <ErrorBoundary key="tools"><Tools /></ErrorBoundary>;
        case 'reports':
            return <ErrorBoundary key="reports"><Reports /></ErrorBoundary>;
        case 'notifications': {
            const NotificationsPageComponent = window.NotificationsPage;
            return (
                <ErrorBoundary key="notifications">
                    {NotificationsPageComponent ? (
                        <NotificationsPageComponent />
                    ) : (
                        <div key="notifications-loading" className="p-8 text-center text-gray-500">Loading notifications...</div>
                    )}
                </ErrorBoundary>
            );
        }
        case 'my-tasks':
            return <ErrorBoundary key="my-tasks"><TaskManagementComponent /></ErrorBoundary>;
        case 'my-notes':
            return <ErrorBoundary key="my-notes"><MyNotesComponent /></ErrorBoundary>;
        case 'settings':
            return <ErrorBoundary key="settings"><Settings /></ErrorBoundary>;
        case 'documents':
            return <div key="documents" className="text-center py-12 text-gray-500">Documents module - Coming soon!</div>;
        default:
            return <ErrorBoundary key="default"><Dashboard /></ErrorBoundary>;
    }
};

export default ErpPageRenderer;
