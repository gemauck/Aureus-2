// Permission system for role-based access control
// Main permission categories - all users have access to everything except Users (admin-only)
export const PERMISSIONS = {
    // Main module permissions
    ACCESS_CRM: 'access_crm',
    ACCESS_PROJECTS: 'access_projects',
    ACCESS_TEAM: 'access_team',
    TEAM_MANAGEMENT: 'team_management_management',
    TEAM_TECHNICAL: 'team_management_technical',
    TEAM_SUPPORT: 'team_management_support',
    TEAM_DATA_ANALYTICS: 'team_management_data_analytics',
    TEAM_FINANCE: 'team_management_finance',
    TEAM_BUSINESS_DEVELOPMENT: 'team_management_business_development',
    TEAM_COMMERCIAL: 'team_management_commercial',
    TEAM_COMPLIANCE: 'team_management_compliance',
    ACCESS_USERS: 'access_users', // Admin only
    ACCESS_MANUFACTURING: 'access_manufacturing',
    ACCESS_DOCUMENTS: 'access_documents',
    ACCESS_SERVICE_MAINTENANCE: 'access_service_maintenance',
    ACCESS_HELPDESK: 'access_helpdesk',
    HELPDESK_CREATE: 'helpdesk_create',
    HELPDESK_EDIT: 'helpdesk_edit',
    HELPDESK_DELETE: 'helpdesk_delete',
    HELPDESK_ASSIGN: 'helpdesk_assign',
    HELPDESK_ADMIN: 'helpdesk_admin',
    ACCESS_TOOL: 'access_tool',
    ACCESS_REPORTS: 'access_reports',
    ACCESS_LEAVE_PLATFORM: 'access_leave_platform',
    
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
        adminOnly: false,
        subcategories: [
            {
                id: 'team_management',
                label: 'Management',
                permission: PERMISSIONS.TEAM_MANAGEMENT,
                description: 'Executive leadership and strategic planning'
            },
            {
                id: 'team_technical',
                label: 'Technical',
                permission: PERMISSIONS.TEAM_TECHNICAL,
                description: 'Technical operations and system maintenance'
            },
            {
                id: 'team_support',
                label: 'Support',
                permission: PERMISSIONS.TEAM_SUPPORT,
                description: 'Customer support and service delivery'
            },
            {
                id: 'team_data_analytics',
                label: 'Data Analytics',
                permission: PERMISSIONS.TEAM_DATA_ANALYTICS,
                description: 'Data analysis and business intelligence'
            },
            {
                id: 'team_finance',
                label: 'Finance',
                permission: PERMISSIONS.TEAM_FINANCE,
                description: 'Financial management and accounting'
            },
            {
                id: 'team_business_development',
                label: 'Business Development',
                permission: PERMISSIONS.TEAM_BUSINESS_DEVELOPMENT,
                description: 'Growth strategies and new opportunities'
            },
            {
                id: 'team_commercial',
                label: 'Commercial',
                permission: PERMISSIONS.TEAM_COMMERCIAL,
                description: 'Sales and commercial operations'
            },
            {
                id: 'team_compliance',
                label: 'Compliance',
                permission: PERMISSIONS.TEAM_COMPLIANCE,
                description: 'Regulatory compliance and risk management'
            }
        ]
    },
    USERS: {
        id: 'users',
        label: 'Users',
        permission: PERMISSIONS.ACCESS_USERS,
        description: 'User Management',
        adminOnly: true
    },
    MANUFACTURING: {
        id: 'manufacturing',
        label: 'Manufacturing',
        permission: PERMISSIONS.ACCESS_MANUFACTURING,
        description: 'Manufacturing Operations',
        adminOnly: false
    },
    DOCUMENTS: {
        id: 'documents',
        label: 'Documents',
        permission: PERMISSIONS.ACCESS_DOCUMENTS,
        description: 'Shared document library and uploads',
        adminOnly: false
    },
    SERVICE_MAINTENANCE: {
        id: 'service_maintenance',
        label: 'Service & Maintenance',
        permission: PERMISSIONS.ACCESS_SERVICE_MAINTENANCE,
        description: 'Service & Maintenance Operations',
        adminOnly: false
    },
    HELPDESK: {
        id: 'helpdesk',
        label: 'Helpdesk',
        permission: PERMISSIONS.ACCESS_HELPDESK,
        description: 'Helpdesk & Ticketing System',
        adminOnly: false
    },
    LEAVE_PLATFORM: {
        id: 'leave_platform',
        label: 'Leave Platform',
        permission: PERMISSIONS.ACCESS_LEAVE_PLATFORM,
        description: 'Employee leave management workspace',
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
        permissions: ['all'], // All non-admin users get access to everything except Users
        color: 'blue'
    },
    user: {
        name: 'User',
        description: 'Standard user with access to all modules except Users',
        permissions: ['all'], // All non-admin users get access to everything except Users
        color: 'orange'
    },
    guest: {
        name: 'Guest',
        description: 'Limited access - Can access all modules except Users',
        permissions: ['all'], // All non-admin users get access to everything except Users
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
        const userEmail = this.user?.email?.toLowerCase();
        
        // LEAVE PLATFORM RESTRICTION: Only allow garethm@abcotronics.co.za until completion
        if (permission === PERMISSIONS.ACCESS_LEAVE_PLATFORM) {
            if (userEmail === 'garethm@abcotronics.co.za') {
                return true;
            }
            // Deny access for all other users regardless of role or permissions
            return false;
        }
        
        // Admin-only permissions: Users
        const adminOnlyPermissions = [
            PERMISSIONS.ACCESS_USERS,
            PERMISSIONS.MANAGE_USERS,
            PERMISSIONS.MANAGE_ROLES,
            PERMISSIONS.SYSTEM_SETTINGS
        ];
        
        // If permission is admin-only and user is not admin, deny access
        if (adminOnlyPermissions.includes(permission) && !isAdmin) {
            return false;
        }
        
        // CRITICAL: Admins always have all permissions, regardless of custom permissions
        // This ensures admins can always access everything, even if custom permissions are set
        // EXCEPT for leave platform which is restricted to garethm@abcotronics.co.za
        if (isAdmin) {
            return true;
        }
        
        // All users (including non-admins) have access to these modules by default
        // NOTE: ACCESS_LEAVE_PLATFORM is NOT in this list - it's restricted to garethm@abcotronics.co.za only
        const publicPermissions = [
            PERMISSIONS.ACCESS_CRM,
            PERMISSIONS.ACCESS_PROJECTS,
            PERMISSIONS.ACCESS_TEAM,
            PERMISSIONS.TEAM_MANAGEMENT,
            PERMISSIONS.TEAM_TECHNICAL,
            PERMISSIONS.TEAM_SUPPORT,
            PERMISSIONS.TEAM_DATA_ANALYTICS,
            PERMISSIONS.TEAM_FINANCE,
            PERMISSIONS.TEAM_BUSINESS_DEVELOPMENT,
            PERMISSIONS.TEAM_COMMERCIAL,
            PERMISSIONS.TEAM_COMPLIANCE,
            PERMISSIONS.ACCESS_MANUFACTURING,
            PERMISSIONS.ACCESS_DOCUMENTS,
            PERMISSIONS.ACCESS_SERVICE_MAINTENANCE,
            PERMISSIONS.ACCESS_HELPDESK,
            PERMISSIONS.HELPDESK_CREATE,
            PERMISSIONS.HELPDESK_EDIT,
            PERMISSIONS.HELPDESK_ASSIGN,
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
        
        // Check custom permissions (they override role and public permissions for non-admins)
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

    canAccessServiceMaintenance() {
        return this.hasPermission(PERMISSIONS.ACCESS_SERVICE_MAINTENANCE);
    }

    canAccessHelpdesk() {
        return this.hasPermission(PERMISSIONS.ACCESS_HELPDESK);
    }

    canCreateTicket() {
        return this.hasPermission(PERMISSIONS.HELPDESK_CREATE);
    }

    canEditTicket() {
        return this.hasPermission(PERMISSIONS.HELPDESK_EDIT);
    }

    canDeleteTicket() {
        return this.hasPermission(PERMISSIONS.HELPDESK_DELETE);
    }

    canAssignTicket() {
        return this.hasPermission(PERMISSIONS.HELPDESK_ASSIGN);
    }

    canAccessTool() {
        return this.hasPermission(PERMISSIONS.ACCESS_TOOL);
    }

    canAccessReports() {
        return this.hasPermission(PERMISSIONS.ACCESS_REPORTS);
    }

    canAccessLeavePlatform() {
        // Restricted to garethm@abcotronics.co.za only until completion
        return this.hasPermission(PERMISSIONS.ACCESS_LEAVE_PLATFORM);
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
        canAccessCRM: () => checker.canAccessCRM(),
        canAccessProjects: () => checker.canAccessProjects(),
        canAccessTeam: () => checker.canAccessTeam(),
        canAccessManufacturing: () => checker.canAccessManufacturing(),
        canAccessServiceMaintenance: () => checker.canAccessServiceMaintenance(),
        canAccessTool: () => checker.canAccessTool(),
        canAccessReports: () => checker.canAccessReports(),
        canAccessLeavePlatform: () => checker.canAccessLeavePlatform(),
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
