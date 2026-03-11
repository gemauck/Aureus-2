# Recover Mondi File 6 (Document Collection) from Backups

If File 6 (or the whole document collection) for the Mondi project was lost after a failed save, you can restore it from a **Digital Ocean database backup** from before the incident.

## Option 1: Restore from Digital Ocean backup (recommended)

Digital Ocean keeps automatic daily backups. Use a backup from **before** you added subfolders to File 6 (or before the failed save).

### Step 1: Restore the backup to a new cluster

1. Go to [Digital Ocean Databases](https://cloud.digitalocean.com/databases).
2. Open your database cluster (e.g. `dbaas-db-6934625`).
3. Open the **Backups** tab.
4. Pick a backup from **before** the data was lost (e.g. yesterday or the day before).
5. Click **Restore** / **Create database from backup**.
6. Name the new cluster (e.g. `restored-mondi-backup`) and confirm.
7. Wait until the new cluster is ready (a few minutes).

### Step 2: Get the connection string

1. Open the **restored** cluster.
2. Go to **Users & Databases**.
3. Copy the **Connection string** (e.g. `postgresql://doadmin:xxx@restored-db-xxx.db.ondigitalocean.com:25060/defaultdb?sslmode=require`).

### Step 3: Run the restore script

From your project root, with **production** `DATABASE_URL` in `.env` and the backup DB URL:

```bash
# Current production DB is taken from .env (DATABASE_URL)
# Point RESTORE_DATABASE_URL at the restored backup cluster
export RESTORE_DATABASE_URL="postgresql://doadmin:YOUR_PASSWORD@restored-db-xxxxx.db.ondigitalocean.com:25060/defaultdb?sslmode=require"

node scripts/restore-mondi-document-sections.js
```

To match a different project by name:

```bash
RESTORE_DATABASE_URL="postgresql://..." node scripts/restore-mondi-document-sections.js "Mondi FMS"
```

The script will:

- Read document sections (including File 6) for the Mondi project from the **restore** DB.
- Replace the same project’s document sections in the **current** DB (DATABASE_URL) with that data.

After it finishes, reload the Document Collection tab for the Mondi project; File 6 and the rest of the sections should be back.

### Step 4: (Optional) Remove the restored cluster

After confirming the data in production, you can delete the temporary restored cluster in Digital Ocean to avoid extra cost.

---

## Option 2: Restore from browser backup

If you still use the **same browser** where you had the data:

1. Open the Mondi project → **Document Collection** tab.
2. If you see “No sections yet”, click **“Restore from browser backup”**.
3. If a backup exists in that browser, it will restore and then save to the server.

This only works if the backup was saved in that browser before the data was lost (e.g. before the failed save).

---

## Summary

| Source              | When it works |
|---------------------|----------------|
| Digital Ocean backup | You have a backup from before the loss; restore to a new cluster and run the script. |
| Browser backup       | Same browser still has the last saved snapshot (e.g. `documentCollectionSnapshot_<projectId>`). |
