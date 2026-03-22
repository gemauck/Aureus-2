# Job cards: offline behaviour (current architecture)

## Historical note

An older version of this document described `localStorage` sync flags (`synced`, `_wasEdit`) and `syncPendingJobCards()` inside [`src/components/manufacturing/JobCards.jsx`](src/components/manufacturing/JobCards.jsx). **That implementation is not in the current codebase.** The internal **Job Cards** list is **online-only**: it loads and saves through `GET` / `POST` / `PATCH` on `/api/jobcards` via [`src/utils/databaseAPI.js`](src/utils/databaseAPI.js) and does not persist drafts locally.

## Where offline-friendly behaviour lives today

- **Public technician wizard** at `/job-card`: [`src/components/manufacturing/JobCardFormPublic.jsx`](src/components/manufacturing/JobCardFormPublic.jsx). It caches reference data (clients, users, inventory) in `localStorage`, supports draft / resume flows, and submits with `POST /api/public/jobcards` when online.
- **Internal list** [`JobCards.jsx`](src/components/manufacturing/JobCards.jsx): requires a session; filters and pagination are applied **server-side** on `/api/jobcards`.

## If you need internal offline job cards again

You would need to reintroduce explicit requirements (e.g. queue unsynced creates/edits in `localStorage`, replay on `online` event, conflict handling) and implement them in `JobCards.jsx` or a dedicated sync layer—do not rely on this file’s historical steps; they no longer match the code.

## Related tests / assets

Legacy files such as `test-jobcard-offline-sync.html` or `TEST-JOBCARD-OFFLINE-SYNC.md` (if still present) refer to the old `JobCards.jsx` approach; validate against **JobCardFormPublic** for field/offline behaviour today.
