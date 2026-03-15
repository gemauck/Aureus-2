/**
 * SAST (South African Standard Time) date formatting for backend.
 * Use these helpers so emails, notifications, and API date strings show in SAST.
 */

export const SAST_TIMEZONE = 'Africa/Johannesburg';
export const SAST_LOCALE = 'en-ZA';

const defaultDateOptions = { timeZone: SAST_TIMEZONE };
const defaultDateTimeOptions = { timeZone: SAST_TIMEZONE, hour: '2-digit', minute: '2-digit' };

/**
 * Format a date in SAST for display (date only).
 * @param {Date|string|number} date
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
export function formatDateInSAST(date, options = {}) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return String(date);
  return d.toLocaleDateString(SAST_LOCALE, { ...defaultDateOptions, ...options });
}

/**
 * Format a date and time in SAST for display.
 * @param {Date|string|number} date
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
export function formatInSAST(date, options = {}) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return String(date);
  return d.toLocaleString(SAST_LOCALE, { ...defaultDateTimeOptions, ...options });
}

/**
 * Long date format (e.g. "15 March 2026") in SAST.
 * @param {Date|string|number} date
 * @returns {string}
 */
export function formatLongDateInSAST(date) {
  return formatDateInSAST(date, { year: 'numeric', month: 'long', day: 'numeric' });
}
