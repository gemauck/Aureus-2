# Email Production Issue - Solution Guide

## Problem
Email invitations are not being sent from the production droplet (abcoafrica.co.za). The SMTP connection to Gmail is timing out.

## Root Cause
The Digital Ocean droplet cannot establish outbound connections to Gmail's SMTP servers (both port 587 and 465 timeout). This is likely due to:
1. Network-level blocking from Digital Ocean (common for SMTP to prevent spam)
2. Gmail blocking the server IP
3. Firewall/security policies

## Current Status
- ✅ Email configuration is properly set on the droplet
- ✅ SMTP credentials are correct (tested locally)
- ❌ Connection to smtp.gmail.com times out from production server
- ✅ Local email sending works perfectly

## Solutions

### Option 1: Use SendGrid (Recommended for Production) ⭐

**Why SendGrid?**
- Designed for cloud servers and transactional emails
- More reliable than Gmail SMTP for production
- Better deliverability rates
- Free tier: 100 emails/day
- Easy integration

**Setup Steps:**

1. **Sign up for SendGrid** (free): https://signup.sendgrid.com/

2. **Create an API Key:**
   - Go to Settings → API Keys
   - Create a new key with "Full Access" or "Mail Send" permissions
   - Copy the API key

3. **Update droplet configuration:**
   ```bash
   # SSH into droplet
   ssh root@165.22.127.196
   cd /var/www/abcotronics-erp
   
   # Update .env file
   nano .env
   ```

4. **Change these variables:**
   ```bash
   SMTP_HOST=smtp.sendgrid.net
   SMTP_PORT=587
   SMTP_USER=apikey
   SMTP_PASS=YOUR_SENDGRID_API_KEY_HERE
   EMAIL_FROM=noreply@abcotronics.co.za
   ```

5. **Restart the app:**
   ```bash
   pm2 restart abcotronics-erp --update-env
   ```

### Option 2: Use Mailgun

**Setup:**
1. Sign up at https://www.mailgun.com/
2. Verify your domain (abcoafrica.co.za) or use sandbox domain for testing
3. Get your SMTP credentials
4. Update .env:
   ```bash
   SMTP_HOST=smtp.mailgun.org
   SMTP_PORT=587
   SMTP_USER=postmaster@your-domain.mailgun.org
   SMTP_PASS=your-mailgun-password
   EMAIL_FROM=noreply@abcotronics.co.za
   ```

### Option 3: Use AWS SES

**Pros:**
- Very cheap ($0.10 per 1000 emails)
- High deliverability
- Requires AWS account

**Setup:**
1. Create AWS account
2. Set up SES in a region (e.g., us-east-1)
3. Verify your sending email or domain
4. Get SMTP credentials
5. Update .env:
   ```bash
   SMTP_HOST=email-smtp.us-east-1.amazonaws.com
   SMTP_PORT=587
   SMTP_USER=your-ses-smtp-username
   SMTP_PASS=your-ses-smtp-password
   EMAIL_FROM=verified-email@yourdomain.com
   ```

### Option 4: Contact Digital Ocean Support

If you prefer to keep using Gmail:
1. Open a support ticket with Digital Ocean
2. Request to allow outbound SMTP connections on ports 587/465
3. They may require justification for email sending

## Testing After Setup

Once you've configured an alternative email service, test it:

```bash
curl -X POST https://abcoafrica.co.za/api/test-email \
  -H "Content-Type: application/json" \
  -d '{"email":"gemauck@gmail.com","name":"Test","role":"user"}'
```

Check your inbox - the email should arrive within seconds.

## Quick Script: Switch to SendGrid

I've created a script to easily switch to SendGrid. After you get your SendGrid API key:

```bash
# Edit the script and add your SendGrid API key
nano switch-to-sendgrid.sh
# Run it
./switch-to-sendgrid.sh
```

## Recommendation

For a production ERP system, **SendGrid** is the best choice:
- ✅ Reliable and fast
- ✅ Good free tier (100 emails/day)
- ✅ Designed for transactional emails
- ✅ Easy setup
- ✅ Good deliverability
- ✅ Analytics dashboard

The free tier should be sufficient for most invitation needs.

