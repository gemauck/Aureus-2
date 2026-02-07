# Projects Section – Comprehensive Checks

## What’s tested

### Backend & persistence (automated)

- **Auth & list** – Login and `GET /api/projects` (list)
- **Best practice validation** – Reject missing name; reject invalid type
- **Response shape defaults** – Module flags present, JSON fields are objects, `tasksList` is an array
- **Create** – `POST /api/projects` (name, type, clientName, status)
- **Get single** – `GET /api/projects/:id`
- **Update (basic)** – `PUT` name/status; refetch and check persistence
- **Module flags** – `hasDocumentCollectionProcess`, `hasMonthlyFMSReviewProcess` persist after refresh
- **Document sections** – Year-based document sections saved and returned correctly
- **Monthly FMS** – Monthly FMS sections saved and returned correctly
- **Tasks & comments** – Create, read, update, and persistence via `/api/tasks` + `/api/task-comments`
- **Project task sync** – Tasks/comments show up in `GET /api/projects/:id`
- **Task lists** – Create, read, update, delete `/api/project-task-lists`
- **Custom fields** – Create, read, update, delete `/api/project-custom-fields`
- **Team members** – Add/update/remove `/api/project-team-members`
- **Documents** – Create, update, soft delete `/api/project-documents`
- **Project comments** – Create, reply, update, delete `/api/project-comments`
- **Activity logs** – Create and query `/api/project-activity-logs`
- **Pagination** – `?page=1&limit=5&includeCount=true`
- **Delete** – `DELETE /api/projects/:id`; `GET` then returns 404
- **Cascade cleanup** – Tasks/comments removed after project delete; activity logs checked (warn if remaining)

### UI checks (manual, browser console)

- **Projects route** – Projects header and New Project button visible
- **Project list** – List or empty state visible
- **Project detail** – Tabs/sections visible when on a project page
- **CRUD in UI** – Create project/task/comment and verify persistence

## How to run

### Option A – Dev auth (no real user needed)
Starts a server on port 3001 with test auth and runs the tests:

```bash
bash scripts/run-projects-test-with-dev-auth.sh
```

### Option B – Against existing server
1. Start the backend (e.g. `npm run dev:backend`).
2. Set a real user that exists in your DB:
   - `TEST_EMAIL` and `TEST_PASSWORD` in `.env.local`, or
   - `TEST_EMAIL=you@example.com TEST_PASSWORD=yourpassword` when running.
3. Run:

```bash
npm run test:projects
```

### UI checks (browser console)

1. Log in to the ERP app.
2. Navigate to the Projects list (`#/projects`).
3. Open the browser console and run:

```bash
// Copy/paste the entire file contents
test-projects-browser.js
```

This script validates UI elements and runs CRUD checks using `window.DatabaseAPI`.

The test loads `.env.local` and `.env` from the project root. Prefer `TEST_URL` over `APP_URL` when targeting a different server (e.g. `TEST_URL=http://localhost:3001`).

## Expected output when auth works

- All tests **PASSED** across validation, CRUD, persistence, and cascade cleanup.
- Summary shows **Failed: 0**, **Success rate: 100%**.

## If login fails (401)

- Set `TEST_EMAIL` and `TEST_PASSWORD` to a valid user in your database, **or**
- Run the server with `DEV_LOCAL_NO_DB=true` and use `admin@example.com` / `password123`.

## File

- **Test script:** `tests/projects-functionality-persistence-tests.js`
- **npm script:** `npm run test:projects`
