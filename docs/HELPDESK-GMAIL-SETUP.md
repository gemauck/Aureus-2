# Gmail API Setup for Helpdesk Email-to-Ticket

This guide explains how to set up Gmail API to automatically create tickets from emails sent to `support@abcotronics.co.za`.

## Overview

Instead of using SendGrid/Mailgun webhooks, you can use Gmail API to:
- ✅ Poll Gmail inbox for emails to `support@abcotronics.co.za`
- ✅ Automatically create tickets from new emails
- ✅ Add comments from email replies
- ✅ No DNS changes needed (uses existing Gmail account)

## Prerequisites

1. A Gmail account (e.g., `support@abcotronics.co.za` or your existing Gmail)
2. Google Cloud Project with Gmail API enabled
3. OAuth2 credentials

## Step 1: Set Up Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable **Gmail API**:
   - Go to **APIs & Services** → **Library**
   - Search for "Gmail API"
   - Click **Enable**

## Step 2: Create OAuth2 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Choose **Web application**
4. Configure:
   - **Name**: Abcotronics ERP Helpdesk
   - **Authorized redirect URIs**: 
     - `http://localhost:3000/api/helpdesk/gmail-callback` (for local)
     - `https://abcoafrica.co.za/api/helpdesk/gmail-callback` (for production)
5. Click **Create**
6. **Copy the Client ID and Client Secret**

## Step 3: Install Dependencies

```bash
npm install googleapis
```

## Step 4: Set Environment Variables

Add to your `.env` file:

```bash
# Gmail API Configuration
GMAIL_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GMAIL_CLIENT_SECRET="your-client-secret"
GMAIL_REDIRECT_URI="https://abcoafrica.co.za/api/helpdesk/gmail-callback"
```

## Step 5: Get Refresh Token

1. Start your server:
   ```bash
   npm run dev
   ```

2. Visit the OAuth URL:
   ```
   https://abcoafrica.co.za/api/helpdesk/gmail-auth
   ```
   (or `http://localhost:3000/api/helpdesk/gmail-auth` for local)

3. Sign in with the Gmail account that receives support emails

4. Grant permissions

5. You'll see a page with your **Refresh Token** - copy it

6. Add to `.env`:
   ```bash
   GMAIL_REFRESH_TOKEN="your-refresh-token-here"
   ```

7. Restart your server

## Step 6: Set Up Email Forwarding (Optional)

If `support@abcotronics.co.za` is not a Gmail account:

1. Set up email forwarding from `support@abcotronics.co.za` to your Gmail account
2. Or use Gmail's "Send mail as" feature to receive emails

## Step 7: Set Up Automatic Polling

### Option A: Cron Job (Recommended)

Add a cron job to check Gmail every 5 minutes:

```bash
# Edit crontab
crontab -e

# Add this line (checks every 5 minutes)
*/5 * * * * curl -X POST https://abcoafrica.co.za/api/helpdesk/gmail-watcher
```

### Option B: PM2 Cron

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'gmail-watcher',
    script: './api/helpdesk/gmail-watcher-cron.js',
    cron_restart: '*/5 * * * *', // Every 5 minutes
    autorestart: false
  }]
}
```

### Option C: Manual Trigger

You can manually trigger checks via API:

```bash
curl -X POST https://abcoafrica.co.za/api/helpdesk/gmail-watcher
```

## Step 8: Test

1. Send a test email to `support@abcotronics.co.za` (or your Gmail if forwarding)
2. Wait for the cron job to run (or trigger manually)
3. Check the helpdesk - a new ticket should appear!

## How It Works

1. **Cron job runs** every 5 minutes
2. **Gmail API searches** for unread emails to `support@abcotronics.co.za`
3. **For each email**:
   - Parses email content (subject, body, attachments)
   - Checks if it's a reply (using `In-Reply-To` header)
   - If reply: Adds comment to existing ticket
   - If new: Creates new ticket
4. **Marks email as read** in Gmail

## API Endpoints

### Check Gmail Manually
```bash
POST /api/helpdesk/gmail-watcher
```

Response:
```json
{
  "success": true,
  "checked": 3,
  "processed": 2,
  "results": [
    {
      "messageId": "abc123",
      "processed": true,
      "action": "ticket_created",
      "ticketNumber": "TKT-2025-0001"
    }
  ]
}
```

### OAuth Setup
```
GET /api/helpdesk/gmail-auth
```
Redirects to Google OAuth consent screen.

## Troubleshooting

### "Invalid credentials"
- Check that `GMAIL_REFRESH_TOKEN` is set correctly
- Re-run OAuth flow to get a new refresh token

### "No emails found"
- Verify emails are going to the correct Gmail account
- Check Gmail search query: `to:support@abcotronics.co.za is:unread`
- Make sure emails aren't already marked as read

### "Permission denied"
- Re-run OAuth flow and grant all requested permissions
- Make sure Gmail API is enabled in Google Cloud Console

### Emails not creating tickets
- Check server logs: `pm2 logs abcotronics-erp`
- Look for errors in Gmail API calls
- Verify email format is correct

## Advantages of Gmail API

✅ **No DNS changes** - Uses existing Gmail account  
✅ **Free** - Gmail API is free for reasonable usage  
✅ **Reliable** - Google's infrastructure  
✅ **Full control** - You control when emails are checked  
✅ **Works with any email** - Forward emails from any address to Gmail  

## Disadvantages

⚠️ **Polling required** - Must check periodically (not real-time)  
⚠️ **OAuth setup** - More complex initial setup  
⚠️ **Rate limits** - Gmail API has rate limits (250 quota units per second)  

## Rate Limits

Gmail API allows:
- 1,000,000 quota units per day
- 250 quota units per user per second

Each email check uses ~5 quota units, so you can check ~200 times per second.

## Next Steps

1. Set up Google Cloud Project
2. Get OAuth credentials
3. Install `googleapis` package
4. Run OAuth flow to get refresh token
5. Set up cron job
6. Test with a real email!














