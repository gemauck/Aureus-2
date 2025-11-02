# ✅ Daily Cron Job Setup Complete

## Cron Job Configuration

A daily automated news search has been set up to run at **9:00 AM every day**.

### Cron Schedule
```
0 9 * * * cd /var/www/abcotronics-erp && /usr/bin/node scripts/daily-news-search.js >> logs/news-search.log 2>&1
```

### What This Does
- **Runs daily at 9:00 AM** (server time)
- **Searches news** for all active clients and leads
- **Saves articles** to the database
- **Logs output** to `logs/news-search.log`
- **No API key required** (uses Google News RSS)

### Verification

To verify the cron job is set up:

```bash
ssh root@165.22.127.196
crontab -l
```

You should see the daily news search entry.

### Monitor the Cron Job

**View logs:**
```bash
ssh root@165.22.127.196
cd /var/www/abcotronics-erp
tail -f logs/news-search.log
```

**Check cron service:**
```bash
systemctl status cron
```

**Test the job manually:**
```bash
ssh root@165.22.127.196
cd /var/www/abcotronics-erp
node scripts/daily-news-search.js
```

### Expected Behavior

Every day at 9:00 AM:
1. ✅ Script automatically runs
2. ✅ Searches Google News for all clients/leads
3. ✅ Saves new articles to database
4. ✅ Marks articles published within 24 hours as "NEW"
5. ✅ Logs progress to `logs/news-search.log`

### Manual Trigger

To run the search manually at any time:
```bash
ssh root@165.22.127.196
cd /var/www/abcotronics-erp
node scripts/daily-news-search.js
```

### Modify Schedule

To change the schedule, edit crontab:
```bash
ssh root@165.22.127.196
crontab -e
```

**Common schedules:**
- `0 9 * * *` - Daily at 9:00 AM (current)
- `0 */6 * * *` - Every 6 hours
- `0 9 * * 1-5` - Weekdays only at 9:00 AM
- `0 8,12,18 * * *` - 8 AM, 12 PM, and 6 PM daily

## Status

✅ **Cron Job**: Configured  
✅ **Schedule**: Daily at 9:00 AM  
✅ **Logging**: Enabled  
✅ **Script**: Ready  

---

**Setup Date**: $(date)  
**Status**: ✅ Complete

