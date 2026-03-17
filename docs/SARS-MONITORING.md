# SARS Website Monitoring Feature

## Overview

The SARS Website Monitoring feature automatically tracks changes across the SARS website: **public notices**, **legislation**, **news** and announcements. It checks multiple key sections (not just one page) and sends a **summary email to the Compliance team** when new changes are found. This helps the Compliance team stay informed about tax regulations, VAT updates, and compliance requirements.

## Features

- **Multi-section monitoring**: Announcements, News & Media, Latest News, What's New, Public Notices, Secondary Legislation, Media Releases
- **Automatic monitoring**: Scheduled run (e.g. daily cron) plus manual "Check Now" from the Teams → Compliance → SARS Monitoring tab
- **Summary email**: When new changes are found, a summary email is sent to all members of the Compliance team (configurable via `SARS_MONITORING_TEAM_ID`, default `compliance`)
- **Change detection**: Identifies new content and tracks changes over time
- **Priority classification**: Critical, High, Medium, Normal, Low
- **Category filtering**: Tax, VAT, Compliance, General
- **Read/Unread status**: Tracks which updates have been reviewed
- **Last checked**: UI shows last run time and any error message
- **First-run guard**: Summary email is not sent on the very first run (to avoid flooding with historical items)

## Access

1. Navigate to **Teams** in the main navigation
2. Click on the **Compliance** team card
3. Click the **SARS Monitoring** tab

## Usage

### Manual Check

1. Click the **"Check Now"** button in the SARS Monitoring section
2. The system will fetch the latest updates from the SARS website
3. New changes will appear in the list below

### Viewing Changes

- Changes are displayed in a list with:
  - Title and description
  - Priority badge (Critical, High, Medium, Normal)
  - Category badge (Tax, VAT, Compliance, General)
  - Publication date
  - Direct link to SARS website

### Filtering

Use the filter dropdowns to:
- Filter by status: All, New Only, Old Only
- Filter by read status: All, Unread, Read
- Filter by category: All, Tax, VAT, Compliance, General
- Filter by priority: All, Critical, High, Medium, Normal, Low

### Marking as Read

- Click the checkmark button (✓) on any unread change to mark it as read
- This helps track which updates have been reviewed

## API Endpoints

### Check for Changes
```
GET /api/sars-monitoring/check?action=check
```
Manually triggers a check of the SARS website.

**Response:**
```json
{
  "success": true,
  "message": "SARS website check completed",
  "results": {
    "checked": 1,
    "newChanges": 3,
    "errors": 0,
    "changes": [...]
  }
}
```

### List Changes
```
GET /api/sars-monitoring/check?action=list&limit=50&isNew=true&category=Tax
```
Retrieves a list of changes with optional filters.

**Query Parameters:**
- `limit` (number): Maximum number of results (default: 50)
- `isNew` (boolean): Filter by new status
- `isRead` (boolean): Filter by read status
- `category` (string): Filter by category
- `priority` (string): Filter by priority

### Last run (for "Last checked" in UI)
```
GET /api/sars-monitoring/check?action=last-run
```
Returns the most recent run: `ranAt`, `success`, `newCount`, `errorMessage`.

### Get Statistics
```
GET /api/sars-monitoring/check?action=stats
```
Returns statistics about changes.

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 45,
    "new": 3,
    "unread": 12,
    "byCategory": [...],
    "byPriority": [...]
  }
}
```

### Mark as Read
```
POST /api/sars-monitoring/check?action=mark-read
Content-Type: application/json

