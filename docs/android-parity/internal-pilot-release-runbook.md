# Internal Pilot Release Runbook

This runbook defines how to ship and operate the Android internal pilot.

## 1) Pre-Release Gate

1. Confirm checklist in `docs/android-parity/pilot-hardening-checklist.md`.
2. Validate backend endpoints:
   - `POST /api/auth/mobile/login`
   - `POST /api/auth/mobile/refresh`
   - `POST /api/auth/mobile/logout`
3. Confirm mobile environment:
   - `mobile-rn/.env` has correct `EXPO_PUBLIC_API_BASE_URL`.

## 2) Build and Distribute

1. Install dependencies:
   - `npm run mobile:install`
2. Build internal Android artifact:
   - `cd mobile-rn && npx eas build --platform android --profile pilot`
3. Distribute APK link to pilot user group.

## 3) Pilot Monitoring

- Track authentication failures and refresh failures daily.
- Track crash reports and API failures by endpoint.
- Hold a 15-minute daily pilot triage for blockers.

## 4) Rollback Plan

- If critical auth regression occurs:
  - disable pilot users via distribution channel,
  - keep web app as fallback for pilot cohort,
  - redeploy previous known-good backend.

## 5) Pilot Exit Decision

Pilot can proceed to wider rollout when:

- no critical defects remain open,
- core journeys complete without web fallback,
- and telemetry remains stable for at least 5 business days.

