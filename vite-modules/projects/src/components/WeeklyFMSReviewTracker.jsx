/**
 * WeeklyFMSReviewTracker (Vite adapter)
 *
 * The canonical implementation of the Weekly FMS Review tracker lives in:
 *   `src/components/projects/WeeklyFMSReviewTracker.jsx`
 *
 * That file was refactored in the same way as the Monthly Document
 * Collection checker (year‑scoped data, centralized API service,
 * simplified persistence rules, etc.).
 *
 * To avoid code drift and duplicate logic between the legacy bundle and
 * the Vite bundle, this file is now a **thin adapter** that simply
 * re‑uses the main implementation.
 *
 * Pattern:
 * - Import the main tracker file for its side‑effects
 * - That file attaches `WeeklyFMSReviewTracker` to `window`
 * - Read the component from `window` and export it as this module's default
 */

// Side‑effect import: registers `window.WeeklyFMSReviewTracker`
import '../../../../src/components/projects/WeeklyFMSReviewTracker.jsx';

const WeeklyFMSReviewTracker =
    typeof window !== 'undefined' ? window.WeeklyFMSReviewTracker : undefined;

// Export for Vite/ESM consumers
export default WeeklyFMSReviewTracker;

// Keep global in sync for any runtime code that still expects it
if (typeof window !== 'undefined' && WeeklyFMSReviewTracker) {
    window.WeeklyFMSReviewTracker = WeeklyFMSReviewTracker;
}


