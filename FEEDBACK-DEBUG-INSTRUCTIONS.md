# Feedback Email Debug Instructions

## Issue: Feedback submitted but no email received

## ✅ What We Know
- Direct test emails work ✅
- SendGrid is configured correctly ✅  
- Admin user email: `garethm@abcotronics.co.za` ✅

## 🔍 Debug Steps

### Step 1: Check Server Logs When Submitting Feedback

When you submit feedback through the widget, **watch your server console/logs**. You should see these messages in order:

```
📝 Feedback created, triggering email notification...
📝 Feedback data: {...}
📧 Starting feedback email notification process...
📧 Found X admin(s) to notify: ...
📧 Attempting to send feedback email to ...
✅ Feedback email sent successfully...
```

**If you DON'T see these logs:**
- The notification function isn't being called
- Check if feedback was actually saved to database
- Check if there are any errors in server logs

### Step 2: Check What Logs You DO See

**If you see:**
```
⚠️ No admin users found for feedback notification
```
→ Admin user not found in database
→ Check admin user role/status/email

**If you see:**
```
📧 Found 0 admin(s) to notify
```
→ Admins found but no email addresses
→ Check admin user has email set

**If you see:**
```
❌ Failed to send feedback notification
```
→ Email sending failed
→ Check error details in logs

**If you see NOTHING:**
→ The notification function isn't being called
→ Check if feedback endpoint is being hit
→ Check server logs for any errors

### Step 3: Check SendGrid Activity Feed

Go to: https://app.sendgrid.com/activity

Look for emails sent when you submit feedback:
- ✅ **Email appears** = It's being sent, check inbox/spam
- ❌ **No email** = Not being sent from server, check logs

### Step 4: Verify Admin User Configuration

The system looks for users with:
- `role: 'admin'` (or 'ADMIN' or 'Admin' - case-insensitive now)
- `status: 'active'` (or 'Active' or 'ACTIVE' - case-insensitive now)
- Valid email address

### Step 5: Manual Test

1. Open browser console (F12)
2. Submit feedback through widget
3. Check browser console for any errors
4. Check server console for logs
5. Check SendGrid Activity Feed

## 🔧 Most Likely Issues

### Issue 1: Admin User Not Found
**Solution:** Verify admin user in database:
- Email: `garethm@abcotronics.co.za`
- Role: `admin` (lowercase)
- Status: `active` (lowercase)

### Issue 2: Email Being Filtered
**Solution:** Check spam/junk folder

### Issue 3: Server Environment Variables
**Solution:** Ensure production server has:
- `SENDGRID_API_KEY` or `SMTP_PASS` with SendGrid key
- `EMAIL_FROM=garethm@abcotronics.co.za`

### Issue 4: Notification Function Not Called
**Solution:** Check server logs - if you see "Feedback created" but no "Starting feedback email notification", there's an issue with the function call

## 📋 What to Report Back

When you submit feedback and check logs, tell me:

1. **What logs do you see?** (copy/paste the relevant lines)
2. **Do you see "Starting feedback email notification"?**
3. **Do you see "Found X admin(s) to notify"?**
4. **Any error messages?**
5. **Does SendGrid Activity Feed show an email?**

This will help identify the exact issue!

---

**Next Action:** Submit feedback and immediately check your server logs/console output.

