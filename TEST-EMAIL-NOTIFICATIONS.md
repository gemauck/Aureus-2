# Test Email Notifications

This guide explains how to test the email notification system.

## Quick Test

Run the test script to verify email notifications are working:

```bash
node api/test-email-notifications.js
```

## What the Test Does

The test script will:

1. **Check Email Configuration**
   - Verifies email settings in `.env` file
   - Checks for SendGrid API key or SMTP credentials
   - Displays configuration status

2. **Check Users and Notification Settings**
   - Lists all users in the database
   - Shows which users have notification settings
   - Displays email notification preferences for each user

3. **Test Email Sending**
   - Sends a test email to a user with notifications enabled
   - Verifies email was sent successfully
   - Shows message ID if successful

4. **Test Notification API**
   - Creates a test notification in the database
   - Verifies notification was created
   - Cleans up test notification

## Expected Output

### Success Output
```
🧪 Testing Email Notification System

1️⃣ Checking Email Configuration...
✅ Email configuration check passed
📧 Email Configuration:
   - SendGrid API Key: ✅ Set
   - Email From: your-email@abcotronics.co.za

2️⃣ Checking Users and Notification Settings...
📊 Found 5 users (showing first 10)
📋 Users Summary:
   - Users with notification settings: 5
   - Users without notification settings: 0
   - Users without email addresses: 0

3️⃣ Testing Email Sending...
📧 Test user: John Doe (john@example.com)
   • Email Tasks: ✅
   • Email Mentions: ✅
📤 Test 1: Sending test notification email...
✅ Test email sent successfully!
   Message ID: sendgrid-1234567890
   Success: true
📬 Please check the inbox for: john@example.com

4️⃣ Testing Notification API Endpoint...
✅ Test notification created in database!
   ✅ Test notification cleaned up

5️⃣ Test Summary
✅ Email configuration: OK
✅ Users found: 5
✅ Users with settings: 5
✅ Test email: Sent to john@example.com
```

### Error Output
```
❌ Email configuration check failed
   Please check your .env file for email settings
   Either set SENDGRID_API_KEY or SMTP_USER/SMTP_PASS
```

## Troubleshooting

### "Email configuration check failed"
- Check your `.env` file for email settings
- Make sure `SENDGRID_API_KEY` or `SMTP_USER`/`SMTP_PASS` are set
- Restart the server after updating `.env`

### "No users found in database"
- Make sure the database is connected
- Check database connection settings
- Verify users exist in the database

### "No suitable user found for testing"
- Run the update script to create notification settings:
  ```bash
  node api/update-notification-settings.js
  ```
- Make sure users have email addresses
- Verify notification settings are created

### "Test email failed"
- Check server logs for error details
- Verify email configuration is correct
- For SendGrid: Verify sender email is verified
- For SMTP: Check username and password are correct

### Email Not Received
1. Check spam/junk folder
2. Verify email address is correct
3. Check server logs for email sending errors
4. Verify email service is working (SendGrid dashboard, SMTP logs)

## Next Steps

After running the test:

1. **If test passes:**
   - Check the inbox for the test email
   - Verify email notifications are working in the app
   - Monitor server logs for email sending

2. **If test fails:**
   - Check error messages in the test output
   - Verify email configuration in `.env` file
   - Check server logs for detailed error information
   - Run the update script if users don't have notification settings

3. **Update existing users:**
   ```bash
   node api/update-notification-settings.js
   ```

## Manual Testing

You can also test email notifications manually:

1. **Test Task Assignment:**
   - Assign a task to yourself or another user
   - Check server logs for email sending
   - Check recipient's email inbox

2. **Test Mention:**
   - Tag a user in a comment: `@username`
   - Check server logs for email sending
   - Check recipient's email inbox

3. **Test Comment:**
   - Add a comment to a task
   - Check server logs for email sending
   - Check recipient's email inbox

## Server Logs

Monitor server logs for email sending activity:

**Success indicators:**
- `📧 Should send email: true (type: task, user email: present)`
- `📧 Preparing to send email notification to user@email.com (type: task)`
- `✅ Email notification sent successfully`

**Error indicators:**
- `⚠️ Email notification skipped - user preference disabled`
- `⚠️ Email notification skipped - user has no email address`
- `❌ Failed to send email notification`
- `❌ Email configuration not available`

## Support

If you're still having issues:

1. Check the `EMAIL-NOTIFICATIONS-FIX.md` file for detailed troubleshooting
2. Check server logs for detailed error messages
3. Verify email configuration is correct
4. Test email sending manually with the test script




