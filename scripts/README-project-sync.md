# Project Sync Workflow

This folder contains the helper files for synchronising the Projects table without losing data.

## Files

- `desired-projects.json` – baseline export of the current production projects. Update this file with the records that should exist after deployment. Keep the `id` values you want to preserve; omit `id` to create a brand new project.
- `sync-projects.js` – Prisma script that upserts the contents of `desired-projects.json` into the database. It only inserts/updates; no deletions are performed.

## Usage

1. **Back up production**
   ```sh
   PGPASSWORD='******' pg_dump --host=... --port=25060 --username=doadmin --dbname=defaultdb --format=custom --file=/path/to/backups/abcotronics-prod-<timestamp>.dump
   ```

2. **Review/edit desired data**
   - Open `scripts/desired-projects.json`.
   - Modify or append project objects as needed.
   - Ensure required fields are filled: `name`, `clientName`, `status`, `type`.
   - Optional fields such as `assignedTo`, `startDate`, `dueDate` can be set or left as-is.

3. **Dry run on staging (recommended)**
   ```sh
   DATABASE_URL="postgresql://..." node scripts/sync-projects.js scripts/desired-projects.json
   ```

4. **Run in production**
   ```sh
   DATABASE_URL="postgresql://doadmin:******@dbaas-db-6934625-nov-3-backup-nov-3-backup5-do-user-28031752-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require" \
   node scripts/sync-projects.js
   ```

5. **Verify**
   - Reload `https://abcoafrica.co.za/projects`.
   - Optionally check the API response: `curl -H "Authorization: Bearer <token>" https://abcoafrica.co.za/api/projects`.

## Notes

- The script uses `id` when present to upsert an existing row and preserve downstream relations.
- Projects absent from `desired-projects.json` remain untouched; handle archival manually if required.
- Timestamps in the JSON should be ISO 8601 strings (e.g. `2025-11-11T13:06:40Z`). The script will validate and convert them to `Date` objects.

