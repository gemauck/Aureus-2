# Document Collection – Scheduled Email Cron

The **Request documents via email** feature can send reminders automatically (weekly or monthly) until a cell is marked with a chosen status (e.g. **Collected**). A cron job must call the API so those scheduled sends run.

---

## 1. Environment variable

On the server (e.g. in `.env` or your app env):

```bash
# Optional but recommended – required if you want to secure the cron endpoint
CRON_SECRET=your-random-secret-string
# Or:
DOCUMENT_COLLECTION_CRON_SECRET=your-random-secret-string
```

Generate a long random string (e.g. `openssl rand -hex 32`). The same value is used when calling the endpoint (see below).

---

## 2. Cron endpoint

- **URL:** `https://YOUR_DOMAIN/api/cron/document-collection-scheduled-send`
- **Methods:** GET or POST
- **Auth:** Pass the secret so only your cron can call it.

**Option A – Query parameter**

```text
https://YOUR_DOMAIN/api/cron/document-collection-scheduled-send?secret=YOUR_CRON_SECRET
```

**Option B – Header**

```text
x-cron-secret: YOUR_CRON_SECRET
# or
Authorization: Bearer YOUR_CRON_SECRET
```

If `CRON_SECRET` (or `DOCUMENT_COLLECTION_CRON_SECRET`) is not set, the endpoint does not check a secret (useful for local/testing only).

---

## 3. Server cron (e.g. on the droplet)

Run once per day so weekly/monthly logic is applied correctly.

**Crontab (as the user that can run the app):**

```bash
crontab -e
```

Add (replace with your domain and secret):

```cron
# Document collection scheduled emails – daily at 08:00
0 8 * * * curl -sS -X POST "https://abcoafrica.co.za/api/cron/document-collection-scheduled-send?secret=YOUR_CRON_SECRET"
```

Or with secret in a header:

```cron
0 8 * * * curl -sS -X POST -H "x-cron-secret: YOUR_CRON_SECRET" "https://abcoafrica.co.za/api/cron/document-collection-scheduled-send"
```

**System cron (root) – if app is on same server:**

```cron
0 8 * * * curl -sS -X POST "https://localhost/api/cron/document-collection-scheduled-send?secret=YOUR_CRON_SECRET" -H "Host: abcoafrica.co.za"
```

---

## 4. External cron services

You can use any service that can hit a URL on a schedule.

**cron-job.org**

1. Create account → Create cron job.
2. URL: `https://YOUR_DOMAIN/api/cron/document-collection-scheduled-send?secret=YOUR_CRON_SECRET`
3. Schedule: e.g. Daily at 08:00.
4. Method: POST (or GET).

**GitHub Actions (optional)**

Add a workflow that runs on schedule and calls the same URL with the secret stored as a repo secret.

---

## 5. What the cron does

- Loads all projects with **Document collection** enabled.
- For each project, reads saved document sections (per year/month).
- For each cell that has:
  - **Schedule:** Weekly or Monthly,
  - **Recipients** and **email content** saved,
  - **Current status** not equal to “Stop when status” (e.g. not “Collected”),
- Checks:
  - **Weekly:** last send was more than 7 days ago (or never).
  - **Monthly:** last send was not in the current month (or never).
- Sends the email to saved recipients, then updates `lastSentAt` for that cell.

Response shape: `{ sent: number, errors: [], projectsChecked: number }`.

---

## 6. Quick test

From your machine (replace domain and secret):

```bash
curl -sS -X POST "https://YOUR_DOMAIN/api/cron/document-collection-scheduled-send?secret=YOUR_CRON_SECRET"
```

You should get JSON with `sent` and `errors` (and no 401/403 if the secret matches).
