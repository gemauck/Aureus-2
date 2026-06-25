import { describe, test, expect } from '@jest/globals';
import {
  jobCardDuplicateFingerprint,
  pickKeeperJobCard
} from '../../../../api/_lib/jobCardIdempotency.js';

describe('jobCardIdempotency', () => {
  test('groups cards with same heading/client/site/agent/second', () => {
    const t = new Date('2025-05-20T10:08:40.000Z');
    const a = {
      clientId: 'c1',
      clientName: 'Afarak',
      siteName: 'Vlakpoort',
      agentName: 'Nathan De Meyer',
      otherComments: 'Heading: Afarak Vlakpoort Site Visit',
      createdAt: t
    };
    const b = { ...a, createdAt: new Date(t.getTime() + 500) };
    expect(jobCardDuplicateFingerprint(a)).toBe(jobCardDuplicateFingerprint(b));
  });

  test('pickKeeperJobCard prefers submitted over draft', () => {
    const keeper = pickKeeperJobCard([
      { status: 'draft', jobCardNumber: 'JC0036' },
      { status: 'submitted', jobCardNumber: 'JC0040' },
      { status: 'draft', jobCardNumber: 'JC0039' }
    ]);
    expect(keeper.jobCardNumber).toBe('JC0040');
  });
});
