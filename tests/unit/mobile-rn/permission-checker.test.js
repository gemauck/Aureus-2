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
})
