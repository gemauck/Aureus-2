import { describe, test, expect } from '@jest/globals';
import {
  handleStockTransferRequests,
  stockTransferRequestRef
} from '../../../../api/_lib/stockTransferRequests.js';

describe('stockTransferRequestRef', () => {
  test('generates unique STR- prefixed refs', () => {
    const a = stockTransferRequestRef();
    const b = stockTransferRequestRef();
    expect(a).toMatch(/^STR-/);
    expect(b).toMatch(/^STR-/);
    expect(a).not.toBe(b);
  });
});

describe('handleStockTransferRequests', () => {
  test('returns true after sending a response', async () => {
    let sent = false;
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
        sent = true;
      },
      created: () => {},
      badRequest: () => {},
      notFound: () => {},
      forbidden: () => {},
      serverError: () => {},
      parseJsonBody: async () => ({})
    });
    expect(handled).toBe(true);
    expect(sent).toBe(true);
  });

  test('returns null for unsupported routes', async () => {
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
    });
    expect(handled).toBe(null);
  });
});
