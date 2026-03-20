# API and Mobile Gap List

This document captures backend work required for Android parity.

## Current Constraints (from existing architecture)

- API routing is dynamic through `server.js` + `api/` handlers.
- Auth relies heavily on browser cookie flow and web-origin assumptions.
- OAuth callback behavior currently redirects to web URL query parameters.
- CORS policies are browser-centric and need explicit mobile policy support.

## Required Gaps to Close

## 1) Authentication and Session

- Add explicit mobile token contract:
  - `POST /api/auth/mobile/login`
  - `POST /api/auth/mobile/refresh`
  - `POST /api/auth/mobile/logout`
- Refresh token rotation for mobile device sessions.
- Device-scoped session records (device id, platform, last seen, revoke flag).
- Support both web-cookie and mobile-bearer flows without regression.

## 2) OAuth for Mobile

- Replace web redirect query-token pattern with mobile-safe callback strategy:
  - PKCE where provider allows it.
  - Deep-link callback scheme (`abcotronics://auth/callback`).
- Return one-time authorization code to app instead of long-lived token in URL.

## 3) API Contract Consistency

- Standardize response envelopes for mobile parsing:
  - success shape: `{ ok: true, data, meta? }`
  - error shape: `{ ok: false, code, message, details? }`
- Enforce pagination contract on list endpoints:
  - `cursor`, `limit`, `hasMore`.
- Add idempotency keys on critical POST endpoints where retries are likely.

## 4) File and Media Handling

- Confirm multipart upload contract on all attachment endpoints.
- Add resumable upload strategy for large files in poor connectivity.
- Provide pre-signed upload URLs where appropriate to reduce API server load.

## 5) Notifications and Sync

- Add push token registration endpoint:
  - `POST /api/devices/push-token`
- Add lightweight delta endpoints for sync:
  - `GET /api/<resource>?updatedAfter=<timestamp>`
- Ensure background polling endpoints do not trigger expensive full payloads.

## 6) Security and Governance

- Add device/session revocation endpoints for compromised devices.
- Include rate limiting and abuse controls tuned for mobile burst behavior.
- Ensure sensitive endpoints do not rely on browser-only CSRF assumptions.

## Proposed Work Order

1. Auth/session endpoints and dual-flow compatibility.
2. OAuth mobile callback changes.
3. Pagination and error contract normalization.
4. Push token + delta sync endpoints.
5. File upload hardening and resumable support.

## Acceptance Criteria

- Mobile app can authenticate and refresh tokens without cookies.
- Existing web authentication continues to work unchanged.
- Top 10 high-volume list endpoints support consistent pagination.
- Push notifications can target authenticated users by device token.
- Core file upload flows succeed on unstable networks with retry support.

