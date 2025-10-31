// Permission system for role-based access control
export const PERMISSIONS = {
    // General permissions
    VIEW_ALL: 'view_all',
    VIEW_ASSIGNED: 'view_assigned',
    EDIT_ASSIGNED: 'edit_assigned',
    
    // Administration permissions
    MANAGE_USERS: 'manage_users',
    MANAGE_ROLES: 'manage_roles',
    SYSTEM_SETTINGS: 'system_settings',
    
    // Project permissions
    EDIT_PROJECTS: 'edit_projects',
    VIEW_PROJECTS: 'view_projects',
    MANAGE_TASKS: 'manage_tasks',
    DELETE_PROJECTS: 'delete_projects',
    
    // CRM permissions
    EDIT_CLIENTS: 'edit_clients',
    VIEW_CLIENTS: 'view_clients',
    MANAGE_LEADS: 'manage_leads',
    
    // Finance permissions
    MANAGE_INVOICING: 'manage_invoicing',
    VIEW_INVOICES: 'view_invoices',
    MANAGE_EXPENSES: 'manage_expenses',
    APPROVE_EXPENSES: 'approve_expenses',
    
    // Operations permissions
    TIME_TRACKING: 'time_tracking',
    VIEW_TEAM: 'view_team',
    MANAGE_TEAM: 'manage_team',
    
    // Reporting permissions
    VIEW_REPORTS: 'view_reports',
    EXPORT_DATA: 'export_data',
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
        permissions: [
            PERMISSIONS.VIEW_ALL,
            PERMISSIONS.EDIT_PROJECTS,
            PERMISSIONS.EDIT_CLIENTS,
            PERMISSIONS.VIEW_REPORTS,
            PERMISSIONS.MANAGE_TEAM,
            PERMISSIONS.MANAGE_TASKS,
            PERMISSIONS.TIME_TRACKING
        ],
        color: 'blue'
    },
    user: {
        name: 'User',
        description: 'Standard user with assigned task access',
        permissions: [
            PERMISSIONS.VIEW_ASSIGNED,
            PERMISSIONS.EDIT_ASSIGNED,
            PERMISSIONS.TIME_TRACKING,
            // All users can access Clients and Leads
            PERMISSIONS.VIEW_CLIENTS,
            PERMISSIONS.EDIT_CLIENTS,
            PERMISSIONS.MANAGE_LEADS
        ],
        color: 'orange'
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
        // All users can access Clients and Leads - no restrictions
        const clientLeadPermissions = [
            PERMISSIONS.VIEW_CLIENTS,
            PERMISSIONS.EDIT_CLIENTS,
            PERMISSIONS.MANAGE_LEADS
        ];
        if (clientLeadPermissions.includes(permission)) {
            return true;
        }
        
        // Admin has all permissions (unless explicitly overridden)
        if (this.userRole?.toLowerCase() === 'admin' && !this.customPermissions.length) {
            return true;
        }
        
        // Check custom permissions first (they override role permissions)
        if (this.customPermissions.includes('all') || this.customPermissions.includes(permission)) {
            return true;
        }
        
        // Check role-based permissions
        if (this.rolePermissions.includes('all')) {
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
        return this.hasPermission(PERMISSIONS.MANAGE_USERS);
    }

    canManageProjects() {
        return this.hasPermission(PERMISSIONS.EDIT_PROJECTS);
    }

    canManageClients() {
        // All users can manage clients - always return true
        return true;
    }

    canManageInvoicing() {
        return this.hasPermission(PERMISSIONS.MANAGE_INVOICING);
    }

    canViewReports() {
        return this.hasPermission(PERMISSIONS.VIEW_REPORTS);
    }

    canExportData() {
        return this.hasPermission(PERMISSIONS.EXPORT_DATA);
    }

    canManageTeam() {
        return this.hasPermission(PERMISSIONS.MANAGE_TEAM);
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
        // Always allow Clients and Leads permissions - no restrictions
        const clientLeadPermissions = [
            PERMISSIONS.VIEW_CLIENTS,
            PERMISSIONS.EDIT_CLIENTS,
            PERMISSIONS.MANAGE_LEADS
        ];
        if (clientLeadPermissions.includes(permission)) {
            return next();
        }
        
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
        // Always allow if any permission is a Clients/Leads permission
        const clientLeadPermissions = [
            PERMISSIONS.VIEW_CLIENTS,
            PERMISSIONS.EDIT_CLIENTS,
            PERMISSIONS.MANAGE_LEADS
        ];
        if (permissions.some(p => clientLeadPermissions.includes(p))) {
            return next();
        }
        
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
        // Always allow if all permissions are Clients/Leads permissions
        const clientLeadPermissions = [
            PERMISSIONS.VIEW_CLIENTS,
            PERMISSIONS.EDIT_CLIENTS,
            PERMISSIONS.MANAGE_LEADS
        ];
        if (permissions.every(p => clientLeadPermissions.includes(p))) {
            return next();
        }
        
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
        canManageProjects: () => checker.canManageProjects(),
        canManageClients: () => checker.canManageClients(),
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
    
    // Always allow Clients and Leads - no restrictions
    const clientLeadPermissions = [
        PERMISSIONS.VIEW_CLIENTS,
        PERMISSIONS.EDIT_CLIENTS,
        PERMISSIONS.MANAGE_LEADS
    ];
    
    let hasAccess = false;
    
    if (permission) {
        // Always allow if it's a Clients/Leads permission
        if (clientLeadPermissions.includes(permission)) {
            hasAccess = true;
        } else {
            const checker = new PermissionChecker(user);
            hasAccess = checker.hasPermission(permission);
        }
    } else if (permissions) {
        // Always allow if all/any permissions are Clients/Leads permissions
        if (requireAll && permissions.every(p => clientLeadPermissions.includes(p))) {
            hasAccess = true;
        } else if (!requireAll && permissions.some(p => clientLeadPermissions.includes(p))) {
            hasAccess = true;
        } else {
            const checker = new PermissionChecker(user);
            hasAccess = requireAll 
                ? checker.hasAllPermissions(permissions)
                : checker.hasAnyPermission(permissions);
        }
    }
    
    return hasAccess ? children : fallback;
}

// Export for global use
if (typeof window !== 'undefined') {
    window.PermissionChecker = PermissionChecker;
    window.PERMISSIONS = PERMISSIONS;
    window.ROLE_PERMISSIONS = ROLE_PERMISSIONS;
    window.usePermissions = usePermissions;
    window.PermissionGate = PermissionGate;
}
