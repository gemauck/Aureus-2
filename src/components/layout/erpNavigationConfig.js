/** Shared ERP shell routing constants and helpers (used by MainLayout). */

export const VALID_PAGES = [
  'dashboard',
  'erp-calendar',
  'clients',
  'projects',
  'tasks',
  'teams',
  'users',
  'leave-platform',
  'manufacturing',
  'service-maintenance',
  'helpdesk',
  'tools',
  'documents',
  'reports',
  'settings',
  'account',
  'time-tracking',
  'my-tasks',
  'my-notes',
  'notifications',
  'messages'
];

export const PUBLIC_ROUTES = ['/job-card', '/jobcard', '/accept-invitation', '/reset-password'];

/** Full-page routes rendered by App.jsx instead of the sidebar shell. */
export const APP_SHELL_STANDALONE_PAGES = [
  'po-from-document',
  'po-document',
  'podocument',
  'expense-capture',
  'expense'
];

/** Greenfield ERP Calendar: sidebar + route only for this account (must match api/_lib/erpCalendarAccess.js). */
export const ERP_CALENDAR_ALLOWED_EMAIL = 'garethm@abcotronics.co.za';

/** Set true when Calendar & Mail is ready to show again. */
export const ERP_CALENDAR_AND_MAIL_UI_ENABLED = false;

/** Wide layout viewport for "Desktop site" on phones; keep in sync with main.css .erp-desktop-site min-width. */
export const DESKTOP_SITE_LAYOUT_MIN_PX = 1330;

export function isMessengerPwaMode() {
  return typeof window !== 'undefined' && !!window.__PWA_MESSENGER__;
}

export function canAccessErpCalendar(user) {
  if (!ERP_CALENDAR_AND_MAIL_UI_ENABLED) return false;
  const email = (user?.email || '').toLowerCase().trim();
  return email === ERP_CALENDAR_ALLOWED_EMAIL.toLowerCase();
}

/** Map legacy route ids (e.g. crm) to current page keys. */
export function normalizeRoutePage(page) {
  if (!page) return page;
  return page === 'crm' ? 'clients' : page;
}

export function isValidPage(page) {
  return Boolean(page && VALID_PAGES.includes(page));
}

export function getRouteSnapshot() {
  if (typeof window !== 'undefined' && window.RouteState?.getRoute) {
    return window.RouteState.getRoute();
  }
  const pathSegments = (window.location.pathname || '')
    .replace(/^\//, '')
    .split('/')
    .filter(Boolean);
  const page = pathSegments[0] || 'dashboard';
  return {
    page: normalizeRoutePage(page),
    segments: pathSegments.slice(1),
    search: new URLSearchParams(window.location.search || ''),
    hash: window.location.hash || ''
  };
}

/**
 * Resolve the initial main-shell page from URL / RouteState (pure, no React).
 */
export function resolveInitialPage() {
  if (isMessengerPwaMode()) {
    return 'messages';
  }

  if (typeof window !== 'undefined' && window.RouteState) {
    const route = window.RouteState.getRoute();
    const page = normalizeRoutePage(route?.page);
    if (isValidPage(page)) {
      return page;
    }
  }

  const hash = window.location.hash || '';
  if (hash.startsWith('#/')) {
    const hashPath = hash.substring(2);
    const hashPathname = hashPath.split('?')[0];
    const hashSegments = hashPathname.split('/').filter(Boolean);
    if (hashSegments.length > 0) {
      const pageFromHash = normalizeRoutePage(hashSegments[0]);
      if (isValidPage(pageFromHash)) {
        return pageFromHash;
      }
    }
  }

  const pathname = (window.location.pathname || '').toLowerCase();
  if (pathname && pathname !== '/' && !PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    let pageFromPath = normalizeRoutePage(pathname.replace(/^\//, '').split('/')[0]);
    if (isValidPage(pageFromPath)) {
      return pageFromPath;
    }
  }

  return 'dashboard';
}

/**
 * Update browser URL for a page navigation (RouteState or history fallback).
 */
export function applyPageNavigation(page, options = {}) {
  if (!page || typeof window === 'undefined') return;

  let targetPage = page;
  if (isMessengerPwaMode() && targetPage !== 'messages') {
    targetPage = 'messages';
  }

  const subpath = Array.isArray(options.subpath) ? options.subpath : [];
  if (window.RouteState) {
    window.RouteState.setPageSubpath(targetPage, subpath, {
      replace: options.replace ?? false,
      preserveSearch: options.preserveSearch ?? false,
      preserveHash: options.preserveHash ?? false
    });
  } else {
    const pathSegments = [targetPage, ...subpath].filter(Boolean).join('/');
    const fallbackPath =
      targetPage === 'dashboard' && subpath.length === 0 ? '/' : `/${pathSegments}`;
    window.history.pushState({ page: targetPage }, '', fallbackPath);
  }
}
