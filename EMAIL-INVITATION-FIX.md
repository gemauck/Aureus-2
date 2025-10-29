# 📧 EMAIL INVITATION FIX GUIDE

## Problem
You have 2 pending invitations in the system, but the invited users didn't receive emails.

## Root Cause
Your **Railway production server doesn't have email environment variables set**. Your local `.env` has them, but Railway needs them separately.

---

## ✅ QUICK FIX (5 minutes)

### Step 1: Set Email Variables on Railway

```bash
# Copy-paste this command (all at once):
railway variables set \
  SMTP_HOST="smtp.gmail.com" \
  SMTP_PORT="587" \
  SMTP_USER="gemauck@gmail.com" \
  SMTP_PASS="psrbqbzifyooosfx" \
  EMAIL_FROM="garethm@abcotronics.co.za" \
  EMAIL_REPLY_TO="garethm@abcotronics.co.za"
```

### Step 2: Restart Railway Service

```bash
railway restart
```

### Step 3: Test Email Sending

Option A - Use Diagnostic Tool:
```bash
open diagnostics/email-invitation-tester.html
```

Option B - Re-send Invitation from ERP:
1. Go to Users page
2. Delete old invitation
3. Create new invitation
4. User should receive email within 1 minute

---

## 🔍 Verify It's Working

### Check Server Logs
```bash
railway logs --tail 50
```

**Look for:**
- ✅ "Email service ready to send messages" = Good!
- ✅ "Invitation email sent successfully" = Working!
- ❌ "Email authentication failed" = App password issue
- ❌ "Email configuration incomplete" = Variables not set

### Test in Browser
1. Open: `diagnostics/email-invitation-tester.html`
2. Click "Send Test Invitation"
3. Enter your email
4. Check if email arrives

---

## ⚠️ Common Issues

### Issue 1: "Email authentication failed"
**Cause:** Gmail App Password expired or wrong

**Fix:**
1. Go to https://myaccount.google.com/apppasswords
2. Generate NEW app password (16 characters)
3. Update Railway:
   ```bash
   railway variables set SMTP_PASS="xxxx-xxxx-xxxx-xxxx"
   railway restart
   ```

### Issue 2: "Email configuration incomplete"
**Cause:** Environment variables not set on Railway

**Fix:** Run Step 1 above

### Issue 3: Email goes to spam
**Cause:** Gmail sending from different reply-to address

**Solutions:**
- Check spam folder
- Add sender to contacts
- Consider using SendGrid/AWS SES for production

---

## 🎯 Testing Checklist

- [ ] Set Railway environment variables
- [ ] Restart Railway service
- [ ] Check server logs for "Email service ready"
- [ ] Send test invitation using diagnostic tool
- [ ] Verify email arrives in inbox/spam
- [ ] Try re-sending existing invitations

---

## 📝 What's Happening Now

**Current state:**
- ✅ Invitations ARE being created in database
- ✅ Invitation links ARE being generated
- ❌ Emails are NOT being sent (SMTP not configured)

**After fix:**
- ✅ Invitations will be created
- ✅ Emails WILL be sent automatically
- ✅ Users receive invitation link via email

---

## 🔗 Invitation Links

Even without email, you can share invitation links manually:

1. Create invitation in ERP
2. Copy the invitation link from response
3. Send link via WhatsApp/SMS/etc
4. User clicks link and sets password

**Format:** 
```
https://abcoafrica.co.za/accept-invitation?token=XXXX
```

---

## 💡 Alternative: Use SendGrid (Recommended for Production)

Gmail works for testing but has limits (500 emails/day). For production:

1. Sign up for SendGrid (free tier: 100 emails/day)
2. Get API key
3. Update environment variables:
   ```bash
   railway variables set \
     SMTP_HOST="smtp.sendgrid.net" \
     SMTP_PORT="587" \
     SMTP_USER="apikey" \
     SMTP_PASS="SG.your-api-key-here"
   ```

---

## 🆘 Still Not Working?

Run the diagnostic tool and share results:

```bash
open diagnostics/email-invitation-tester.html
```

Take a screenshot of:
1. "Send Test Invitation" result
2. Railway logs: `railway logs --tail 50`
3. Share both screenshots

---

## ✅ Success Indicators

You'll know it's fixed when:
- ✅ Railway logs show "Email service ready to send messages"
- ✅ Test invitation shows "Email Status: ✅ SENT SUCCESSFULLY"
- ✅ Email arrives in inbox within 1 minute
- ✅ No errors in server logs

**Expected timeline:** Email should arrive within 5-60 seconds of sending invitation.
