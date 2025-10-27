# Email Configuration Setup Guide for User Invitations

## Current Status
- ✅ Database structure ready (Invitation table)
- ✅ API endpoints configured (/api/users/invite)
- ✅ Frontend UI implemented
- ⚠️ Email configuration needed for automatic email sending

## Quick Setup for Gmail

### Step 1: Generate Gmail App Password
1. Go to https://myaccount.google.com/apppasswords
2. Sign in with your Gmail account (gemauck@gmail.com)
3. Under "Select app", choose "Mail"
4. Under "Select device", choose "Other" and enter "Abcotronics ERP"
5. Click "Generate"
6. **Copy the 16-character password** (it will look like: xxxx xxxx xxxx xxxx)

### Step 2: Update .env File
Open `/abcotronics-erp-modular/.env` and replace the placeholder:

```bash
# Replace this line:
SMTP_PASS="YOUR_NEW_APP_PASSWORD_HERE"

# With your actual app password (no spaces):
SMTP_PASS="xxxxxxxxxxxxxx"
```

### Step 3: Restart Your Server
```bash
# Stop your current server (Ctrl+C)
# Then start it again:
npm run dev
```

## Testing the Email Functionality

1. Open the User Management page in your ERP
2. Click "Invite User"
3. Fill in test details:
   - Name: Test User
   - Email: your-test-email@example.com
   - Role: User
4. Click "Send Email Invitation"
5. Check the result modal:
   - ✅ Green success = Email sent successfully
   - ⚠️ Yellow warning = Email not configured (local mode)
   - ❌ Red error = Email configuration problem

## What Happens in Local vs Production?

### Local Development (Current):
- Invitations are created in database ✅
- Invitations appear in "Pending Invitations" table ✅
- Email **may not send** if SMTP not configured ⚠️
- You get a shareable invitation link you can send manually ✅
- Full diagnostic information shown in modal ✅

### Production (Railway):
- All of the above ✅
- Plus: Emails automatically sent via Gmail ✅
- Professional invitation emails with company branding ✅
- 7-day expiring invitation links ✅

## Troubleshooting

### Issue: "Email not sent" in local development
**Expected Behavior**: This is normal if you haven't configured SMTP yet. The invitation is still created and you can share the link manually.

**Solution**: Follow Step 1 and 2 above to configure Gmail app password.

### Issue: "Failed to send invitation email" error
**Possible Causes**:
1. Gmail app password not generated or incorrect
2. Gmail account has 2FA disabled (required for app passwords)
3. Network firewall blocking SMTP port 587

**Solutions**:
1. Verify app password is correct (no spaces, 16 characters)
2. Enable 2-factor authentication on your Google account
3. Check if port 587 is open: `telnet smtp.gmail.com 587`

### Issue: Invitation created but doesn't appear in table
**Solution**: 
1. Check browser console for errors (F12)
2. Refresh the page to reload data
3. Check database directly: `sqlite3 prisma/dev.db "SELECT * FROM Invitation;"`

## Email Configuration Variables Explained

```bash
SMTP_HOST="smtp.gmail.com"           # Gmail SMTP server
SMTP_PORT=587                        # Standard SMTP port (TLS)
SMTP_USER="gemauck@gmail.com"        # Your Gmail address
SMTP_PASS="xxxxxxxxxxxxxx"           # Gmail App Password (16 chars)
EMAIL_FROM="gemauck@gmail.com"       # "From" address in emails
```

## Production Deployment Notes

When deploying to Railway:
1. Set all SMTP_* environment variables in Railway dashboard
2. Use production Gmail account or dedicated email service
3. Test email sending in production environment
4. Monitor email delivery logs

## Alternative Email Services

If you prefer not to use Gmail, you can use:
- **SendGrid**: More reliable for production, free tier available
- **Mailgun**: Developer-friendly, good deliverability
- **AWS SES**: Very cheap, requires AWS account
- **SMTP2GO**: Good free tier, easy setup

Update .env accordingly:
```bash
SMTP_HOST="smtp.sendgrid.net"
SMTP_PORT=587
SMTP_USER="apikey"
SMTP_PASS="your-sendgrid-api-key"
```

## Security Best Practices

1. **Never commit .env files to git** - Already in .gitignore
2. **Use app passwords, not account passwords**
3. **Rotate passwords regularly**
4. **Use different credentials for dev vs production**
5. **Enable 2FA on email accounts**

## Quick Checklist

- [ ] Gmail account has 2FA enabled
- [ ] App password generated
- [ ] .env file updated with app password
- [ ] Server restarted
- [ ] Test invitation sent successfully
- [ ] Email received at test address

## Support

If you still have issues after following this guide:
1. Check browser console for detailed error messages
2. Check server logs for SMTP connection errors
3. Verify Gmail app password is active and correct
4. Test SMTP connection manually using telnet

For production email issues, check:
- Railway environment variables are set
- Railway logs for email sending errors
- Email deliverability (spam folder, etc.)
