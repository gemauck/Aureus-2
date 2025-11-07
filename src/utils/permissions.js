// Permission system for role-based access control
// Main permission categories - all users have access to everything except Users and HR (admin-only)
export const PERMISSIONS = {
    // Main module permissions
    ACCESS_CRM: 'access_crm',
    ACCESS_PROJECTS: 'access_projects',
    ACCESS_TEAM: 'access_team',
    ACCESS_USERS: 'access_users', // Admin only
    ACCESS_HR: 'access_hr', // Admin only
    ACCESS_MANUFACTURING: 'access_manufacturing',
    ACCESS_TOOL: 'access_tool',
    ACCESS_REPORTS: 'access_reports',
    
    // Legacy permissions (kept for backward compatibility, mapped to new structure)
    VIEW_ALL: 'view_all',
    VIEW_ASSIGNED: 'view_assigned',
    EDIT_ASSIGNED: 'edit_assigned',
    MANAGE_USERS: 'manage_users',
    MANAGE_ROLES: 'manage_roles',
    SYSTEM_SETTINGS: 'system_settings',
    EDIT_PROJECTS: 'edit_projects',
    VIEW_PROJECTS: 'view_projects',
    MANAGE_TASKS: 'manage_tasks',
    DELETE_PROJECTS: 'delete_projects',
    EDIT_CLIENTS: 'edit_clients',
    VIEW_CLIENTS: 'view_clients',
    MANAGE_LEADS: 'manage_leads',
    MANAGE_INVOICING: 'manage_invoicing',
    VIEW_INVOICES: 'view_invoices',
    MANAGE_EXPENSES: 'manage_expenses',
    APPROVE_EXPENSES: 'approve_expenses',
    TIME_TRACKING: 'time_tracking',
    VIEW_TEAM: 'view_team',
    MANAGE_TEAM: 'manage_team',
    VIEW_MANUFACTURING: 'view_manufacturing',
    EDIT_MANUFACTURING: 'edit_manufacturing',
    MANAGE_MANUFACTURING: 'manage_manufacturing',
    VIEW_REPORTS: 'view_reports',
    EXPORT_DATA: 'export_data',
};

// Permission categories for UI organization
export const PERMISSION_CATEGORIES = {
    CRM: {
        id: 'crm',
        label: 'CRM',
        permission: PERMISSIONS.ACCESS_CRM,
        description: 'Customer Relationship Management',
        adminOnly: false
    },
    PROJECTS: {
        id: 'projects',
        label: 'Projects',
        permission: PERMISSIONS.ACCESS_PROJECTS,
        description: 'Project Management',
        adminOnly: false
    },
    TEAM: {
        id: 'team',
        label: 'Team',
        permission: PERMISSIONS.ACCESS_TEAM,
        description: 'Team Management',
        adminOnly: false
    },
    USERS: {
        id: 'users',
        label: 'Users',
        permission: PERMISSIONS.ACCESS_USERS,
        description: 'User Management',
        adminOnly: true
    },
    HR: {
        id: 'hr',
        label: 'HR',
        permission: PERMISSIONS.ACCESS_HR,
        description: 'Human Resources',
        adminOnly: true
    },
    MANUFACTURING: {
        id: 'manufacturing',
        label: 'Manufacturing',
        permission: PERMISSIONS.ACCESS_MANUFACTURING,
        description: 'Manufacturing Operations',
        adminOnly: false
    },
    TOOL: {
        id: 'tool',
        label: 'Tool',
        permission: PERMISSIONS.ACCESS_TOOL,
        description: 'Tool Management',
        adminOnly: false
    },
    REPORTS: {
        id: 'reports',
        label: 'Reports',
        permission: PERMISSIONS.ACCESS_REPORTS,
        description: 'Reports and Analytics',
        adminOnly: false
    }
};

export const ROLE_PERMISSIONS = {
    admin: {
        name: 'Administrator',
        description: 'Full system access - Can manage users and all system settings',
        permissions: ['all'], // Special case - admin has all permissions
        color: 'red'
    },
    manager: {
        name: 'Manager',
        description: 'Manage projects, teams, and assigned resources',
        permissions: ['all'], // All non-admin users get access to everything except Users and HR
        color: 'blue'
    },
    user: {
        name: 'User',
        description: 'Standard user with access to all modules except Users and HR',
        permissions: ['all'], // All non-admin users get access to everything except Users and HR
        color: 'orange'
    },
    guest: {
        name: 'Guest',
        description: 'Limited access - Can access all modules except Users and HR',
        permissions: ['all'], // All non-admin users get access to everything except Users and HR
        color: 'gray'
    }
};

