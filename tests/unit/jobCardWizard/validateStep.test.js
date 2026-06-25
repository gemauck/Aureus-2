import { describe, test, expect } from '@jest/globals';
import { validateWizardStep } from '../../../src/jobCardWizard/validateStep.js';
import { NO_CLIENT_ID } from '../../../src/jobCardWizard/constants.js';

describe('validateWizardStep', () => {
  test('assignment requires agent and client', () => {
    expect(validateWizardStep(0, { agentName: '', clientId: '' })).toBe(
      'Select the attending technician to continue.'
    );
    expect(validateWizardStep(0, { agentName: 'Tech', clientId: '' })).toBe(
      'Select a client or choose "No Client" to continue.'
    );
    expect(validateWizardStep(0, { agentName: 'Tech', clientId: NO_CLIENT_ID })).toBe('');
  });

  test('visit requires arrival for new time flow', () => {
    expect(
      validateWizardStep(1, { timeOfArrival: '' }, { useNewJobTimeFlow: true })
    ).toBe('Set your arrival on site time (Site Visit step).');
    expect(
      validateWizardStep(1, { timeOfArrival: '2026-01-01T10:00' }, { useNewJobTimeFlow: true })
    ).toBe('');
  });
});
