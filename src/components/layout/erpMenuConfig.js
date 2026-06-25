/** Sidebar menu definitions and permission filtering (used by MainLayout). */

import { canAccessErpCalendar } from './erpNavigationConfig.js';

export const ALL_MENU_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'fa-th-large', permission: null },
  { id: 'erp-calendar', label: 'Calendar & Mail', icon: 'fa-calendar-week', permission: null },
  { id: 'clients', label: 'CRM', icon: 'fa-users', permission: 'ACCESS_CRM' },
  { id: 'projects', label: 'Projects', icon: 'fa-project-diagram', permission: 'ACCESS_PROJECTS' },
  { id: 'teams', label: 'Teams', icon: 'fa-user-friends', permission: 'ACCESS_TEAM' },
  { id: 'users', label: 'Users', icon: 'fa-user-cog', permission: 'ACCESS_USERS' },
  { id: 'manufacturing', label: 'Manufacturing', icon: 'fa-industry', permission: 'ACCESS_MANUFACTURING' },
  {
    id: 'service-maintenance',
    label: 'Service & Maintenance',
    icon: 'fa-wrench',
    permission: 'ACCESS_SERVICE_MAINTENANCE'
  },
  { id: 'helpdesk', label: 'Helpdesk', icon: 'fa-headset', permission: 'ACCESS_HELPDESK' },
  { id: 'tools', label: 'Tools', icon: 'fa-toolbox', permission: 'ACCESS_TOOL' },
  { id: 'documents', label: 'Documents', icon: 'fa-folder-open', permission: null },
  { id: 'notifications', label: 'Notifications', icon: 'fa-bell', permission: null },
  { id: 'reports', label: 'Reports', icon: 'fa-chart-bar', permission: 'ACCESS_REPORTS' },
  { id: 'my-tasks', label: 'My Tasks', icon: 'fa-check-square', permission: null },
  { id: 'my-notes', label: 'My Notes', icon: 'fa-sticky-note', permission: null },
  { id: 'messages', label: 'Messages', icon: 'fa-comments', permission: null }
];

function isAdminOrSuperAdmin(userRole) {
  const role = (userRole || '').toLowerCase();
  return ['admin', 'administrator', 'superadmin', 'super-admin', 'super_admin', 'system_admin'].includes(
    role
  );
}

/**
 * Filter sidebar items for the signed-in user (mirrors MainLayout permission rules).
 */
export function filterMenuItemsForUser(user, permissionChecker) {
  const userRole = user?.role?.toLowerCase();
  const adminOrSuperAdmin = isAdminOrSuperAdmin(userRole);

  if (userRole === 'guest') {
    return ALL_MENU_ITEMS.filter((item) => ['projects', 'my-tasks', 'my-notes'].includes(item.id));
  }

  return ALL_MENU_ITEMS.filter((item) => {
    if (item.id === 'erp-calendar') {
      return canAccessErpCalendar(user);
    }
    if (!item.permission) {
      return true;
    }
    if (adminOrSuperAdmin) {
      return true;
    }
    if (permissionChecker && typeof window !== 'undefined' && window.PERMISSIONS) {
      const permissionKey = window.PERMISSIONS[item.permission];
      if (permissionKey) {
        return permissionChecker.hasPermission(permissionKey);
      }
    }
    if (item.permission === 'ACCESS_USERS') {
      return adminOrSuperAdmin;
    }
    return true;
  });
}

/** Split filtered menu into primary nav vs personal shortcuts. */
export function partitionMenuItems(menuItems) {
  const list = Array.isArray(menuItems) ? menuItems : [];
  return {
    myTasksMenuItem: list.find((item) => item.id === 'my-tasks') || null,
    myNotesMenuItem: list.find((item) => item.id === 'my-notes') || null,
    messagesMenuItem: list.find((item) => item.id === 'messages') || null,
    primaryMenuItems: list.filter(
      (item) => item.id !== 'my-tasks' && item.id !== 'my-notes' && item.id !== 'messages'
    )
  };
}

/** Display label for the signed-in user role (sidebar, etc.) */
export function formatUserRoleLabel(role) {
  if (role == null || role === '') return '';
  const raw = String(role).trim();
  const compact = raw.toLowerCase().replace(/[\s_-]/g, '');
  if (compact === 'superadmin') return 'SuperAdmin';
  return raw
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Default layout: mobile shell on narrow viewports; desktop shell on wide screens. */
export function readPreferDesktopLayout() {
  const narrowViewport = typeof window !== 'undefined' && window.innerWidth < 1024;
  try {
    const v = localStorage.getItem('erpPreferDesktopLayout');
    if (v === 'false') return false;
    if (v === 'true') return true;
    return !narrowViewport;
  } catch {
    return !narrowViewport;
  }
}
