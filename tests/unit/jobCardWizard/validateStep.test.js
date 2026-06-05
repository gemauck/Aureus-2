import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWizardStep } from '../../../src/jobCardWizard/validateStep.js';
import { NO_CLIENT_ID } from '../../../src/jobCardWizard/constants.js';

test('validateWizardStep assignment requires agent and client', () => {
  assert.equal(
    validateWizardStep(0, { agentName: '', clientId: '' }),
    'Select the attending technician to continue.'
  );
  assert.equal(
    validateWizardStep(0, { agentName: 'Tech', clientId: '' }),
    'Select a client or choose "No Client" to continue.'
  );
  assert.equal(
    validateWizardStep(0, { agentName: 'Tech', clientId: NO_CLIENT_ID }),
    ''
  );
});

test('validateWizardStep visit requires arrival for new time flow', () => {
  assert.equal(
    validateWizardStep(1, { timeOfArrival: '' }, { useNewJobTimeFlow: true }),
    'Set your arrival on site time (Site Visit step).'
  );
  assert.equal(
    validateWizardStep(1, { timeOfArrival: '2026-01-01T10:00' }, { useNewJobTimeFlow: true }),
    ''
  );
});
