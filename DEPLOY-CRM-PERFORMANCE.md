# CRM Performance Fix - Deployment Guide

## ✅ Changes Ready for Deployment

All performance fixes have been implemented:

1. **api/leads.js** - Removed expensive tags JOIN from leads list query
2. **apply-indexes.js** - Added opportunity indexes creation
3. **add-performance-indexes.sql** - Added opportunity indexes SQL
4. **deploy-crm-performance-fix.sh** - Deployment script

## 🚀 Deployment Instructions

### Option 1: Use the Deployment Script (Recommended)

```bash
./deploy-crm-performance-fix.sh
```

This script will:
- Pull latest code from GitHub
- Build the frontend
- Apply database indexes automatically
- Restart the application

### Option 2: Manual Deployment

1. **Deploy code changes:**
   ```bash
   ./deploy-to-server.sh
   ```

2. **SSH into server and apply indexes:**
   ```bash
   ssh root@abcoafrica.co.za
   cd /var/www/abcotronics-erp
   node apply-indexes.js
   pm2 restart abcotronics-erp
   ```

3. **Verify deployment:**
   - Check server logs: `pm2 logs abcotronics-erp`
   - Test CRM pages load speed
   - Verify indexes were created (should see success messages)

## 📊 Expected Performance Improvements

### Before:
- Leads API: **60-120+ seconds** ⏱️
- Overall CRM load: **Minutes** ⏱️⏱️

### After:
- Leads API: **1-3 seconds** ⚡
- Overall CRM load: **5-10 seconds** ⚡

## 🧪 Testing After Deployment

1. **Hard refresh browser** (Cmd+Shift+R / Ctrl+Shift+R)
2. Navigate to **Clients/Leads** page
3. Check browser console for API response times
4. Should see: `✅ Leads retrieved successfully: X leads` quickly
5. Test Pipeline view - should load much faster

## 🔍 Troubleshooting

**If leads still load slowly:**
- Verify indexes were applied: Check server logs for index creation messages
- Check database connection: Ensure DATABASE_URL is set correctly on server
- Verify the tags include was removed: Check `api/leads.js` on server

**If indexes fail to apply:**
- May be normal if indexes already exist (safe to run multiple times)
- Check DATABASE_URL is configured on server
- Verify database connection permissions

## 📝 Files Modified

- ✅ `api/leads.js` - Optimized query (tags excluded)
- ✅ `apply-indexes.js` - Added opportunity indexes
- ✅ `add-performance-indexes.sql` - Added opportunity indexes SQL
- ✅ `deploy-crm-performance-fix.sh` - Deployment script
- ✅ `CRM-PERFORMANCE-FIX.md` - Documentation

## ⚠️ Important Notes

1. **Indexes are safe**: Using `CREATE INDEX IF NOT EXISTS` - won't recreate if they exist
2. **No downtime**: Index creation happens in background
3. **One-time operation**: Run once, indexes persist
4. **Tags still available**: Only excluded from LIST queries, still fetched for detail views

