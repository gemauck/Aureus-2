# Weekly FMS PUT verification

Use this after applying the “Weekly FMS JSON-only” fix to confirm PUT no longer returns 500.

## 1. Restart the backend

So the updated `api/projects.js` and `api/projects/[id].js` are loaded:

**If you use `npm run dev:backend` or `npm start`:**

1. In the terminal where the server is running, press **Ctrl+C** to stop it.
2. Start again:
   - Backend only: `npm run dev:backend`
   - Full dev (frontend + backend + watch): `npm run dev`

**If you use `npm run dev`:**

1. Stop the whole dev process with **Ctrl+C**.
2. Run `npm run dev` again.

**macOS/Linux:** same steps. **Windows:** use `Ctrl+C` in the terminal to stop, then rerun the same command.

## 2. Run the verification script

With the backend running and a real project ID (e.g. from the app URL or from a GET /api/projects response):

```bash
PROJECT_ID=<your-project-id> node tests/test-weekly-fms-put.js
```

Example:

```bash
PROJECT_ID=cmkuthaua001d11or2zbn2etq node tests/test-weekly-fms-put.js
```

Or via npm (still need to pass `PROJECT_ID`):

```bash
PROJECT_ID=cmkuthaua001d11or2zbn2etq npm run test:weekly-fms-put
```

- **200:** script prints “Weekly FMS PUT returned 200 – fix is active.” and exits 0.
- **401/403:** backend requires auth. To test as a logged-in user, pass a JWT:
  ```bash
  PROJECT_ID=... AUTH_TOKEN=<your-jwt> node tests/test-weekly-fms-put.js
  ```
- **500:** fix not in effect. Restart the backend and ensure you’re running from this repo (no old API code).

## 3. Quick manual check in the app

1. Open a project that has Weekly FMS.
2. Add or edit a comment in a weekly section and save.
3. Confirm you don’t see a 500 and the comment is still there after a refresh.
