// Server-side permission checking middleware
// Aligns with the frontend permission system in src/utils/permissions.js
import { forbidden } from './response.js'

// Permission constants matching frontend
const PERMISSIONS = {
    ACCESS_CRM: 'access_crm',
    ACCESS_PROJECTS: 'access_projects',
    ACCESS_TEAM: 'access_team',
    ACCESS_USERS: 'access_users', // Admin only
    ACCESS_MANUFACTURING: 'access_manufacturing',
    ACCESS_TOOL: 'access_tool',
    ACCESS_REPORTS: 'access_reports',
}

// Check if user has permission
function hasPermission(user, permission) {
    if (!user || !user.role) return false
    
    const isAdmin = user.role?.toLowerCase() === 'admin'
    
    // Admin-only permissions: Users
    const adminOnlyPermissions = [
        PERMISSIONS.ACCESS_USERS,
    ]
    
    // If permission is admin-only and user is not admin, deny access
    if (adminOnlyPermissions.includes(permission) && !isAdmin) {
        return false
    }
    
    // All users (including non-admins) have access to these modules by default
    const publicPermissions = [
        PERMISSIONS.ACCESS_CRM,
        PERMISSIONS.ACCESS_PROJECTS,
        PERMISSIONS.ACCESS_TEAM,
        PERMISSIONS.ACCESS_MANUFACTURING,
        PERMISSIONS.ACCESS_TOOL,
        PERMISSIONS.ACCESS_REPORTS,
    ]
    
    // If permission is public, grant access
    if (publicPermissions.includes(permission)) {
        return true
    }
    
    // Admin has all permissions
    if (isAdmin) {
        return true
    }
    
    // Check custom permissions if they exist
    if (user.permissions) {
        let customPermissions = []
        try {
            if (typeof user.permissions === 'string') {
                customPermissions = JSON.parse(user.permissions)
            } else if (Array.isArray(user.permissions)) {
                customPermissions = user.permissions
            }
        } catch (e) {
            // Invalid permissions format
        }
        
        if (customPermissions.includes('all') || customPermissions.includes(permission)) {
            return true
        }
    }
    
    return false
}

// Middleware to require a specific permission
export function requirePermission(permission) {
    return function(handler) {
        return async function(req, res) {
            if (!hasPermission(req.user, permission)) {
                return forbidden(res, `Permission required: ${permission}`)
            }
            return handler(req, res)
        }
    }
}

// Middleware to require any of the specified permissions
export function requireAnyPermission(permissions) {
    return function(handler) {
        return async function(req, res) {
            const hasAny = permissions.some(permission => hasPermission(req.user, permission))
            if (!hasAny) {
                return forbidden(res, `One of these permissions required: ${permissions.join(', ')}`)
            }
            return handler(req, res)
        }
    }
}

// Middleware to require all of the specified permissions
export function requireAllPermissions(permissions) {
    return function(handler) {
        return async function(req, res) {
            const hasAll = permissions.every(permission => hasPermission(req.user, permission))
            if (!hasAll) {
                return forbidden(res, `All of these permissions required: ${permissions.join(', ')}`)
            }
            return handler(req, res)
        }
    }
}

// Helper function to check if user can access Users module
export function canAccessUsers(user) {
    return hasPermission(user, PERMISSIONS.ACCESS_USERS)
}

// Export permission constants for use in API endpoints
export { PERMISSIONS }

