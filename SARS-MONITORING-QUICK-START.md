# SARS Monitoring - Quick Start Guide

## 🚀 Quick Setup

### 1. Run Database Migration

```bash
# Apply the migration to create the SarsWebsiteChange table
npx prisma migrate deploy
```

Or if you need to create it fresh:
```bash
npx prisma migrate dev --name add_sars_monitoring
```

### 2. Access the Feature

1. Navigate to **Teams** in the sidebar
2. Click on **Compliance** team
3. Click the **SARS Monitoring** tab

### 3. First Check

Click the **"Check Now"** button to perform your first check of the SARS website.

## 📋 What It Does

- Monitors SARS website for new announcements and regulatory updates
- Automatically categorizes changes by priority and type
- Tracks which updates you've reviewed
- Provides direct links to SARS website for each change

## 🔧 Manual Script Execution

Run the monitoring script manually:

```bash
node scripts/sars-website-monitor.js
```

## ⏰ Automated Daily Checks (Optional)

Add to crontab for daily automatic checks:

```bash
# Edit crontab
crontab -e

# Add this line (runs daily at 9 AM)
0 9 * * * cd /path/to/abcotronics-erp-modular && /usr/bin/node scripts/sars-website-monitor.js >> /var/log/sars-monitoring.log 2>&1
```

## 📊 Features

- **Statistics Dashboard**: See total, new, and unread changes at a glance
- **Smart Filtering**: Filter by status, category, priority, or read state
- **Priority Classification**: Changes automatically tagged as Critical, High, Medium, or Normal
- **Category Organization**: Changes organized by Tax, VAT, Compliance, or General
- **Direct Links**: One-click access to SARS website for each change

## 🎯 Use Cases

- Stay informed about tax regulation changes
- Monitor VAT updates
- Track compliance requirements
- Review new SARS announcements
- Ensure regulatory compliance

## 📖 Full Documentation

See `docs/SARS-MONITORING.md` for complete documentation including:
- API endpoints
- Database schema
- Troubleshooting
- Advanced configuration

## ❓ Troubleshooting

**Component not showing?**
- Check browser console for errors
- Verify component is loaded: `window.SarsMonitoring` should exist
- Refresh the page

**No changes appearing?**
- Ensure database migration is applied
- Check API endpoint: `/api/sars-monitoring/check?action=list`
- Verify authentication token is valid

**Check failing?**
- Verify network connectivity
- Check SARS website is accessible
- Review server logs for detailed errors

