# Projects Section – Functionality & Persistence Tests

## What’s tested

- **Auth & list** – Login and `GET /api/projects` (list)
- **Create** – `POST /api/projects` (name, type, clientName, status)
- **Get single** – `GET /api/projects/:id`
- **Update (basic)** – `PUT` name/status; refetch and check persistence
- **Module flags** – `hasDocumentCollectionProcess`, `hasMonthlyFMSReviewProcess` persist after refresh
- **Document sections** – Year-based document sections saved and returned correctly
- **Monthly FMS** – Monthly FMS sections saved and returned correctly
- **Pagination** – `?page=1&limit=5&includeCount=true`
- **Delete** – `DELETE /api/projects/:id`; `GET` then returns 404

## How to run

**Option A – Dev auth (no real user needed)**  
Starts a server on port 3001 with test auth and runs the tests:

```bash
bash scripts/run-projects-test-with-dev-auth.sh
```

**Option B – Against existing server**  
1. Start the backend (e.g. `npm run dev:backend`).
2. Set a real user that exists in your DB:
   - `TEST_EMAIL` and `TEST_PASSWORD` in `.env.local`, or
   - `TEST_EMAIL=you@example.com TEST_PASSWORD=yourpassword` when running.
3. Run:

```bash
npm run test:projects
```

The test loads `.env.local` and `.env` from the project root. Prefer `TEST_URL` over `APP_URL` when targeting a different server (e.g. `TEST_URL=http://localhost:3001`).

## Expected output when auth works

- All tests **PASSED** (list, create, get, update basic, module flags, document sections, monthly FMS, pagination, delete).
- Summary shows **Passed: 9**, **Failed: 0**, **Success rate: 100%**.

## If login fails (401)

- Set `TEST_EMAIL` and `TEST_PASSWORD` to a valid user in your database, **or**
- Run the server with `DEV_LOCAL_NO_DB=true` and use `admin@example.com` / `password123`.

## File

- **Test script:** `tests/projects-functionality-persistence-tests.js`
- **npm script:** `npm run test:projects`
