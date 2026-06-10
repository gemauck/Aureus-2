import { describe, expect, it } from '@jest/globals'
import { PermissionChecker, PERMISSIONS } from '../../../src/utils/permissions.js'

describe('mobile PermissionChecker parity', () => {
  it('grants admins all module access', () => {
    const checker = new PermissionChecker({ id: '1', email: 'a@x.com', role: 'admin' })
    expect(checker.hasPermission(PERMISSIONS.ACCESS_MANUFACTURING)).toBe(true)
    expect(checker.hasPermission(PERMISSIONS.ACCESS_USERS)).toBe(true)
  })

  it('denies non-admin users module when custom permissions exclude it', () => {
    const checker = new PermissionChecker({
      id: '2',
      email: 'u@x.com',
      role: 'user',
      permissions: [PERMISSIONS.ACCESS_PROJECTS]
    })
    expect(checker.hasPermission(PERMISSIONS.ACCESS_PROJECTS)).toBe(true)
    expect(checker.hasPermission(PERMISSIONS.ACCESS_MANUFACTURING)).toBe(false)
    expect(checker.hasPermission(PERMISSIONS.ACCESS_USERS)).toBe(false)
  })

  it('allows default public modules when no custom permissions are set', () => {
    const checker = new PermissionChecker({ id: '3', email: 'u2@x.com', role: 'user' })
    expect(checker.hasPermission(PERMISSIONS.ACCESS_CRM)).toBe(true)
    expect(checker.hasPermission(PERMISSIONS.ACCESS_MANUFACTURING)).toBe(true)
  })

  it('allows CRM when legacy custom permissions include view_clients but not access_crm', () => {
    const checker = new PermissionChecker({
      id: '4',
      email: 'u3@x.com',
      role: 'user',
      permissions: [PERMISSIONS.VIEW_CLIENTS, PERMISSIONS.EDIT_CLIENTS]
    })
    expect(checker.hasPermission(PERMISSIONS.ACCESS_CRM)).toBe(true)
  })

  it('allows CRM for standard user role legacy grants (view_assigned only)', () => {
    const checker = new PermissionChecker({
      id: '5',
      email: 'heidi@example.com',
      role: 'user',
      permissions: [PERMISSIONS.VIEW_ASSIGNED, PERMISSIONS.EDIT_ASSIGNED, PERMISSIONS.TIME_TRACKING]
    })
    expect(checker.hasPermission(PERMISSIONS.ACCESS_CRM)).toBe(true)
    expect(checker.hasPermission(PERMISSIONS.ACCESS_PROJECTS)).toBe(true)
  })

  it('still restricts modules when explicit access_* keys are set', () => {
    const checker = new PermissionChecker({
      id: '6',
      email: 'u4@x.com',
      role: 'user',
      permissions: [PERMISSIONS.ACCESS_PROJECTS]
    })
    expect(checker.hasPermission(PERMISSIONS.ACCESS_PROJECTS)).toBe(true)
    expect(checker.hasPermission(PERMISSIONS.ACCESS_CRM)).toBe(false)
  })
})
