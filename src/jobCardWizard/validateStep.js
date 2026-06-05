import { STEP_IDS, NO_CLIENT_ID } from './constants.js';

/**
 * @param {number} stepIndex
 * @param {object} formData
 * @param {object} [options]
 * @param {boolean} [options.useNewJobTimeFlow]
 * @param {boolean} [options.arrivalConfirmOpen]
 * @param {boolean} [options.departureConfirmOpen]
 */
export function validateWizardStep(stepIndex, formData, options = {}) {
  if (options.arrivalConfirmOpen || options.departureConfirmOpen) {
    return 'Confirm the date and time to continue.';
  }
  switch (STEP_IDS[stepIndex]) {
    case 'assignment':
      if (!formData.agentName) return 'Select the attending technician to continue.';
      if (!formData.clientId) return 'Select a client or choose "No Client" to continue.';
      return '';
    case 'visit':
      if (
        options.useNewJobTimeFlow &&
        !String(formData.timeOfArrival || '').trim()
      ) {
        return 'Set your arrival on site time (Site Visit step).';
      }
      return '';
    default:
      return '';
  }
}

export { NO_CLIENT_ID };
