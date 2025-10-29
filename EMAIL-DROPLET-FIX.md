# 📧 EMAIL INVITATION FIX - DROPLET EDITION

## Problem
You have 2 pending invitations, but emails aren't being sent because your **DigitalOcean Droplet doesn't have email environment variables set**.

## Your Setup
- **Server:** DigitalOcean Droplet (165.22.127.196)
- **Domain:** abcoafrica.co.za
- **App Location:** /var/www/abcotronics-erp
- **Process Manager:** PM2

---

## ✅ QUICK FIX (2 minutes)

### Option 1: Automated Script (Easiest)

```bash
# Make script executable
chmod +x fix-email-on-droplet.sh

# Run it!
./fix-email-on-droplet.sh
```

This script will:
1. SSH into your droplet
2. Update .env file with email settings
3. Restart the application
4. Show you the status

### Option 2: Manual SSH (If script doesn't work)

```bash
# 1. SSH into your droplet
ssh root@165.22.127.196

# 2. Go to app directory
cd /var/www/abcotronics-erp

# 3. Edit .env file
nano .env

# 4. Add these lines (or update if they exist):
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="gemauck@gmail.com"
SMTP_PASS="psrbqbzifyooosfx"
EMAIL_FROM="garethm@abcotronics.co.za"
EMAIL_REPLY_TO="garethm@abcotronics.co.za"
SMTP_FROM_EMAIL="noreply@abcotronics.com"
SMTP_FROM_NAME="Abcotronics Security"

# 5. Save and exit (Ctrl+X, then Y, then Enter)

# 6. Restart the app
pm2 restart abcotronics-erp

# 7. Check status
pm2 logs abcotronics-erp --lines 50
```

---

## 🧪 Test Email Sending

### Method 1: Use Diagnostic Tool
```bash
# Open in your browser
open diagnostics/email-invitation-tester.html
```

1. Click "Send Test Invitation"
2. Enter your email address
3. Fill in name and role
4. Click send
5. Check email inbox (and spam folder!)

### Method 2: Re-send from ERP
1. Go to https://abcoafrica.co.za
2. Navigate to Users page
3. Delete existing invitation
4. Create new invitation
5. Email should arrive within 1 minute

---

## 🔍 Verify It's Working

### Check Server Logs
```bash
ssh root@165.22.127.196 'pm2 logs abcotronics-erp --lines 50'
```

**Look for:**
- ✅ `"Email service ready to send messages"` = Good!
- ✅ `"Invitation email sent successfully"` = Working!
- ❌ `"Email authentication failed"` = App password issue
- ❌ `"Email configuration incomplete"` = Variables not set

### Quick Status Check
```bash
ssh root@165.22.127.196 'pm2 status'
```

Should show your app as "online" with recent restart time.

---

## ⚠️ Common Issues

### Issue 1: "Permission denied" when running script
```bash
chmod +x fix-email-on-droplet.sh
```

### Issue 2: "Email authentication failed"
**Cause:** Gmail App Password expired or wrong

**Fix:**
1. Go to https://myaccount.google.com/apppasswords
2. Generate NEW app password (16 characters)
3. SSH into droplet:
   ```bash
   ssh root@165.22.127.196
   cd /var/www/abcotronics-erp
   nano .env
   # Update SMTP_PASS line
   pm2 restart abcotronics-erp
   ```

### Issue 3: Changes don't take effect
**Cause:** App not restarted properly

**Fix:**
```bash
ssh root@165.22.127.196
pm2 restart abcotronics-erp
pm2 logs abcotronics-erp --lines 20
```

### Issue 4: Email goes to spam
**Solutions:**
- Check spam folder
- Add sender to contacts
- Consider SPF/DKIM records (advanced)

---

## 📊 Monitoring & Debugging

### View Live Logs
```bash
ssh root@165.22.127.196 'pm2 logs abcotronics-erp'
```
(Press Ctrl+C to exit)

### View Last 50 Lines
```bash
ssh root@165.22.127.196 'pm2 logs abcotronics-erp --lines 50'
```

### Check Environment Variables
```bash
ssh root@165.22.127.196 'cat /var/www/abcotronics-erp/.env | grep SMTP'
```

### Check if App is Running
```bash
ssh root@165.22.127.196 'pm2 status'
```

---

## 🎯 Testing Checklist

- [ ] Run `./fix-email-on-droplet.sh` (or manual SSH method)
- [ ] Verify script shows "✅ Email configuration complete!"
- [ ] Check PM2 status shows app as "online"
- [ ] Check logs for "Email service ready"
- [ ] Send test invitation using diagnostic tool
- [ ] Verify email arrives in inbox/spam within 1 minute
- [ ] Try re-sending existing invitations from ERP

---

## 📝 What's Happening

**Before fix:**
- ✅ App running on droplet
- ✅ Invitations created in database
- ❌ No SMTP variables in .env
- ❌ Emails not sent

**After fix:**
- ✅ SMTP variables added to .env
- ✅ App restarted with new config
- ✅ Email service initialized
- ✅ Invitations sent via email

---

## 🔗 Manual Invitation Links

Even without email, you can share links manually:

1. Create invitation in ERP
2. Check browser console for invitation link
3. Copy link (format: `https://abcoafrica.co.za/accept-invitation?token=XXXX`)
4. Send via WhatsApp/SMS/Slack
5. User clicks link and sets password

---

## 💡 Alternative: SendGrid (Recommended for Production)

Gmail has limits (500 emails/day). For production:

1. Sign up for SendGrid (free: 100 emails/day)
2. Get API key
3. SSH into droplet:
   ```bash
   ssh root@165.22.127.196
   cd /var/www/abcotronics-erp
   nano .env
   ```
4. Update variables:
   ```
   SMTP_HOST="smtp.sendgrid.net"
   SMTP_PORT="587"
   SMTP_USER="apikey"
   SMTP_PASS="SG.your-api-key-here"
   ```
5. Restart: `pm2 restart abcotronics-erp`

---

## 🆘 Still Not Working?

1. Run diagnostic tool:
   ```bash
   open diagnostics/email-invitation-tester.html
   ```

2. Check server logs:
   ```bash
   ssh root@165.22.127.196 'pm2 logs abcotronics-erp --lines 100'
   ```

3. Share:
   - Screenshot of diagnostic tool result
   - Last 50 lines of logs
   - Any error messages

---

## ✅ Success Indicators

You'll know it's fixed when:
- ✅ Script shows "Email configuration complete!"
- ✅ PM2 logs show "Email service ready to send messages"
- ✅ Test invitation shows "Email Status: ✅ SENT SUCCESSFULLY"
- ✅ Email arrives in inbox within 1 minute
- ✅ No errors in server logs

**Expected timeline:** Email should arrive within 5-60 seconds of sending invitation.

---

## 🚀 Quick Command Reference

```bash
# Fix emails (automated)
./fix-email-on-droplet.sh

# Check status
ssh root@165.22.127.196 'pm2 status'

# View logs
ssh root@165.22.127.196 'pm2 logs abcotronics-erp --lines 50'

# Restart app
ssh root@165.22.127.196 'pm2 restart abcotronics-erp'

# Check .env file
ssh root@165.22.127.196 'cat /var/www/abcotronics-erp/.env | grep SMTP'
```
