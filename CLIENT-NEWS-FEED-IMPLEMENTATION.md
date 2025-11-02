# Client News Feed Implementation

## Overview

A new "Client News Feed" section has been added to the CRM module, positioned next to the Pipeline tab. This feature displays:
- **Client & Lead Activities**: A feed of activities across all clients and leads (from activityLogs)
- **News Articles**: Daily public news search results for all clients and leads, with highlighting of new stories

## Files Created/Modified

### New Files

1. **`src/components/clients/ClientNewsFeed.jsx`**
   - Main component displaying activities and news feed
   - Features:
     - Tabs for Activities and News
     - Filter by client and date range
     - Highlights new articles (published within 24 hours)
     - Real-time activity feed from client activityLogs

2. **`api/client-news.js`**
   - API endpoint for fetching and creating news articles
   - Routes:
     - `GET /api/client-news` - Get all news articles
     - `POST /api/client-news` - Create/update news article

3. **`api/client-news/search.js`**
   - API endpoint for triggering daily news search
   - Route: `POST /api/client-news/search` (requires authentication)
   - Searches news for all active clients

4. **`scripts/daily-news-search.js`**
   - Standalone script for running daily news searches
   - Can be run via cron or task scheduler
   - Usage: `node scripts/daily-news-search.js`

5. **`add-client-news-migration.sql`**
   - Database migration to add ClientNews table
   - Includes indexes for performance

### Modified Files

1. **`src/components/clients/Clients.jsx`**
   - Added "News Feed" tab button next to Pipeline
   - Added viewMode 'news-feed' rendering

2. **`prisma/schema.prisma`**
   - Added `ClientNews` model with relation to Client
   - Added `newsArticles` relation to Client model

3. **`lazy-load-components.js`**
   - Added ClientNewsFeed.jsx to lazy loading list

## Database Schema

### ClientNews Table

```prisma
model ClientNews {
  id          String    @id @default(cuid())
  clientId    String
  client      Client    @relation(fields: [clientId], references: [id])
  title       String
  description String    @default("")
  url         String    @default("")
  source      String    @default("Unknown")
  publishedAt DateTime  @default(now())
  isNew       Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

## Setup Instructions

### 1. Run Database Migration

Apply the migration to create the ClientNews table:

```bash
# Option 1: Using Prisma
npx prisma migrate dev --name add_client_news

# Option 2: Direct SQL (if migration system is separate)
psql $DATABASE_URL < add-client-news-migration.sql
```

### 2. Configure News API Integration

The news search functionality needs to be integrated with a real news API. Update the `searchNewsForClient` function in:

- `api/client-news/search.js` (for API endpoint)
- `scripts/daily-news-search.js` (for standalone script)

**Example using NewsAPI.org:**

```javascript
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const response = await fetch(
  `https://newsapi.org/v2/everything?q=${encodeURIComponent(clientName)}&sortBy=publishedAt&apiKey=${NEWS_API_KEY}`
);
const data = await response.json();
return data.articles || [];
```

Add to `.env`:
```
NEWS_API_KEY=your_news_api_key_here
```

**Alternative options:**
- Google News RSS feeds
- Bing News Search API
- Custom RSS feed aggregator
- Web scraping (with proper compliance)

### 3. Set Up Daily News Search

**Option A: Cron Job (Linux/Mac)**

Add to crontab (`crontab -e`):
```
0 9 * * * /usr/bin/node /path/to/project/scripts/daily-news-search.js >> /path/to/logs/news-search.log 2>&1
```

**Option B: API Call (via external scheduler)**

Use a service like cron-job.org or similar to call:
```
POST https://your-domain.com/api/client-news/search
Authorization: Bearer YOUR_API_TOKEN
```

**Option C: Server-side Cron (Node.js)**

Add to your server startup:
```javascript
const cron = require('node-cron');
const { runDailyNewsSearch } = require('./scripts/daily-news-search.js');

// Run daily at 9 AM
cron.schedule('0 9 * * *', () => {
  runDailyNewsSearch().catch(console.error);
});
```

## Usage

### For Users

1. Navigate to **CRM** section
2. Click the **News Feed** tab (next to Pipeline)
3. View activities and news articles for both clients and leads
4. Filter by:
   - Client/Lead (All or specific client/lead - shows "(Lead)" badge for leads)
   - Date range (All Time, Today, Last 7 Days, Last 30 Days)
5. Switch between Activities and News tabs
6. Leads are clearly marked with a yellow "Lead" badge

### For Administrators

**Trigger Manual News Search:**

```bash
# Via API (requires authentication)
curl -X POST https://your-domain.com/api/client-news/search \
  -H "Authorization: Bearer YOUR_TOKEN"

# Via script
node scripts/daily-news-search.js
```

## Features

### Activities Feed
- Aggregates activityLog entries from all clients and leads
- Shows activity type, description, client/lead name, timestamp
- Color-coded by activity type
- Leads are marked with a yellow "Lead" badge
- Real-time updates when clients or leads are modified

### News Feed
- Displays news articles fetched for clients and leads
- Highlights articles published within last 24 hours with "NEW" badge
- Shows article title, description, source, and link
- Leads are marked with a yellow "Lead" badge
- Filters by client/lead and date range
- Badge showing count of new articles

## API Endpoints

### GET /api/client-news
Get all news articles (filtered on frontend).

**Response:**
```json
{
  "data": {
    "newsArticles": [
      {
        "id": "clx...",
        "clientId": "clx...",
        "clientName": "Client Name",
        "title": "Article Title",
        "description": "Article description",
        "url": "https://...",
        "source": "Source Name",
        "publishedAt": "2024-01-01T00:00:00Z",
        "isNew": true
      }
    ]
  }
}
```

### POST /api/client-news
Create or update a news article.

**Request:**
```json
{
  "clientId": "clx...",
  "title": "Article Title",
  "description": "Description",
  "url": "https://...",
  "source": "Source",
  "publishedAt": "2024-01-01T00:00:00Z"
}
```

### POST /api/client-news/search
Trigger news search for all active clients (requires authentication).

## Notes

- News search is currently using a mock implementation. **You must integrate with a real news API** for production use.
- The `isNew` flag is automatically set based on publication date (within 24 hours).
- Articles are deduplicated by URL per client.
- The daily search script processes all active clients and saves unique articles.

## Future Enhancements

1. **News API Integration**: Connect to NewsAPI.org, Google News, or RSS feeds
2. **Sentiment Analysis**: Analyze news sentiment for each client
3. **Notifications**: Alert users when new articles are found
4. **News Categories**: Tag articles by category (product launches, financial news, etc.)
5. **Client Preferences**: Allow clients to specify news topics of interest
6. **Article Summarization**: Auto-generate summaries of long articles

