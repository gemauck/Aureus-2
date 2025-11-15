# SARS Website Monitoring Feature

## Overview

The SARS Website Monitoring feature automatically tracks changes, announcements, and regulatory updates from the South African Revenue Service (SARS) website. This helps the Compliance team stay informed about tax regulations, VAT updates, and compliance requirements.

## Features

- **Automatic Monitoring**: Checks SARS website for new announcements and updates
- **Change Detection**: Identifies new content and tracks changes over time
- **Priority Classification**: Automatically categorizes updates by priority (Critical, High, Medium, Normal, Low)
- **Category Filtering**: Organizes changes by category (Tax, VAT, Compliance, General)
- **Read/Unread Status**: Tracks which updates have been reviewed
- **Direct Links**: Provides direct links to SARS website for each change
- **Statistics Dashboard**: Shows total changes, new changes, and unread count

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

### Cron Job Setup

To automatically check the SARS website daily, set up a cron job:

```bash
# Edit crontab
crontab -e

# Add this line to run daily at 9 AM
0 9 * * * /usr/bin/node /path/to/abcotronics-erp-modular/scripts/sars-website-monitor.js >> /var/log/sars-monitoring.log 2>&1
```

### Manual Script Execution

Run the monitoring script manually:

```bash
node scripts/sars-website-monitor.js
```

The script will:
1. Fetch the latest announcements from SARS website
2. Extract new changes
3. Store them in the database
4. Mark old changes as not new
5. Output results to console

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

## Monitored URLs

The system currently monitors:
- Main SARS website: `https://www.sars.gov.za`
- News & Media: `https://www.sars.gov.za/news-and-media/`
- Announcements: `https://www.sars.gov.za/news-and-media/announcements/`
- Tax Types: `https://www.sars.gov.za/tax-types/`
- VAT Updates: `https://www.sars.gov.za/tax-types/value-added-tax/`

## Troubleshooting

### Changes Not Appearing

1. Check that the database migration has been run:
   ```bash
   npx prisma migrate deploy
   ```

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


