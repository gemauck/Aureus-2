import test from 'node:test'
import assert from 'node:assert/strict'

import {
  handleStockTransferRequests,
  stockTransferRequestRef
} from '../../../../api/_lib/stockTransferRequests.js'

test('stockTransferRequestRef generates unique STR- prefixed refs', () => {
  const a = stockTransferRequestRef()
  const b = stockTransferRequestRef()
  assert.match(a, /^STR-/)
  assert.match(b, /^STR-/)
  assert.notEqual(a, b)
})

test('handleStockTransferRequests returns true after sending a response', async () => {
  let sent = false
  const handled = await handleStockTransferRequests({
    prisma: {
      stockTransferRequest: {
        findMany: async () => []
      }
    },
    req: { method: 'GET', query: {}, user: { role: 'admin' } },
    id: null,
    action: null,
    auditManufacturing: () => {},
    ok: () => {
      sent = true
    },
    created: () => {},
    badRequest: () => {},
    notFound: () => {},
    forbidden: () => {},
    serverError: () => {},
    parseJsonBody: async () => ({})
  })
  assert.equal(handled, true)
  assert.equal(sent, true)
})

test('handleStockTransferRequests returns null for unsupported routes', async () => {
  const handled = await handleStockTransferRequests({
    prisma: {},
    req: { method: 'DELETE' },
    id: null,
    action: null,
    auditManufacturing: () => {},
    ok: () => {},
    created: () => {},
    badRequest: () => {},
    notFound: () => {},
    forbidden: () => {},
    serverError: () => {},
    parseJsonBody: async () => ({})
  })
  assert.equal(handled, null)
})
