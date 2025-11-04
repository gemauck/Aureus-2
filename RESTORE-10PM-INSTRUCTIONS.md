# Restore Database to 10 PM - Step by Step Guide

## Target Restore Time
**Today (November 3, 2025) at 10:00 PM**
- UTC: `2025-11-03T22:00:00Z`
- SAST: `2025-11-03T22:00:00+02:00`

## Quick Steps (5 minutes)

### Step 1: Access DigitalOcean Database Console
1. Open: https://cloud.digitalocean.com/databases
2. Click on your PostgreSQL database cluster (the one currently in use)

### Step 2: Initiate Point-in-Time Recovery
1. Click the **"Backups"** tab
2. Click **"Restore"** or **"Point-in-Time Recovery"** button
3. Select **"Point-in-Time Recovery"** option
4. Enter the restore time:
   - **Date**: `2025-11-03`
   - **Time**: `22:00:00` (10:00 PM)
   - **Timezone**: UTC (or your local timezone)
5. Enter a name for the restored database: `restored-10pm-nov3`
6. Click **"Restore"**

### Step 3: Wait for Restoration
- Restoration takes **5-15 minutes**
- You'll see a new database cluster appear in your databases list
- Status will show "Creating" → "Online"

### Step 4: Get New Connection Details
1. Click on the **new restored database cluster**
2. Go to **"Users & Databases"** tab
3. Copy the **Connection String** (looks like):
   ```
   postgresql://doadmin:xxxx@db-postgresql-xxxxx.db.ondigitalocean.com:25060/defaultdb?sslmode=require
   ```
4. Note the **Host**, **Port**, **User**, **Password**, and **Database** name

### Step 5: Update Production Server
1. Edit `update-restored-database.sh`
2. Update these variables with the NEW database connection details:
   ```bash
   DB_USER="doadmin"
   DB_PASSWORD="YOUR_NEW_PASSWORD"
   DB_HOST="new-restored-db-host.db.ondigitalocean.com"
   DB_PORT="25060"
   DB_NAME="defaultdb"
   ```
3. Run the update script:
   ```bash
   ./update-restored-database.sh
   ```

### Step 6: Verify Restoration
1. Check your app: https://abcoafrica.co.za
2. Verify clients and leads are restored
3. Check record counts match expected data

## Alternative: Restore Yesterday at 10 PM

If you need **November 2, 2025 at 10 PM**:
- **Date**: `2025-11-02`
- **Time**: `22:00:00`
- Name: `restored-10pm-nov2`

## Important Notes

⚠️ **The restored database is a NEW cluster** - your current database is NOT affected
⚠️ **You'll need to update DATABASE_URL** to point to the restored cluster
⚠️ **Old database cluster can be deleted** after verifying the restore works
⚠️ **Restoration is irreversible** - make sure this is the correct time

## Troubleshooting

### Can't find Point-in-Time Recovery option?
- Make sure you're on a PostgreSQL database (not MySQL)
- Check that your plan supports PITR (Basic plan supports 7 days)
- Try the "Backups" tab instead

### Restoration taking too long?
- Large databases take longer (up to 30 minutes)
- Check the status in the DigitalOcean console
- Don't close the browser tab

### Wrong time restored?
- You can create another restore with a different time
- Each restore creates a new cluster (costs apply)

## After Successful Restoration

1. ✅ Verify data is correct
2. ✅ Update production connection
3. ✅ Test the application
4. ✅ Delete old database cluster (if no longer needed) to avoid costs

---

**Estimated Time**: 10-20 minutes total
**Cost**: New database cluster charges apply (same as your current plan)

