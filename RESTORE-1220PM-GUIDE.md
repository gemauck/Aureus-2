# Restore Database to 12:20 - Point-in-Time Recovery Guide

## 🎯 Target Restore Time
**12:20 PM** (you need to specify the date)

## ⚠️ Important: Which Date?
Please confirm which date you want to restore to:
- **Today (January 6, 2025) at 12:20 PM?**
- **November 6, 2024 at 12:20 PM?**
- **Another date?**

## 📋 Step-by-Step Restore Process

### Step 1: Access DigitalOcean Database Console
1. Go to: **https://cloud.digitalocean.com/databases**
2. Find your database cluster (the one with your data)
3. Click on it to open details

### Step 2: Initiate Point-in-Time Recovery
1. Click the **"Backups"** tab
2. Look for **"Point-in-Time Recovery"** or **"Restore"** button
3. Click it

### Step 3: Select Restore Time
1. Choose **"Point-in-Time Recovery"** option
2. Enter the restore time:
   - **Date**: (e.g., `2025-01-06` or `2024-11-06`)
   - **Time**: `12:20:00` (12:20 PM)
   - **Timezone**: UTC or your local timezone
3. Enter a name for the restored database: `restored-1220pm-[date]`
4. Click **"Restore"** or **"Create Restore"**

### Step 4: Wait for Restoration
- Restoration takes **5-15 minutes**
- You'll see a new database cluster appear
- Status will show: "Creating" → "Online"

### Step 5: Get Connection Details
Once the restore is complete:
1. Click on the **new restored database cluster**
2. Go to **"Users & Databases"** tab
3. Copy the **Connection String** (full URL)

### Step 6: Update Production Server
Once you have the new connection string, I'll help you:
1. Update `.env` file with new DATABASE_URL
2. Update `ecosystem.config.mjs` 
3. Restart the server
4. Verify your data is restored

## ⏰ Point-in-Time Recovery Availability

DigitalOcean PostgreSQL databases support point-in-time recovery for:
- **Basic Plan**: Last 7 days
- **Professional Plan**: Last 7 days  
- **Enterprise Plan**: Up to 30 days

**Important**: You can only restore to times when backups were taken. Check the "Backups" tab to see available restore points.

## 🔍 Check Available Restore Points

Before restoring, check:
1. Go to **"Backups"** tab
2. Look at available backups and their timestamps
3. Verify that 12:20 PM on your target date is within the recovery window

## 📝 What You Need to Tell Me

1. **What date** do you want to restore to? (e.g., January 6, 2025 or November 6, 2024)
2. **What timezone** is 12:20 PM in? (SAST, UTC, etc.)
3. **What data** was at that time? (to verify the restore worked)

Once you confirm the date, I'll help you with the exact restore steps!

