import { describe, test, expect } from '@jest/globals';
import { assertValidTransferLocations } from '../../../../api/_lib/stockMovementTransfer.js';

describe('assertValidTransferLocations', () => {
  test('rejects same from and to', () => {
    expect(() => assertValidTransferLocations('loc-a', 'loc-a')).toThrow(/must be different/);
  });

  test('accepts distinct ids', () => {
    expect(() => assertValidTransferLocations('loc-a', 'loc-b')).not.toThrow();
  });
});
