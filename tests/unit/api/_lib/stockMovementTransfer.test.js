import test from 'node:test'
import assert from 'node:assert/strict'

import { assertValidTransferLocations } from '../../../../api/_lib/stockMovementTransfer.js'

test('assertValidTransferLocations rejects same from and to', () => {
  assert.throws(
    () => assertValidTransferLocations('loc-a', 'loc-a'),
    /must be different/
  )
})

test('assertValidTransferLocations accepts distinct ids', () => {
  assert.doesNotThrow(() => assertValidTransferLocations('loc-a', 'loc-b'))
})
