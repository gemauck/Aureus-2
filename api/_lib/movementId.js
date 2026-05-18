/**
 * Unique public StockMovement.movementId allocation (collision-safe).
 */

import { assertValidTransferLocations } from './stockMovementTransfer.js'

export function buildMovementId() {
  const stamp = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `MOV-${stamp}-${rand}`
}

/**
 * Create a StockMovement row with a unique movementId (retries on P2002).
 * Pass payload.movementId only for deterministic ids (e.g. MOV-JC-{jobCardId}-L{n}).
 */
export async function createStockMovementTx(tx, payload) {
  if (String(payload?.type || '').toLowerCase() === 'transfer') {
    assertValidTransferLocations(payload.fromLocation, payload.toLocation)
  }
  const explicitId = payload.movementId
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await tx.stockMovement.create({
        data: {
          ...payload,
          movementId: explicitId || buildMovementId()
        }
      })
    } catch (error) {
      if (error?.code === 'P2002' && !explicitId) continue
      throw error
    }
  }
  throw new Error('Could not allocate a unique movementId')
}
