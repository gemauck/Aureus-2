# Database Setup Guide for Digital Ocean App Platform

## Why You Need a Managed Database

Your current setup uses **SQLite** (`file:./prisma/dev.db`), which is **NOT suitable for production** on App Platform because:

❌ **Data Loss**: The filesystem is ephemeral - your database gets wiped on redeploy  
❌ **No Persistence**: Any data you save will be lost  
❌ **Single Instance**: SQLite doesn't work well with multiple app instances  
❌ **No Backups**: You have no automatic backups or point-in-time recovery  

## Solution: Use Digital Ocean Managed Database

Digital Ocean offers managed **PostgreSQL** databases that are:
✅ **Persistent**: Data survives redeploys and restarts  
✅ **Backed Up**: Automatic daily backups  
✅ **Scalable**: Can handle growth  
✅ **Production-Ready**: Used by thousands of apps  

---

## Setup Steps

### Step 1: Create a Managed Database

1. Go to: https://cloud.digitalocean.com/databases
2. Click **"Create Database Cluster"**
3. Choose **PostgreSQL** (recommended)
4. Select your plan (Basic $15/mo is fine to start)
5. Choose the same region as your app
6. Click **"Create Database Cluster"**

**Wait 2-3 minutes** for the database to be created.

---

### Step 2: Connect Database to Your App

1. Once created, go to your database cluster
2. Click **"Users & Databases"** tab
3. Note the **Connection String** (looks like: `postgresql://doadmin:xxxx@db-postgresql-xxx.db.ondigitalocean.com:25060/defaultdb?sslmode=require`)

### Option A: Automatic Connection (Easiest)
1. In your database page, click **"Restricted to specific applications"**
2. Select your **Aureus ERP** app
3. This automatically sets the `DATABASE_URL` environment variable in your app

### Option B: Manual Connection
1. Copy the connection string
2. Go to your app: https://cloud.digitalocean.com/apps
3. Settings → **App-Level Environment Variables**
4. Add or update:
   ```
   DATABASE_URL=postgresql://doadmin:xxxx@db-postgresql-xxx.db.ondigitalocean.com:25060/defaultdb?sslmode=require
   ```

---

### Step 3: Update Your Schema to Use PostgreSQL

1. **Update `prisma/schema.prisma`**:
   ```prisma
   datasource db {
     provider = "postgresql"  // Change from "sqlite"
     url      = env("DATABASE_URL")
   }
   ```

2. **Commit and push**:
   ```bash
   git add prisma/schema.prisma
   git commit -m "Switch to PostgreSQL for production"
   git push origin main
   ```

3. **Generate Prisma Client**:
   ```bash
   npx prisma generate
   ```

4. **Run migration on production**:
   - Digital Ocean will auto-run migrations during deploy
   - Or manually connect and run: `npx prisma migrate deploy`

---

### Step 4: Deploy

Once you push the changes, Digital Ocean will:
1. Pull your latest code
2. Build the app
3. Run `npx prisma generate`
4. The app will connect to your PostgreSQL database fine

---

## Expected Behavior

### Before (SQLite):
```bash
DATABASE_URL="file:./prisma/dev.db"  # ❌ Loses data
```

### After (PostgreSQL):
```bash
DATABASE_URL="postgresql://doadmin:xxxx@..."  # ✅ Persistent
```

---

## Cost

- **Basic PostgreSQL**: ~$15/month
- **Professional**: ~$60/month (better performance)
- Start with Basic, upgrade later if needed

---

## What Happens During First Deploy

1. App connects to PostgreSQL (no tables yet)
2. Prisma generates the client
3. Prisma creates all tables based on your schema
4. App is ready to use!

**Note**: You'll need to re-create users and data in PostgreSQL (migrate from local SQLite if needed).

---

## Migrating Existing Data

If you have important data in your local SQLite:

1. **Export from SQLite**:
   ```bash
   sqlite3 prisma/dev.db .dump > backup.sql
   ```

2. **Convert for PostgreSQL** (may need manual editing)

3. **Import to PostgreSQL**:
   ```bash
   psql $DATABASE_URL < backup.sql
   ```

Or recreate your data manually through the app interface.

---

## Environment Variables Summary

After setting up PostgreSQL, your environment variables should look like:

```bash
# Database (Managed PostgreSQL)
DATABASE_URL=postgresql://doadmin:xxxx@db-xxx.ondigitalocean.com:25060/defaultdb?sslmode=require

# JWT
JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8
JWT_EXPIRY=24h

# Session
SESSION_DURATION=86400000
SESSION_DURATION_REMEMBER=2592000000
MAX_LOGIN_ATTEMPTS=5
ACCOUNT_LOCKOUT_DURATION=1800000
PASSWORD_HISTORY_COUNT=5

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=gemauck@gmail.com
SMTP_PASS=psrbq panic: runtime error: open /Users/gemau/Documents/Project ERP/abcotronics-erp-modular/prisma/dev.db: no such file or directory
(grapheme:last /Users/gemau/Documents/Project ERP/abcotronics-erp-modular/prisma/dev.db: no such file or directory)
(grapheme:last /Users/gemau/Documents/abcotronics-erp-modular/prisma/dev.db: no such file or directory)
(grapheme:last ./prisma/dev.db: no such file or directory)
(grapheme:last ./prisma/dev.db: no such file or directory)
(qbzi fyoo osfx
EMAIL_FROM=gemauck@gmail.com
SMTP_FROM_EMAIL=noreply@abcotronics.com
SMTP_FROM_NAME=Abcotronics Security

# App
NODE_ENV=production
PORT=3000
APP_URL=https://your-app.digitalocean.app
```

---

## Quick Checklist

- [ ] Create PostgreSQL database in Digital Ocean
- [ ] Connect database to your app
- [ ] Update `prisma/schema.prisma` provider to "postgresql"
- [ ] Commit and push changes
- [ ] Set all environment variables (see DEPLOYMENT-ENV-VARS.md)
- [ ] Deploy and verify

---

## Need Help?

- **Database Creation**: https://cloud.digitalocean.com/databases
- **App Dashboard**: https://cloud.digitalocean.com/apps
- **Digital Ocean Docs**: https://docs.digitalocean.com/products/databases/

