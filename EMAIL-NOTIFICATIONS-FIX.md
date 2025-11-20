# Email Notifications Fix

## Issues Fixed

### 1. **Default Email Settings**
- **Problem**: `emailTasks` was defaulting to `false` in the schema, so task assignment emails were disabled by default
- **Fix**: Changed default to `true` in `prisma/schema.prisma`
- **Impact**: New users will now receive task assignment emails by default

### 2. **Notification Settings Creation**
- **Problem**: When creating default notification settings, `emailTasks` was not explicitly set to `true`
- **Fix**: Updated `api/notifications.js` to explicitly set `emailTasks: true` when creating default settings
- **Impact**: New users will have all email notifications enabled by default

### 3. **Error Logging**
- **Problem**: Email sending errors were not being logged in detail
- **Fix**: Added comprehensive logging throughout the email sending process
- **Impact**: You can now see exactly why emails are failing in the server logs

### 4. **Email Configuration Checking**
- **Problem**: Email configuration errors were not being caught and logged properly
- **Fix**: Added better error handling and configuration checking in `api/_lib/email.js`
- **Impact**: Clear error messages when email configuration is missing or incorrect

## What You Need to Do

### 1. **Update Existing Users (IMPORTANT)**
Existing users may still have `emailTasks: false`. Run the migration script:

```bash
node api/update-notification-settings.js
```

This will:
- Enable `emailTasks: true` for all existing users
- Create notification settings for users who don't have them
- Log all changes

### 2. **Check Email Configuration**
Make sure your email configuration is set up correctly in your `.env` file:

**Option A: SendGrid (Recommended)**
```env
SENDGRID_API_KEY=SG.your_api_key_here
EMAIL_FROM=your-verified-email@abcotronics.co.za
```

**Option B: SMTP (Gmail)**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com
```

**Option C: SMTP (Other)**
```env
SMTP_HOST=your-smtp-server.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@domain.com
SMTP_PASS=your-password
EMAIL_FROM=your-email@domain.com
```

### 3. **Check Server Logs**
After making a notification, check your server logs for:

**Success indicators:**
- `📧 Should send email: true (type: task, user email: present)`
- `📧 Preparing to send email notification to user@email.com (type: task)`
- `✅ Email notification sent successfully`

**Error indicators:**
- `⚠️ Email notification skipped - user preference disabled` (user has disabled email notifications)
- `⚠️ Email notification skipped - user has no email address` (user doesn't have an email)
- `❌ Failed to send email notification` (email configuration issue)
- `❌ Email configuration not available` (missing email configuration)

### 4. **Verify User Notification Settings**
Users can check/update their notification settings:
1. Go to Settings → Notifications
2. Make sure "Email notifications for tasks" is enabled
3. Make sure "Email notifications for mentions" is enabled
4. Make sure "Email notifications for comments" is enabled

## Testing

1. **Test Task Assignment Email:**
   - Assign a task to yourself or another user
   - Check server logs for email sending
   - Check recipient's email inbox

2. **Test Mention Email:**
   - Tag a user in a comment: `@username`
   - Check server logs for email sending
   - Check recipient's email inbox

3. **Test Comment Email:**
   - Add a comment to a task
   - Check server logs for email sending
   - Check recipient's email inbox

## Troubleshooting

### No emails are being sent
1. Check server logs for error messages
2. Verify email configuration in `.env` file
3. Check if user has email notifications enabled in settings
4. Verify user has an email address in their profile
5. Check if email service (SendGrid/SMTP) is working

### Emails are being sent but not received
1. Check spam/junk folder
2. Verify sender email is verified in SendGrid (if using SendGrid)
3. Check email service logs (SendGrid dashboard, SMTP logs)
4. Verify recipient email address is correct

### "Email configuration not available" error
1. Make sure `.env` file has email configuration
2. Restart the server after updating `.env` file
3. Verify environment variables are loaded correctly

## Files Changed

1. `prisma/schema.prisma` - Changed `emailTasks` default to `true`
2. `api/notifications.js` - Added better logging and error handling
3. `api/_lib/email.js` - Improved error handling and configuration checking
4. `api/update-notification-settings.js` - Migration script for existing users

## Next Steps

1. Run the migration script to update existing users
2. Check server logs to verify email sending
3. Test email notifications with a few users
4. Monitor server logs for any email sending errors