{
  "id": "change-id"
}
```
Marks a specific change as read.

## Automated Monitoring

### Cron job

The script checks all monitored sections and, when new changes are found, sends a summary email to the Compliance team. Run it daily (e.g. 9 AM):

```bash
crontab -e
# Run from repo root so the script can import the email helper
0 9 * * * cd /path/to/abcotronics-erp-modular && node scripts/sars-website-monitor.js >> /var/log/sars-monitoring.log 2>&1
```

### Manual run

```bash
cd /path/to/abcotronics-erp-modular
node scripts/sars-website-monitor.js
```

The script will:
1. Check each monitored section (with a short delay between requests)
2. Store new changes in the database
3. If any new changes were found, send a summary email to Compliance team members
4. Record the run for "Last checked" in the UI
5. Output results to the console

## Database Schema

### SarsWebsiteChange Model

```prisma
model SarsWebsiteChange {
  id          String   @id @default(cuid())
  url         String   // The URL that was checked
  pageTitle   String   @default("")
  changeType  String   @default("update") // new, update, removed
  title       String   // Title of the change/announcement
  description String   @default("") // Description or summary
  content     String   @default("") // Full content or excerpt
  publishedAt DateTime? // When the change was published on SARS website
  isNew       Boolean  @default(true) // Whether this is a new change
  isRead      Boolean  @default(false) // Whether user has read this
  priority    String   @default("Normal") // Low, Normal, Medium, High, Critical
  category    String   @default("General") // Tax, VAT, Compliance, etc.
  metadata    String   @default("{}") // JSON object for additional data
  ownerId     String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([url])
  @@index([publishedAt])
  @@index([isNew])
  @@index([isRead])
  @@index([createdAt])
}
```

### SarsMonitoringRun model (last run for UI)

```prisma
model SarsMonitoringRun {
  id            String   @id @default(cuid())
  ranAt         DateTime @default(now())
  success       Boolean  @default(true)
  newCount      Int      @default(0)
  errorMessage  String?  @db.Text
  createdAt     DateTime @default(now())
  @@index([ranAt])
}
```

## Priority Classification

The system automatically classifies changes by priority based on keywords:

- **Critical**: Contains "urgent", "critical", or "immediate"
- **High**: Contains "important" or "deadline"
- **Medium**: Contains "update" or "change"
- **Normal**: Default for other changes

## Category Classification

Changes are automatically categorized:

- **VAT**: Contains "vat" in title or description
- **Tax**: Contains "tax" in title or description
- **Compliance**: Contains "compliance" in title or description
- **General**: Default category

## Monitored sections

The system checks these sections (public notices, legislation, news):

- Announcements: `https://www.sars.gov.za/news-and-media/announcements/`
- News & Media: `https://www.sars.gov.za/news-and-media/`
- Latest News: `https://www.sars.gov.za/latest-news/`
- What's New: `https://www.sars.gov.za/whats-new-at-sars/`
- Public Notices: `https://www.sars.gov.za/legal-counsel/secondary-legislation/public-notices/`
- Secondary Legislation: `https://www.sars.gov.za/legal-counsel/secondary-legislation/`
- Media Releases: `https://www.sars.gov.za/media/media-releases/`

## Configuration

- **SARS_MONITORING_TEAM_ID**: Team id used to resolve Compliance team members for the summary email (default: `compliance`). Ensure this matches your Teams API team id or the team name is "Compliance".
- **APP_URL**: Base URL for links in the summary email (e.g. `https://erp.abcotronics.co.za`).
- Email is sent using existing app config (Resend / SendGrid / SMTP).

## Troubleshooting

### Changes Not Appearing

1. Ensure the database has the required tables. If `SarsWebsiteChange` or `SarsMonitoringRun` are missing, apply migrations or run:
   ```bash
   npx prisma migrate deploy
   ```
   (or `npx prisma db push` for dev). The schema is in `prisma/schema.prisma`.

2. Verify the API endpoint is accessible:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/sars-monitoring/check?action=list
   ```

3. Check browser console for errors

### Manual Check Failing

1. Verify network connectivity to SARS website
2. Check that the SARS website structure hasn't changed
3. Review server logs for detailed error messages

### Component Not Loading

1. Ensure the component is registered in `component-loader.js`
2. Check browser console for component loading errors
3. Verify the component file exists at `src/components/teams/SarsMonitoring.jsx`

## Future Enhancements

Potential improvements:
- Email notifications for critical updates
- RSS feed integration
- Multiple website monitoring
- Change comparison (diff view)
- Export functionality
- Custom monitoring rules
- Integration with compliance workflows

## Support

For issues or questions:
1. Check the browser console for errors
2. Review server logs
3. Verify database connectivity
4. Ensure all migrations are applied









