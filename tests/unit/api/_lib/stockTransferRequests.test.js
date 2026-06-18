import test from 'node:test'
import assert from 'node:assert/strict'

import { stockTransferRequestRef } from '../../../../api/_lib/stockTransferRequests.js'

test('stockTransferRequestRef generates unique STR- prefixed refs', () => {
  const a = stockTransferRequestRef()
  const b = stockTransferRequestRef()
  assert.match(a, /^STR-/)
  assert.match(b, /^STR-/)
  assert.notEqual(a, b)
})
