# Database connection failed

When the app shows **"Database connection failed"**, the server cannot reach PostgreSQL. Use this checklist.

## 1. Check that `DATABASE_URL` is set

- **Local dev:** In `.env.local` you should have a line like:
  ```bash
  DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
  ```
- No quotes inside the value; if your password has special characters, use single quotes around the whole value or URL-encode the password.

## 2. Use the right URL format

| Environment | Example |
|-------------|---------|
| **DigitalOcean** | `postgresql://doadmin:PASSWORD@db-host.db.ondigitalocean.com:25060/defaultdb?sslmode=require` |
| **Local PostgreSQL** | `postgresql://postgres:password@localhost:5432/your_db` |

- **DigitalOcean / managed Postgres:** The URL must include `?sslmode=require` (or `?ssl=true`). Without it, the connection will fail.
- **Local:** No `sslmode` needed unless your Postgres is configured for SSL.

## 3. Local PostgreSQL only

- Make sure PostgreSQL is running:
  - **macOS (Homebrew):** `brew services list` and start `postgresql` if needed.
  - **Linux:** `sudo systemctl status postgresql` (or `postgresql-14` etc.).
- Port is usually `5432`. Use the same host/port in `DATABASE_URL`.

## 4. DigitalOcean / remote database

- **Trusted sources:** In the DO control panel → Databases → your cluster → Settings → Trusted Sources, add your current IP (or `0.0.0.0/0` only for testing).
- **SSL:** URL must include `?sslmode=require` (see step 2).
- **Credentials:** Use the connection string from DO (User, Password, Host, Port, Database) and ensure no typos or extra spaces.

## 5. Quick test

From the project root:

```bash
# Load .env.local and test Prisma connection
node -e "
require('dotenv').config({ path: '.env.local' });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set in .env.local');
  process.exit(1);
}
const masked = url.replace(/:([^:@]+)@/, ':***@');
console.log('DATABASE_URL set:', !!url);
console.log('Masked URL:', masked.substring(0, 60) + '...');
console.log('Has sslmode (for DO):', url.includes('sslmode='));
"
```

Then run the API DB health check (with the server running):

```bash
curl -s http://localhost:3000/api/db-health | head -20
```

## 6. Run without the database (dev only)

For UI-only work when the DB is down, you can use the no-DB dev mode:

- In `.env.local` set:
  ```bash
  DEV_LOCAL_NO_DB=true
  ```
- Leave `DATABASE_URL` unset or as-is. The server will start and login will use fixed dev credentials (see server startup logs).
- **Do not use this in production.**

## Summary

| Cause | Fix |
|-------|-----|
| `DATABASE_URL` missing or wrong file | Set in `.env.local` (local) or `.env` (server) |
| DigitalOcean without SSL | Add `?sslmode=require` to the URL |
| Local Postgres not running | Start PostgreSQL (e.g. `brew services start postgresql`) |
| Firewall / IP not allowed | Add your IP in DO Trusted Sources or allow port 5432 locally |
| Wrong password or host | Copy connection string again from DO or check local credentials |
