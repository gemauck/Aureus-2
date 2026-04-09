(() => {
    if (typeof window === 'undefined') {
        return;
    }

    const APP_NAME = 'Abcotronics ERP';
    const TITLE_SEPARATOR = ' - ';
    const PAGE_LABELS = {
        dashboard: 'Dashboard',
        'erp-calendar': 'Calendar & Mail',
        clients: 'CRM',
        projects: 'Projects',
        tasks: 'Tasks',
        teams: 'Teams',
        users: 'Users',
        'leave-platform': 'Leave & HR',
        manufacturing: 'Manufacturing',
        'service-maintenance': 'Service & Maintenance',
        helpdesk: 'Helpdesk',
        tools: 'Tools',
        documents: 'Documents',
        reports: 'Reports',
        settings: 'Settings',
        account: 'Account',
        'time-tracking': 'Time Tracking',
        'my-tasks': 'My Tasks',
        'my-notes': 'My Notes',
        notifications: 'Notifications'
    };
    const PUBLIC_ROUTE_TITLES = {
        '/job-card': 'Job Card',
        '/jobcard': 'Job Card',
        '/accept-invitation': 'Accept Invitation',
        '/reset-password': 'Reset Password'
    };

    const cleanEntityName = (value) => {
        if (!value || typeof value !== 'string') {
            return '';
        }
        return value.replace(/\s+/g, ' ').trim();
    };

    const titleFromEntity = (entityName) => {
        const clean = cleanEntityName(entityName);
        if (!clean) {
            return APP_NAME;
        }
        return `${clean}${TITLE_SEPARATOR}${APP_NAME}`;
    };

    const titleFromPage = (page) => {
        const pageKey = String(page || '').toLowerCase();
        const label = PAGE_LABELS[pageKey];
        if (!label) {
            return APP_NAME;
        }
        return `${label}${TITLE_SEPARATOR}${APP_NAME}`;
    };

    const setTitle = (title) => {
        const next = cleanEntityName(title);
        if (!next) {
            return;
        }
        if (document.title !== next) {
            document.title = next;
        }
    };

    const setPublicTitle = (pathname) => {
        const key = String(pathname || '').toLowerCase();
        const publicTitle = PUBLIC_ROUTE_TITLES[key];
        if (!publicTitle) {
            return false;
        }
        setTitle(`${publicTitle}${TITLE_SEPARATOR}${APP_NAME}`);
        return true;
    };

    const extractName = (payload) => {
        if (!payload) {
            return '';
        }
        if (typeof payload === 'string') {
            return cleanEntityName(payload);
        }
        return cleanEntityName(
            payload.name ||
            payload.title ||
            payload.projectName ||
            payload.clientName ||
            payload.leadName ||
            payload.subject ||
            payload.reference ||
            ''
        );
    };

    const resolveApiName = async (endpoint) => {
        try {
            const token = window.storage?.getToken?.() || localStorage.getItem('authToken') || '';
            const response = await fetch(endpoint, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                }
            });
            if (!response.ok) {
                return '';
            }
            const json = await response.json();
            return extractName(
                json?.data?.project ||
                json?.data?.client ||
                json?.data?.lead ||
                json?.data?.opportunity ||
                json?.data?.jobCard ||
                json?.data?.ticket ||
                json?.project ||
                json?.client ||
                json?.lead ||
                json?.opportunity ||
                json?.jobCard ||
                json?.ticket ||
                json?.data ||
                json
            );
        } catch (_) {
            return '';
        }
    };

    const ENDPOINT_RESOLVERS = {
        projects: (id) => `/api/projects/${encodeURIComponent(id)}`,
        clients: (id) => `/api/clients/${encodeURIComponent(id)}`,
        leads: (id) => `/api/leads/${encodeURIComponent(id)}`,
        opportunities: (id) => `/api/opportunities/${encodeURIComponent(id)}`,
        manufacturing: (id) => `/api/manufacturing/${encodeURIComponent(id)}`,
        'service-maintenance': (id) => `/api/service-maintenance/job-cards/${encodeURIComponent(id)}`,
        helpdesk: (id) => `/api/helpdesk/tickets/${encodeURIComponent(id)}`
    };

    const getPageLabel = (page) => PAGE_LABELS[String(page || '').toLowerCase()] || '';

    const setPageTitle = ({ page, entityName }) => {
        const entityTitle = titleFromEntity(entityName);
        if (entityTitle !== APP_NAME) {
            setTitle(entityTitle);
            return;
        }
        setTitle(titleFromPage(page));
    };

    const resolveEntityNameByRoute = async (route = {}) => {
        const page = String(route?.page || '').toLowerCase();
        const segments = Array.isArray(route?.segments) ? route.segments : [];
        const entityId = segments[0];
        if (!entityId) {
            return '';
        }
        const endpointFactory = ENDPOINT_RESOLVERS[page];
        if (!endpointFactory) {
            return '';
        }
        return resolveApiName(endpointFactory(entityId));
    };

    window.PageTitleManager = {
        APP_NAME,
        PAGE_LABELS,
        getPageLabel,
        setTitle,
        setPageTitle,
        setPublicTitle,
        titleFromEntity,
        titleFromPage,
        cleanEntityName,
        extractName,
        resolveEntityNameByRoute
    };
})();