// Permission checking utility
export class PermissionChecker {
    constructor(user) {
        this.user = user;
        this.userRole = user?.role || 'viewer';
        this.rolePermissions = ROLE_PERMISSIONS[this.userRole]?.permissions || [];
        
        // Parse custom permissions from user object (stored as JSON string or array)
        let customPermissions = [];
        if (user?.permissions) {
            try {
                if (typeof user.permissions === 'string') {
                    customPermissions = JSON.parse(user.permissions);
                } else if (Array.isArray(user.permissions)) {
                    customPermissions = user.permissions;
                }
            } catch (e) {
                console.warn('Failed to parse user permissions:', e);
                customPermissions = [];
            }
        }
        this.customPermissions = customPermissions;
    }

    hasPermission(permission) {
        const isAdmin = this.userRole?.toLowerCase() === 'admin';
        
        // Admin-only permissions: Users and HR
        const adminOnlyPermissions = [
            PERMISSIONS.ACCESS_USERS,
            PERMISSIONS.ACCESS_HR,
            PERMISSIONS.MANAGE_USERS,
            PERMISSIONS.MANAGE_ROLES,
            PERMISSIONS.SYSTEM_SETTINGS
        ];
        
        // If permission is admin-only and user is not admin, deny access
        if (adminOnlyPermissions.includes(permission) && !isAdmin) {
            return false;
        }
        
        // All users (including non-admins) have access to these modules by default
        const publicPermissions = [
            PERMISSIONS.ACCESS_CRM,
            PERMISSIONS.ACCESS_PROJECTS,
            PERMISSIONS.ACCESS_TEAM,
            PERMISSIONS.ACCESS_MANUFACTURING,
            PERMISSIONS.ACCESS_TOOL,
            PERMISSIONS.ACCESS_REPORTS,
            // Legacy permissions for backward compatibility
            PERMISSIONS.VIEW_CLIENTS,
            PERMISSIONS.EDIT_CLIENTS,
            PERMISSIONS.MANAGE_LEADS,
            PERMISSIONS.VIEW_MANUFACTURING,
            PERMISSIONS.EDIT_MANUFACTURING,
            PERMISSIONS.MANAGE_MANUFACTURING,
            PERMISSIONS.VIEW_PROJECTS,
            PERMISSIONS.EDIT_PROJECTS,
            PERMISSIONS.MANAGE_TASKS,
            PERMISSIONS.VIEW_TEAM,
            PERMISSIONS.MANAGE_TEAM,
            PERMISSIONS.TIME_TRACKING,
            PERMISSIONS.VIEW_REPORTS,
            PERMISSIONS.EXPORT_DATA,
            PERMISSIONS.VIEW_ALL,
            PERMISSIONS.VIEW_ASSIGNED,
            PERMISSIONS.EDIT_ASSIGNED
        ];
        
        // Check custom permissions first (they override role and public permissions)
        // If custom permissions are explicitly set (not empty), they take precedence
        if (this.customPermissions && this.customPermissions.length > 0) {
            // If custom permissions include 'all', grant access (unless admin-only and not admin)
            if (this.customPermissions.includes('all')) {
                if (!isAdmin && adminOnlyPermissions.includes(permission)) {
                    return false;
                }
                return true;
            }
            // If permission is explicitly in custom permissions, grant access
            if (this.customPermissions.includes(permission)) {
                return true;
            }
            // If custom permissions are set but don't include this permission, deny access
            // This allows admins to restrict users by setting specific permissions
            return false;
        }
        
        // If no custom permissions are set, fall back to role-based and public permissions
        
        // Admin has all permissions by default
        if (isAdmin) {
            return true;
        }
        
        // If permission is public, grant access (for non-admin users without custom permissions)
        if (publicPermissions.includes(permission)) {
            return true;
        }
        
        // Check role-based permissions
        if (this.rolePermissions.includes('all')) {
            // For non-admin users with 'all', they still don't get admin-only permissions
            if (!isAdmin && adminOnlyPermissions.includes(permission)) {
                return false;
            }
            return true;
        }
        
        return this.rolePermissions.includes(permission);
    }

    hasAnyPermission(permissions) {
        return permissions.some(permission => this.hasPermission(permission));
    }

    hasAllPermissions(permissions) {
        return permissions.every(permission => this.hasPermission(permission));
    }

    canManageUsers() {
        return this.hasPermission(PERMISSIONS.ACCESS_USERS) || this.hasPermission(PERMISSIONS.MANAGE_USERS);
    }

    canAccessHR() {
        return this.hasPermission(PERMISSIONS.ACCESS_HR);
    }

    canAccessCRM() {
        return this.hasPermission(PERMISSIONS.ACCESS_CRM);
    }

    canAccessProjects() {
        return this.hasPermission(PERMISSIONS.ACCESS_PROJECTS);
    }

    canAccessTeam() {
        return this.hasPermission(PERMISSIONS.ACCESS_TEAM);
    }

    canAccessManufacturing() {
        return this.hasPermission(PERMISSIONS.ACCESS_MANUFACTURING);
    }

    canAccessTool() {
        return this.hasPermission(PERMISSIONS.ACCESS_TOOL);
    }

    canAccessReports() {
        return this.hasPermission(PERMISSIONS.ACCESS_REPORTS);
    }

