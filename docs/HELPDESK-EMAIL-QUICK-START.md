# Helpdesk Email Integration - Quick Start

## What This Does

✅ Emails to `support@abcotronics.co.za` automatically create tickets  
✅ Replies to emails automatically add comments to existing tickets  
✅ Each conversation thread is tracked as one ticket  

## Quick Setup (5 minutes)

### Step 1: Choose Email Service

**Recommended: SendGrid** (you already use it for sending)

1. Go to [SendGrid Dashboard](https://app.sendgrid.com/)
2. **Settings** → **Inbound Parse** → **Add Host & URL**
3. Configure:
   - **Domain**: `abcotronics.co.za`
   - **Destination URL**: `https://abcoafrica.co.za/api/helpdesk/email-webhook`
   - ✅ Check "POST the raw, full MIME message"
4. Copy the MX record provided

### Step 2: Add DNS Record

Add this MX record to your DNS (wherever you manage `abcotronics.co.za`):

```
Type: MX
Host: @
Value: mx.sendgrid.net
Priority: 10
```

### Step 3: Run Migration

```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp
npx prisma migrate deploy
npx prisma generate
pm2 restart abcotronics-erp
```

### Step 4: Test

1. Send an email to `support@abcotronics.co.za`
2. Check the helpdesk - ticket should appear!
3. Reply to the email - should appear as a comment!

## That's It! 🎉

For detailed setup instructions, see `docs/HELPDESK-EMAIL-SETUP.md`





