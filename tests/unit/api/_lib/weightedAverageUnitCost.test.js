import {
  computeWeightedAverageUnitCost,
  roundUnitCost
} from '../../../../api/_lib/weightedAverageUnitCost.js'

describe('weightedAverageUnitCost', () => {
  test('roundUnitCost rounds to 4 decimal places', () => {
    expect(roundUnitCost(10.123456)).toBe(10.1235)
  })

  test('first receipt (zero on-hand) uses inbound price', () => {
    expect(computeWeightedAverageUnitCost(0, 0, 10, 100)).toBe(100)
  })

  test('second receipt blends weighted average', () => {
    // 10 @ 100 + 5 @ 130 => (1000 + 650) / 15 = 110
    expect(computeWeightedAverageUnitCost(10, 100, 5, 130)).toBe(110)
  })

  test('zero inbound qty keeps old cost', () => {
    expect(computeWeightedAverageUnitCost(10, 100, 0, 130)).toBe(100)
  })

  test('zero inbound price keeps old cost', () => {
    expect(computeWeightedAverageUnitCost(10, 100, 5, 0)).toBe(100)
  })

  test('negative inbound qty keeps old cost', () => {
    expect(computeWeightedAverageUnitCost(10, 100, -3, 50)).toBe(100)
  })
})