    canManageProjects() {
        return this.hasPermission(PERMISSIONS.EDIT_PROJECTS) || this.hasPermission(PERMISSIONS.ACCESS_PROJECTS);
    }

    canManageClients() {
        // All users can manage clients - always return true
        return this.hasPermission(PERMISSIONS.ACCESS_CRM);
    }

    canManageManufacturing() {
        // All users can manage manufacturing - always return true
        return this.hasPermission(PERMISSIONS.ACCESS_MANUFACTURING);
    }

    canManageInvoicing() {
        return this.hasPermission(PERMISSIONS.MANAGE_INVOICING);
    }

    canViewReports() {
        return this.hasPermission(PERMISSIONS.VIEW_REPORTS) || this.hasPermission(PERMISSIONS.ACCESS_REPORTS);
    }

    canExportData() {
        return this.hasPermission(PERMISSIONS.EXPORT_DATA);
    }

    canManageTeam() {
        return this.hasPermission(PERMISSIONS.MANAGE_TEAM) || this.hasPermission(PERMISSIONS.ACCESS_TEAM);
    }

    canTimeTrack() {
        return this.hasPermission(PERMISSIONS.TIME_TRACKING);
    }

    // Get user's role info
    getRoleInfo() {
        return ROLE_PERMISSIONS[this.userRole] || ROLE_PERMISSIONS.viewer;
    }

    // Get all permissions for the user
    getAllPermissions() {
        if (this.rolePermissions.includes('all')) {
            return Object.values(PERMISSIONS);
        }
        return this.rolePermissions;
    }
}

// Middleware for API routes
export function requirePermission(permission) {
    return (req, res, next) => {
        const checker = new PermissionChecker(req.user);
        
        if (!checker.hasPermission(permission)) {
            return res.status(403).json({
                error: 'Insufficient permissions',
                required: permission,
                userRole: req.user?.role
            });
        }
        
        next();
    };
}

// Middleware for multiple permissions (any)
export function requireAnyPermission(permissions) {
    return (req, res, next) => {
        const checker = new PermissionChecker(req.user);
        
        if (!checker.hasAnyPermission(permissions)) {
            return res.status(403).json({
                error: 'Insufficient permissions',
                required: permissions,
                userRole: req.user?.role
            });
        }
        
        next();
    };
}

// Middleware for multiple permissions (all)
export function requireAllPermissions(permissions) {
    return (req, res, next) => {
        const checker = new PermissionChecker(req.user);
        
        if (!checker.hasAllPermissions(permissions)) {
            return res.status(403).json({
                error: 'Insufficient permissions',
                required: permissions,
                userRole: req.user?.role
            });
        }
        
        next();
    };
}

// React hook for permission checking
export function usePermissions(user) {
    const checker = new PermissionChecker(user);
    
    return {
        hasPermission: (permission) => checker.hasPermission(permission),
        hasAnyPermission: (permissions) => checker.hasAnyPermission(permissions),
        hasAllPermissions: (permissions) => checker.hasAllPermissions(permissions),
        canManageUsers: () => checker.canManageUsers(),
        canAccessHR: () => checker.canAccessHR(),
        canAccessCRM: () => checker.canAccessCRM(),
        canAccessProjects: () => checker.canAccessProjects(),
        canAccessTeam: () => checker.canAccessTeam(),
        canAccessManufacturing: () => checker.canAccessManufacturing(),
        canAccessTool: () => checker.canAccessTool(),
        canAccessReports: () => checker.canAccessReports(),
        canManageProjects: () => checker.canManageProjects(),
        canManageClients: () => checker.canManageClients(),
        canManageManufacturing: () => checker.canManageManufacturing(),
        canManageInvoicing: () => checker.canManageInvoicing(),
        canViewReports: () => checker.canViewReports(),
        canExportData: () => checker.canExportData(),
        canManageTeam: () => checker.canManageTeam(),
        canTimeTrack: () => checker.canTimeTrack(),
        getRoleInfo: () => checker.getRoleInfo(),
        getAllPermissions: () => checker.getAllPermissions()
    };
}

// Component wrapper for permission-based rendering
export function PermissionGate({ permission, permissions, requireAll = false, children, fallback = null }) {
    const user = window.storage?.getUser?.();
    const checker = new PermissionChecker(user);
    
    let hasAccess = false;
    
    if (permission) {
        hasAccess = checker.hasPermission(permission);
    } else if (permissions) {
        hasAccess = requireAll 
            ? checker.hasAllPermissions(permissions)
            : checker.hasAnyPermission(permissions);
    }
    
    return hasAccess ? children : fallback;
}

// Export for global use
if (typeof window !== 'undefined') {
    window.PermissionChecker = PermissionChecker;
    window.PERMISSIONS = PERMISSIONS;
    window.PERMISSION_CATEGORIES = PERMISSION_CATEGORIES;
    window.ROLE_PERMISSIONS = ROLE_PERMISSIONS;
    window.usePermissions = usePermissions;
    window.PermissionGate = PermissionGate;
}
