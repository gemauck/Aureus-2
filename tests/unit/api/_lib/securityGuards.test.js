import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import {
  assertPublicFieldAccess,
  blockLegacyMigrationEndpoint,
  isAdminOrManageUsers,
  resolveSafeUploadDir
} from '../../../../api/_lib/securityGuards.js'

describe('securityGuards', () => {
  const env = { ...process.env }

  beforeEach(() => {
    process.env.NODE_ENV = 'test'
    delete process.env.ALLOW_LEGACY_MIGRATION_ENDPOINTS
    delete process.env.PUBLIC_FIELD_OPEN
    delete process.env.PUBLIC_FIELD_API_KEY
  })

  afterEach(() => {
    process.env = { ...env }
  })

  it('blocks legacy migration endpoints in production', () => {
    process.env.NODE_ENV = 'production'
    let code = 200
    const res = {
      status: (c) => {
        code = c
        return res
      },
      json: () => res
    }
    expect(blockLegacyMigrationEndpoint(res)).toBe(true)
    expect(code).toBe(404)
  })

  it('allows legacy migration endpoints in development', () => {
    process.env.NODE_ENV = 'development'
    const res = { status: () => res, json: () => res }
    expect(blockLegacyMigrationEndpoint(res)).toBe(false)
  })

  it('isAdminOrManageUsers respects manage_users permission', () => {
    expect(isAdminOrManageUsers({ role: 'user', permissions: ['manage_users'] })).toBe(true)
    expect(isAdminOrManageUsers({ role: 'user', permissions: [] })).toBe(false)
    expect(isAdminOrManageUsers({ role: 'admin' })).toBe(true)
  })

  it('assertPublicFieldAccess allows bearer token in production', () => {
    process.env.NODE_ENV = 'production'
    const req = { headers: { authorization: 'Bearer abc.def.ghi' } }
    const res = { status: () => res, json: () => res }
    expect(assertPublicFieldAccess(req, res)).toBe(true)
  })

  it('assertPublicFieldAccess allows field client marker in production', () => {
    process.env.NODE_ENV = 'production'
    const req = { headers: { 'x-abcotronics-client': 'field-app-v1' } }
    const res = { status: () => res, json: () => res }
    expect(assertPublicFieldAccess(req, res)).toBe(true)
  })

  it('resolveSafeUploadDir strips traversal segments', () => {
    const root = '/app/uploads'
    expect(resolveSafeUploadDir(root, '../etc').safeFolder).toBe('etc')
    expect(resolveSafeUploadDir(root, 'contracts/2026').targetDir).toBe('/app/uploads/contracts/2026')
  })
})
