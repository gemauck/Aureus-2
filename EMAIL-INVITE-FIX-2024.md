# Email Invitation Fix - December 2024

## Issue
Emails cannot be sent when trying to invite users to the system.

## Root Causes Identified
1. **Lazy Initialization Issue**: Email transporter was created when the module loaded, potentially before environment variables were available
2. **Missing Configuration Validation**: No checks to verify SMTP credentials before attempting to send
3. **Poor Error Messages**: Generic error messages didn't help diagnose specific issues
4. **No Connection Timeouts**: Email sending could hang indefinitely

## Solutions Implemented

### 1. Lazy Transporter Initialization
- Changed from creating transporter at module load to creating it on-demand
- Ensures environment variables are available when transporter is created
- Added initialization flag to prevent multiple creations

### 2. Configuration Validation
- Added `checkEmailConfiguration()` function that verifies credentials before sending
- Provides clear error message if SMTP_USER/SMTP_PASS are missing
- Prevents silent failures

### 3. Enhanced Error Handling
- Specific error messages for common issues:
  - `EAUTH`: Authentication failed (wrong username/password)
  - `ECONNECTION/ETIMEDOUT`: Network/connection issues
  - Missing configuration: Clear message about required environment variables

### 4. Connection Timeouts
- Added 10-second timeouts for connection, greeting, and socket operations
- Prevents email sending from hanging indefinitely

### 5. Better Logging
- Logs transporter initialization details
- Shows which configuration values are present (without exposing passwords)
- More detailed error logging

## Required Environment Variables

Make sure these are set in your `.env` file` or deployment environment:

```bash
# For Gmail SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
EMAIL_FROM=your-email@gmail.com

# Alternative: Use Gmail-specific variable names
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-gmail-app-password

# Or use a single SMTP URL
SMTP_URL=smtp://user:pass@smtp.gmail.com:587
```

## Setting Up Gmail App Password

1. Go to https://myaccount.google.com/apppasswords
2. Sign in with your Gmail account
3. Under "Select app", choose "Mail"
4. Under "Select device", choose "Other" and enter "Abcotronics ERP"
5. Click "Generate"
6. Copy the 16-character password (no spaces)
7. Add it to your `.env` file as `SMTP_PASS`

**Important**: 
- Your Gmail account must have 2-Factor Authentication enabled
- App passwords are required when 2FA is enabled
- The password is 16 characters, usually displayed as: `xxxx xxxx xxxx xxxx` (remove spaces when adding to `.env`)

## Testing Email Functionality

### Option 1: Test Endpoint
```bash
curl -X POST http://localhost:3001/api/test-email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"Test User"}'
```

### Option 2: Invite User in UI
1. Log into the ERP system
2. Go to User Management
3. Click "Invite User"
4. Fill in the form and submit
5. Check the result modal for detailed feedback

### Option 3: Check Server Logs
Look for these log messages:
- `📧 Initializing email transporter...` - Shows configuration status
- `✅ Email service ready to send messages` - Success
- `❌ Email service configuration error` - Configuration issue

## Troubleshooting

### Error: "Email configuration incomplete"
**Cause**: SMTP_USER or SMTP_PASS not set in environment variables

**Solution**: 
1. Check your `.env` file exists and has both variables
2. Restart your server after adding/changing variables
3. In production, verify environment variables in deployment platform

### Error: "Email authentication failed" (EAUTH)
**Cause**: Wrong username or password

**Solutions**:
1. Verify your Gmail app password is correct (16 characters, no spaces)
2. Regenerate app password if unsure
3. Make sure 2FA is enabled on your Google account
4. Check that SMTP_USER matches your Gmail address exactly

### Error: "Email connection failed" (ECONNECTION/ETIMEDOUT)
**Cause**: Network issues or SMTP server unreachable

**Solutions**:
1. Check your internet connection
2. Verify SMTP_HOST and SMTP_PORT are correct
3. Check if firewall is blocking port 587
4. Try using port 465 with SMTP_SECURE=true

### Emails Sent But Not Received
**Possible Causes**:
1. Email in spam folder
2. Gmail sending limits exceeded (500 emails/day for free accounts)
3. Wrong email address
4. Email provider blocking the message

**Solutions**:
1. Check spam/junk folder
2. Verify recipient email address
3. Check Gmail account for sending limits
4. Try sending to a different email address

## Verifying Your Setup

1. **Check Environment Variables**:
   ```bash
   # In your terminal, check if variables are loaded
   node -e "require('dotenv').config(); console.log('SMTP_USER:', process.env.SMTP_USER ? 'SET' : 'NOT SET'); console.log('SMTP_PASS:', process.env.SMTP_PASS ? 'SET' : 'NOT SET');"
   ```

2. **Check Server Logs**:
   - Start your server and look for email initialization messages
   - The logs will show if configuration is detected

3. **Test Email Endpoint**:
   - Use the `/api/test-email` endpoint to verify sending works

## Code Changes

The main changes were made to `api/_lib/email.js`:

- Made transporter creation lazy (on-demand instead of module load)
- Added `getTransporter()` function with lazy initialization
- Added `checkEmailConfiguration()` for validation
- Enhanced error messages with specific guidance
- Added connection timeouts (10 seconds each)
- Improved logging throughout

## Next Steps

1. **Add your SMTP credentials** to your `.env` file
2. **Restart your server** to load new configuration
3. **Test email sending** using one of the methods above
4. **Check server logs** for any initialization errors
5. **Try inviting a user** through the UI

If issues persist after following these steps, check the server logs for specific error messages and refer to the troubleshooting section above.

