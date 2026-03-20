# Phase 1 Pilot Delivery (Core Workflows)

This is the execution plan for building and shipping the Android pilot.

## Pilot Scope

- Authentication and session handling.
- Dashboard home with core summaries.
- CRM:
  - clients list/detail,
  - leads/opportunities list/detail/update.
- Projects:
  - project list/detail,
  - tasks list/detail/create/update.
- Notifications:
  - in-app inbox,
  - push deep-link into key records.
- Document attachments:
  - upload/download/view for in-scope modules.

## Technical Track

## 1) App Foundation

- React Native app shell with:
  - navigation structure,
  - API client + auth interceptors,
  - error boundaries and offline banners.
- Shared domain models generated from API contracts where feasible.
- Feature flags for staged enablement.

## 2) Backend Enablement

- Deliver mobile auth endpoints and token rotation.
- Standardize pagination on pilot-critical list endpoints.
- Add device push token registration endpoint.
- Add API contract tests for pilot endpoints.

## 3) QA and Release

- Device matrix:
  - Android 10, 12, 14.
- Test layers:
  - API integration tests,
  - RN screen tests,
  - smoke E2E flows.
- Beta distribution:
  - Firebase App Distribution for pilot users.

## Milestones (8-14 Weeks)

- Week 1-2: architecture baseline and auth integration.
- Week 3-5: CRM and projects core flows.
- Week 6-7: notifications + attachments + performance pass.
- Week 8: UAT, bug-fix sprint, pilot release candidate.
- Buffer weeks (up to 14): hardening and change requests.

## Pilot Exit Criteria

- 95 percent+ success rate on core user journeys in telemetry.
- No P0/P1 defects open for pilot workflows.
- Authentication refresh failures under agreed SLO threshold.
- Pilot users can complete in-scope daily workflows without web fallback.

## Delivery Checklist

- [ ] Mobile auth endpoints live in staging and production.
- [ ] Core module parity implemented for pilot scope.
- [ ] Push notification delivery validated end-to-end.
- [ ] Crash and API error monitoring dashboard live.
- [ ] Pilot release notes and support runbook prepared.

