# Module Parity Matrix (React Native)

This matrix defines what parity means for Android and how each module is phased.

## Parity Status Legend

- `P1` - required for pilot release.
- `P2` - high-priority parity after pilot.
- `P3` - full parity completion wave.

## ERP Modules

| Domain | Key Web Areas | Android Scope | Phase | Notes |
|---|---|---|---|---|
| Auth and access | Login, session validation, role gating | Login, token refresh, role-based route guards | P1 | Must replace web cookie assumptions with mobile-safe token flow |
| Dashboard | Dashboard widgets and quick actions | Mobile dashboard cards, summary metrics, deep links | P1 | Mobile-first layout and reduced card density |
| CRM clients and leads | Clients list/detail, leads, opportunities, pipeline | List/detail/search/filter, create/update leads and opportunities | P1 | Keep pipeline interaction simple for first release |
| Projects and tasks | Projects list/detail, task management, comments | Project list/detail, task CRUD, comments, mentions | P1 | Heavy domain; split detail tabs by priority |
| Notifications | Notification center and unread states | Push + in-app inbox + deep linking | P1 | Requires FCM/APNs integration for parity expectation |
| Files and documents | Upload/download attachments and docs | Capture/upload/download/share attachments | P1 | Validate large file flows on unstable networks |
| Teams and meetings | Team modules, meeting notes | Notes list/detail/edit, assignment links | P2 | Phase in rich text and advanced templates later |
| Manufacturing and job cards | Manufacturing flows, job cards | Job card execution, status updates, field checklists | P2 | Offline queue required for field conditions |
| Finance and invoicing | Invoices, order-linked finance actions | Invoice list/detail, status transitions, exports | P2 | Start with read+status, then full creation workflow |
| Helpdesk | Ticketing and service support | Ticket list/detail/create/update and assignment | P2 | Reuse notifications and comments primitives |
| Reports | Reports and analytics screens | Top mobile reports, export/share links | P3 | Desktop-grade reports remain web fallback initially |
| Leave and HR | Leave platform requests and approvals | Request, approve, calendar view, balances | P3 | Depends on role and approval workflow parity |
| Admin settings | User/admin setup and global config | Read-only admin views first, selective write tools | P3 | Keep high-risk admin mutation web-only until hardened |

## Cross-Cutting Parity Requirements

| Capability | Requirement | Phase |
|---|---|---|
| Offline behavior | Read cache + queued writes for field modules | P2 |
| Search performance | Indexed local cache for core entities | P1 |
| Realtime or near-realtime updates | Polling or socket strategy with lifecycle-safe refresh | P1 |
| Auditability | Preserve actor and timestamps on all write operations | P1 |
| Security | Secure storage, TLS pinning strategy decision, token rotation | P1 |
| Observability | Crash reporting, API error telemetry, release health dashboard | P1 |

## Definition of Parity

A module reaches parity only when:

1. all critical read/write workflows are available on Android,
2. authorization behavior matches web expectations,
3. API failures and retries are handled gracefully on mobile networks,
4. and UAT confirms business process completion without desktop fallback for in-scope tasks.

