import { describe, expect, test } from '@jest/globals';
import {
  flushJobCardWizardEphemeralFields,
  flushPendingMaterialDraft,
  findPendingMaterialDraft,
  lightweightSaveStatus
} from '../../../src/jobCardWizard/wizardDraftFlush.js';

describe('wizardDraftFlush', () => {
  test('flushPendingMaterialDraft adds complete draft line', () => {
    const result = flushPendingMaterialDraft(
      { itemName: 'Tape', description: 'PVC', reason: 'repair', cost: '45' },
      []
    );
    expect(result.flushed).toMatchObject({ itemName: 'Tape', cost: 45 });
    expect(result.materialsBought).toHaveLength(1);
    expect(result.clearDraft).toBe(true);
  });

  test('findPendingMaterialDraft ignores incomplete draft', () => {
    expect(findPendingMaterialDraft({ itemName: 'Tape', cost: '' })).toBeNull();
    expect(findPendingMaterialDraft({ itemName: '', cost: 10 })).toBeNull();
  });

  test('flushJobCardWizardEphemeralFields merges stock and materials', () => {
    const result = flushJobCardWizardEphemeralFields({
      stockEntryRows: [{ id: 'r1', locationId: 'loc1', sku: 'SKU1', quantity: 2 }],
      stockUsed: [],
      stockLocations: [{ id: 'loc1', name: 'Van' }],
      inventory: [{ sku: 'SKU1', name: 'Part' }],
      materialDraft: { itemName: 'Gloves', description: '', reason: '', cost: 12 },
      materialsBought: []
    });
    expect(result.stockUsed).toHaveLength(1);
    expect(result.materialsBought).toHaveLength(1);
    expect(result.materialDraft.itemName).toBe('');
  });

  test('lightweightSaveStatus keeps submitted/completed', () => {
    expect(lightweightSaveStatus('submitted')).toBe('submitted');
    expect(lightweightSaveStatus('completed')).toBe('completed');
    expect(lightweightSaveStatus('draft')).toBe('draft');
    expect(lightweightSaveStatus('')).toBe('draft');
  });
});
