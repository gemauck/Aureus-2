# Android ERP Parity Backlog

This backlog operationalizes the parity plan into epics and implementation stories.

## Planning Assumptions

- Stack: React Native for Android-first delivery.
- Existing backend (`api/`, `server.js`) remains primary API source.
- Team shape: 2-4 RN, 1 backend, 1 QA, fractional design/DevOps.

## Epic A: Mobile Platform Foundation (Phase 0)

## A1 - App shell and navigation baseline
- Build RN app shell with authenticated and unauthenticated navigation stacks.
- Add global error boundary and network-state banner.
- Done when: app starts, login gate works, deep links open mapped screens.

## A2 - API client and shared domain layer
- Create centralized API client with retry/backoff and typed response parsing.
- Add normalized data adapters for clients, projects, tasks.
- Done when: all pilot endpoints use one client path and consistent error handling.

## A3 - Telemetry and release pipeline
- Add crash reporting, API error telemetry, and build distribution pipeline.
- Done when: staging and pilot channels ship reproducible artifacts.

## Epic B: Auth and Session (Phase 0-1)

## B1 - Mobile login and refresh endpoints
- Implement `/api/auth/mobile/login`, `/api/auth/mobile/refresh`, `/api/auth/mobile/logout`.
- Add refresh token rotation and device session records.
- Done when: Android refresh works without web cookies, web auth unchanged.

## B2 - Secure storage and token lifecycle in app
- Store refresh token in secure storage; keep access token in memory.
- Add forced sign-out on refresh revoke/failure.
- Done when: expired access token transparently refreshes with rotation.

## B3 - OAuth mobile callback hardening
- Implement PKCE/deep-link callback flow; remove token-in-query redirect pattern for mobile.
- Done when: Google login can complete safely in mobile flow.

## Epic C: Core Pilot Workflows (Phase 1)

## C1 - Dashboard and navigation entry points
- Build mobile dashboard cards with quick navigation to CRM/projects/tasks.
- Done when: role-based cards and primary navigation are usable on mobile.

## C2 - CRM core (clients, leads, opportunities)
- Implement list/detail/search/filter and status updates.
- Done when: sales users complete daily CRM updates on mobile.

## C3 - Projects and tasks core
- Implement project list/detail plus task CRUD and comments.
- Done when: project managers can update tasks and review project state.

## C4 - Notifications and deep linking
- Add in-app inbox + push token registration and deep-link routing.
- Done when: notification tap opens target record reliably.

## C5 - Attachments (upload/download/view)
- Implement attachment flow with retries for unstable networks.
- Done when: pilot users can attach and retrieve project/client docs.

## Epic D: Ops and Finance Expansion (Phase 2)

## D1 - Manufacturing and job cards
- Add operational status updates and checklist capture.
- Add offline queue and sync reconciliation for field use.
- Done when: core job card lifecycle works with intermittent connectivity.

## D2 - Finance and invoicing workflows
- Implement invoice list/detail and status transitions.
- Done when: finance can execute in-scope mobile status actions.

## D3 - Teams and helpdesk
- Implement meeting notes and helpdesk ticket lifecycle.
- Done when: support and team ops are executable on Android.

## Epic E: Full Parity and Rollout Hardening (Phase 3-4)

## E1 - Reports and leave/HR parity
- Add high-value reports and leave request/approval/balance flows.
- Done when: management and HR daily workflows are available on mobile.

## E2 - Performance, offline, reliability hardening
- Optimize startup/list rendering and sync conflicts.
- Done when: mobile KPIs meet defined SLOs in UAT.

## E3 - Store readiness and production rollout
- Complete security review, policy checks, release checklist, cohort rollout.
- Done when: production Android release is approved and monitored.

## Suggested Sprint Waves

| Sprint Wave | Focus | Expected Output |
|---|---|---|
| 1-2 | A1, A2, B1 | App shell + mobile auth endpoints |
| 3-4 | B2, C1, C2 | Stable auth lifecycle + CRM core |
| 5-6 | C3, C4 | Projects/tasks + notifications |
| 7 | C5 + QA hardening | Attachment reliability + pilot RC |
| 8+ | D and E waves | Progressive parity expansion |

## Definition of Ready (Story Level)

- API contract documented with request/response examples.
- Acceptance criteria and test cases listed.
- UX state handling defined: loading, empty, error, offline.
- Role/permission behavior confirmed.

## Definition of Done (Story Level)

- Unit/integration tests pass.
- QA checklist passed on Android device matrix.
- Telemetry hooks added for key failures.
- Product acceptance completed for in-scope business flow.

