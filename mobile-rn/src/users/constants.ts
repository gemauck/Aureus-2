import type { UserRole } from './types'

export const PERMISSIONS = {
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
  ACCESS_USERS: 'access_users',
  ACCESS_MANUFACTURING: 'access_manufacturing',
  ACCESS_DOCUMENTS: 'access_documents',
  ACCESS_SERVICE_MAINTENANCE: 'access_service_maintenance',
  ACCESS_HELPDESK: 'access_helpdesk',
  ACCESS_TOOL: 'access_tool',
  ACCESS_REPORTS: 'access_reports',
  ACCESS_LEAVE_PLATFORM: 'access_leave_platform',
  MANAGE_HR_ADMIN: 'manage_hr_admin'
} as const

export type PermissionCategory = {
  id: string
  label: string
  permission: string
  description: string
  adminOnly?: boolean
  subcategories?: Array<{
    id: string
    label: string
    permission: string
    description: string
  }>
}

export const PERMISSION_CATEGORIES: Record<string, PermissionCategory> = {
  CRM: {
    id: 'crm',
    label: 'CRM',
    permission: PERMISSIONS.ACCESS_CRM,
    description: 'Customer Relationship Management'
  },
  PROJECTS: {
    id: 'projects',
    label: 'Projects',
    permission: PERMISSIONS.ACCESS_PROJECTS,
    description: 'Project Management'
  },
  TEAM: {
    id: 'team',
    label: 'Team',
    permission: PERMISSIONS.ACCESS_TEAM,
    description: 'Team Management',
    subcategories: [
      { id: 'team_management', label: 'Management', permission: PERMISSIONS.TEAM_MANAGEMENT, description: 'Executive leadership' },
      { id: 'team_technical', label: 'Technical', permission: PERMISSIONS.TEAM_TECHNICAL, description: 'Technical operations' },
      { id: 'team_support', label: 'Support', permission: PERMISSIONS.TEAM_SUPPORT, description: 'Customer support' },
      { id: 'team_data_analytics', label: 'Data Analytics', permission: PERMISSIONS.TEAM_DATA_ANALYTICS, description: 'Data analysis' },
      { id: 'team_finance', label: 'Finance', permission: PERMISSIONS.TEAM_FINANCE, description: 'Financial management' },
      {
        id: 'team_business_development',
        label: 'Business Development',
        permission: PERMISSIONS.TEAM_BUSINESS_DEVELOPMENT,
        description: 'Growth strategies'
      },
      { id: 'team_commercial', label: 'Commercial', permission: PERMISSIONS.TEAM_COMMERCIAL, description: 'Sales operations' },
      { id: 'team_compliance', label: 'Compliance', permission: PERMISSIONS.TEAM_COMPLIANCE, description: 'Regulatory compliance' }
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
    description: 'Manufacturing Operations'
  },
  DOCUMENTS: {
    id: 'documents',
    label: 'Documents',
    permission: PERMISSIONS.ACCESS_DOCUMENTS,
    description: 'Shared document library'
  },
  SERVICE_MAINTENANCE: {
    id: 'service_maintenance',
    label: 'Service & Maintenance',
    permission: PERMISSIONS.ACCESS_SERVICE_MAINTENANCE,
    description: 'Service & Maintenance Operations'
  },
  HELPDESK: {
    id: 'helpdesk',
    label: 'Helpdesk',
    permission: PERMISSIONS.ACCESS_HELPDESK,
    description: 'Helpdesk & Ticketing'
  },
  LEAVE_PLATFORM: {
    id: 'leave_platform',
    label: 'Leave & HR',
    permission: PERMISSIONS.ACCESS_LEAVE_PLATFORM,
    description: 'Leave, profile, policies and HR workspace'
  },
  HR_ADMIN: {
    id: 'hr_admin',
    label: 'HR administration',
    permission: PERMISSIONS.MANAGE_HR_ADMIN,
    description: 'Employees, approvers, policies and HR documents'
  },
  TOOL: {
    id: 'tool',
    label: 'Tool',
    permission: PERMISSIONS.ACCESS_TOOL,
    description: 'Tool Management'
  },
  REPORTS: {
    id: 'reports',
    label: 'Reports',
    permission: PERMISSIONS.ACCESS_REPORTS,
    description: 'Reports and Analytics'
  }
}

export const ROLE_DEFINITIONS: Record<
  UserRole,
  { name: string; color: string; description: string; permissions: string[] }
> = {
  superadmin: {
    name: 'Super Administrator',
    color: '#ef4444',
    description: 'Full system access including all teams and user management',
    permissions: ['all']
  },
  admin: {
    name: 'Administrator',
    color: '#ef4444',
    description: 'Full system access — manage users and system settings',
    permissions: ['all']
  },
  manager: {
    name: 'Manager',
    color: '#3b82f6',
    description: 'Manage projects, teams, and assigned resources',
    permissions: ['view_all', 'edit_projects', 'edit_clients', 'view_reports', 'manage_team']
  },
  user: {
    name: 'User',
    color: '#f97316',
    description: 'Standard user with assigned task access',
    permissions: ['view_assigned', 'edit_assigned', 'time_tracking']
  },
  guest: {
    name: 'Guest',
    color: '#6b7280',
    description: 'Limited access — view projects, clients, and leads',
    permissions: ['view_projects', 'view_clients', 'edit_clients', 'manage_leads']
  }
}

export const DEPARTMENTS = [
  'Management',
  'Technical',
  'Support',
  'Data Analytics',
  'Finance',
  'HR',
  'Business Development',
  'Commercial',
  'Compliance'
] as const

export const USER_STATUSES = ['Active', 'Inactive'] as const
