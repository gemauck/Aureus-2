# Test time tracking in local browser

## 1. Start the app (if not already running)

```bash
# From project root
npm run dev:backend
# In another terminal, build JSX so ProjectDetail includes Time tab:
npm run watch:jsx
```

Ensure the app is available at **http://localhost:3000** (or your configured port).

---

## 2. Manual browser test

1. **Open**  
   http://localhost:3000

2. **Log in**  
   Use your normal login so `DatabaseAPI` and auth token are available.

3. **Go to Projects**  
   Use the main nav / sidebar to open the **Projects** section.

4. **Open a project**  
   Click any project row to open its detail (back arrow, project name, tabs).

5. **Open the Time tab**  
   In the project detail tabs you should see **Time** (clock icon). Click it.

6. **Check the Time UI**  
   You should see:
   - Timer: `00:00:00`, “What are you working on?” input, **Start** button
   - “or”
   - Manual: date, Hours, Description, **Add** button
   - Below: “Time entries” and total hours (or “No time logged yet”).

7. **Test manual add**
   - Set **Hours** to `1` or `1.5`
   - Optionally set **Description** to e.g. `Browser test`
   - Click **Add**
   - Expect:
     - New row in “Time entries” with that date, hours, and description
     - “Total” updating
     - No error alert

8. **Test live timer**
   - Enter e.g. `Timer test` in “What are you working on?”
   - Click **Start**
   - Wait a few seconds (e.g. 0:00:05)
   - Click **Stop**
   - Expect:
     - New entry in the list with the described duration and “Timer test”
     - Timer back to `00:00:00`

9. **Test delete**  
   Use the trash icon on one of the test entries and confirm it disappears and the total updates.

---

## 3. Quick API smoke test (optional)

From the project root:

```bash
# Should get 401 without auth – confirms route exists
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/time-entries
# Expect: 401

# Same for POST
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/time-entries \
  -H "Content-Type: application/json" \
  -d '{"date":"2025-01-25","hours":1}'
# Expect: 401
```

If you see **401**, the `/api/time-entries` route is registered and protected by auth.  
If you see **404**, the route is not registered (e.g. server not restarted after adding the route).

---

## 4. If “Add” doesn’t add

- **Hard refresh** the app (e.g. Cmd+Shift+R / Ctrl+Shift+R) so the latest JS runs.
- **Restart** the backend after changing `server.js` so the time-entries routes are loaded.
- **Browser console** (F12 → Console): look for failed `POST /api/time-entries` or “Time entries load failed” and note the error message.
- **Network tab** (F12 → Network): when you click Add, check the `time-entries` request – status should be **201** and the response body should contain the new entry (e.g. under `data`).
