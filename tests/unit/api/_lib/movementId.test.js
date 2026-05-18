import { describe, expect, it } from '@jest/globals'
import { buildMovementId } from '../../../../api/_lib/movementId.js'

describe('buildMovementId', () => {
  it('returns MOV- prefixed unique ids', () => {
    const ids = new Set()
    for (let i = 0; i < 200; i++) {
      const id = buildMovementId()
      expect(id).toMatch(/^MOV-[A-Z0-9]+-[A-Z0-9]+$/)
      ids.add(id)
    }
    expect(ids.size).toBe(200)
  })
})
