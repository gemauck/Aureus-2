# SendGrid Email Implementation Guide

## How SendGrid Works in This System

The system uses **SendGrid's HTTP API** (not SMTP) to send emails, which bypasses port blocking issues and is more reliable for production.

## 🎯 How It's Detected

The system automatically detects SendGrid configuration in **3 ways**:

### 1. Direct API Key (Preferred)
```bash
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
```
- If this environment variable is set, SendGrid HTTP API is used immediately
- No SMTP configuration needed

### 2. SMTP Host Detection
```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PASS=SG.xxxxxxxxxxxxx  # Must start with "SG."
```
- If `SMTP_HOST` is `smtp.sendgrid.net` AND
- `SMTP_PASS` starts with `"SG."` (SendGrid API key format)
- Then SendGrid HTTP API is used

### 3. Password Pattern Detection
```bash
SMTP_PASS=SG.xxxxxxxxxxxxx  # Any SendGrid API key starting with "SG."
```
- If `SMTP_PASS` starts with `"SG."`, it's treated as a SendGrid API key
- Even if `SMTP_HOST` is not set to SendGrid

## 📧 How SendGrid HTTP API Works

### Function: `sendViaSendGridAPI()`

**Location**: `api/_lib/email.js` (lines 16-112)

**Process**:

1. **Extract Email Address**
   - Parses "Name <email>" format if needed
   - Extracts sender email and name separately

2. **Build SendGrid Payload**
   ```javascript
   {
     personalizations: [{
       to: [{ email: recipient }],
       subject: "Subject"
     }],
     from: { email: senderEmail, name: senderName },
     content: [
       { type: 'text/plain', value: plainText },
       { type: 'text/html', value: htmlContent }
     ]
   }
   ```

3. **Send to SendGrid API**
   ```javascript
   POST https://api.sendgrid.com/v3/mail/send
   Headers:
     Authorization: Bearer SG.xxxxxxxxxxxxx
     Content-Type: application/json
   Body: (JSON payload above)
   ```

4. **Error Handling**
   - Checks for sender verification errors
   - Provides helpful error messages
   - Logs detailed error information

## 🔧 Configuration Examples

### Option 1: Direct API Key (Recommended)
```bash
# .env file
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=garethm@abcotronics.co.za
EMAIL_REPLY_TO=garethm@abcotronics.co.za
```

### Option 2: Via SMTP Variables (Also Works)
```bash
# .env file
SMTP_HOST=smtp.sendgrid.net
SMTP_PASS=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=garethm@abcotronics.co.za
EMAIL_REPLY_TO=garethm@abcotronics.co.za
```

## ✅ Advantages of SendGrid HTTP API

1. **No Port Blocking**
   - Uses HTTPS (port 443) instead of SMTP ports
   - Works in restricted network environments
   - No firewall configuration needed

2. **Better Reliability**
   - More reliable than SMTP
   - Better error messages
   - Built-in rate limiting

3. **Easier Setup**
   - Just need API key (no SMTP credentials)
   - No need to configure SMTP ports

4. **Better Error Messages**
   - Clear sender verification errors
   - Detailed API error responses

## 🚨 Common SendGrid Errors

### Sender Not Verified
```
❌ SENDER VERIFICATION ERROR: The email address must be verified in SendGrid!
   Go to: https://app.sendgrid.com/settings/sender_auth
   Verify: garethm@abcotronics.co.za
```

**Solution**: 
1. Go to SendGrid dashboard
2. Navigate to Settings → Sender Authentication
3. Verify your sender email address
4. Complete the verification process

### Invalid API Key
```
❌ SendGrid API error: 401 Unauthorized
```

**Solution**:
1. Check that API key starts with "SG."
2. Verify key is correct (no extra spaces)
3. Check API key permissions in SendGrid dashboard

## 📝 Where SendGrid is Used

SendGrid is used for all email sending functions:

1. **User Invitations** (`sendInvitationEmail`)
   - Sends invitation emails to new users
   - Includes invitation link and account details

2. **Password Resets** (`sendPasswordResetEmail`)
   - Sends password reset links
   - Includes security warnings

3. **Notification Emails** (`sendNotificationEmail`)
   - Sends notification emails for mentions, tasks, etc.
   - Respects user email preferences

## 🔍 Debugging SendGrid

### Check Configuration
```javascript
// In api/_lib/email.js
console.log('📧 Using SendGrid HTTP API (bypasses SMTP port blocking)');
console.log('📧 SendGrid API Key:', sendGridKey ? `${sendGridKey.substring(0, 5)}...` : 'NOT SET');
```

### Log Payload
```javascript
// Before sending
console.log('📧 SendGrid API payload:', {
    to: mailOptions.to,
    from: { email: fromEmail, name: fromName },
    subject: mailOptions.subject,
    hasHtml: !!mailOptions.html,
    hasText: !!mailOptions.text
});
```

### Test SendGrid API Key
```bash
curl -X POST https://api.sendgrid.com/v3/mail/send \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "personalizations": [{
      "to": [{"email": "test@example.com"}]
    }],
    "from": {"email": "sender@example.com"},
    "subject": "Test",
    "content": [{"type": "text/plain", "value": "Test email"}]
  }'
```

## 🎯 Current Status

Based on the code:
- ✅ SendGrid HTTP API is fully implemented
- ✅ Automatic detection works (API key or SMTP config)
- ✅ Error handling includes sender verification checks
- ✅ All email functions support SendGrid
- ✅ Detailed logging for debugging

## 📋 Setup Checklist

1. [ ] Get SendGrid API key from https://app.sendgrid.com/settings/api_keys
2. [ ] Set `SENDGRID_API_KEY` in `.env` file
3. [ ] Set `EMAIL_FROM` to your verified sender email
4. [ ] Verify sender email in SendGrid dashboard
5. [ ] Test email sending with test notification
6. [ ] Check logs for any errors

## 🔗 SendGrid Dashboard Links

- **API Keys**: https://app.sendgrid.com/settings/api_keys
- **Sender Authentication**: https://app.sendgrid.com/settings/sender_auth
- **Activity Feed**: https://app.sendgrid.com/activity
- **Email API**: https://docs.sendgrid.com/api-reference/mail-send/mail-send

