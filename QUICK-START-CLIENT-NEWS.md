# Quick Start: Client News Feed (with Leads Support)

## ✅ Complete Setup in 3 Steps

### Step 1: Apply Database Migration

Run the migration script:

```bash
./apply-client-news-migration.sh
```

Or manually:
```bash
npx prisma migrate dev --name add_client_news
```

### Step 2: Build Components

Components are already built! But if you need to rebuild:

```bash
npm run build:jsx
```

### Step 3: Test It Out

1. **Start your server** (if not already running):
   ```bash
   npm start
   ```

2. **Navigate to CRM section** in your browser

3. **Click the "News Feed" tab** (next to Pipeline)

4. **View activities and news** for both clients and leads!

## 🔍 Features Included

✅ **Activities Feed**: Shows activities from all clients AND leads  
✅ **News Articles**: Daily Google News RSS search for clients AND leads  
✅ **Lead Badges**: Leads are clearly marked with yellow "Lead" badges  
✅ **Filters**: Filter by client/lead and date range  
✅ **NEW Badges**: Articles published within 24 hours are highlighted  

## 📰 Daily News Search

The news search uses **Google News RSS feeds** (no API key required!).

### Manual Search

Trigger a news search right now:

```bash
# Via API (requires auth token)
curl -X POST http://localhost:8000/api/client-news/search \
  -H "Authorization: Bearer YOUR_TOKEN"

# Or via script
node scripts/daily-news-search.js
```

### Automated Daily Search

Set up a daily cron job:

```bash
./setup-daily-news-cron.sh
```

This runs the search at 9 AM daily.

## 🎯 What's Included for Leads

- ✅ Leads are included in news searches (Potential and Active status)
- ✅ Lead activities appear in the activities feed
- ✅ Leads are marked with yellow "Lead" badges
- ✅ Filter dropdown shows "(Lead)" next to lead names
- ✅ Leads are sorted separately (clients first, then leads alphabetically)

## 🔧 Troubleshooting

**No news articles showing?**
- Run a manual search: `node scripts/daily-news-search.js`
- Check server logs for errors
- Verify clients/leads have names and websites

**Activities not showing?**
- Ensure clients/leads have activityLog entries
- Check browser console for API errors
- Verify DatabaseAPI.getClients() and getLeads() are working

**Migration failed?**
- Check DATABASE_URL is set correctly
- Verify Prisma client is generated: `npx prisma generate`
- Try manual SQL: `psql $DATABASE_URL < add-client-news-migration.sql`

## 📚 Next Steps

- Customize news search sources
- Add news categories/tags
- Set up notifications for new articles
- Integrate with other news APIs (optional)

Enjoy your new Client & Lead News Feed! 🎉

