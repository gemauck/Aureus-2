# Helpdesk Email Integration Setup Guide

This guide explains how to set up email-to-ticket integration so that emails sent to `support@abcotronics.co.za` automatically create tickets in the helpdesk system.

## Overview

The system supports multiple email service providers:
- **SendGrid Inbound Parse** (Recommended)
- **Mailgun Routes**
- **Resend Webhooks**

Each new email creates a new ticket. Replies to emails are automatically added as comments to the existing ticket.

## How It Works

1. **New Email** → Creates a new ticket with:
   - Subject as ticket title
   - Email body as description
   - Sender email as source
   - Attachments (if any)

2. **Email Reply** → Adds a comment to the existing ticket:
   - Detects thread using `In-Reply-To` or `References` headers
   - Adds reply as a comment
   - Logs activity

## Setup Instructions

### Option 1: SendGrid Inbound Parse (Recommended)

SendGrid is already configured in your system for sending emails. You can use it for receiving too.

#### Step 1: Enable Inbound Parse in SendGrid

1. Log in to [SendGrid Dashboard](https://app.sendgrid.com/)
2. Go to **Settings** → **Inbound Parse**
3. Click **Add Host & URL**
4. Configure:
   - **Subdomain**: `support` (or leave blank for root domain)
   - **Domain**: `abcotronics.co.za`
   - **Destination URL**: `https://abcoafrica.co.za/api/helpdesk/email-webhook`
   - **Check "POST the raw, full MIME message"**
   - **Spam Check**: Enable (optional)
5. Click **Add**

#### Step 2: Configure DNS

SendGrid will provide DNS records to add. Add these to your DNS provider:

```
Type: MX
Host: @ (or support if using subdomain)
Value: mx.sendgrid.net
Priority: 10
```

#### Step 3: Verify Setup

1. Send a test email to `support@abcotronics.co.za`
2. Check the helpdesk - a new ticket should appear
3. Reply to the email - it should appear as a comment

### Option 2: Mailgun Routes

#### Step 1: Set Up Mailgun Domain

1. Sign up at [Mailgun](https://www.mailgun.com/)
2. Add your domain `abcotronics.co.za`
3. Verify domain ownership (add DNS records)

#### Step 2: Create Route

1. Go to **Receiving** → **Routes**
2. Click **Create Route**
3. Configure:
   - **Filter**: `match_recipient("support@abcotronics.co.za")`
   - **Action**: `forward("https://abcoafrica.co.za/api/helpdesk/email-webhook")`
4. Save route

#### Step 3: Configure DNS

Add MX record:
```
Type: MX
Host: @
Value: mxa.mailgun.org
Priority: 10
```

### Option 3: Resend Webhooks

#### Step 1: Set Up Resend Domain

1. Log in to [Resend](https://resend.com/)
2. Add domain `abcotronics.co.za`
3. Verify domain (add DNS records)

#### Step 2: Configure Webhook

1. Go to **Webhooks**
2. Click **Add Webhook**
3. Configure:
   - **URL**: `https://abcoafrica.co.za/api/helpdesk/email-webhook`
   - **Events**: Select `email.received`
4. Save webhook

#### Step 3: Configure DNS

Add MX record:
```
Type: MX
Host: @
Value: feedback-smtp.resend.com
Priority: 10
```

## Webhook Endpoint

The webhook endpoint is:
```
POST https://abcoafrica.co.za/api/helpdesk/email-webhook
```

**No authentication required** - the endpoint validates that emails are sent to `support@abcotronics.co.za`.

## Email Threading

The system uses email headers to detect replies:
- **Message-ID**: Unique identifier for each email
- **In-Reply-To**: Links reply to original message
- **References**: Chain of message IDs in conversation

When a reply is detected:
1. System finds the original ticket by `emailThreadId` or `emailMessageId`
2. Adds the reply as a comment
3. Updates the ticket's activity log

## Ticket Creation from Email

When a new email arrives:
- **Title**: Email subject
- **Description**: Email body (plain text or HTML stripped)
- **Status**: `open`
- **Priority**: `medium`
- **Category**: `general`
- **Type**: `email`
- **Source Email**: Sender's email address
- **Created By**: User account (created if doesn't exist as guest)
- **Attachments**: Parsed and stored

## User Creation

If the email sender doesn't have an account:
- A guest user account is automatically created
- Email: Sender's email address
- Name: Extracted from email or email username
- Role: `guest`
- Status: `active`

## Testing

### Test New Ticket Creation

1. Send an email to `support@abcotronics.co.za`:
   ```
   Subject: Test Ticket
   Body: This is a test email to create a ticket.
   ```

2. Check the helpdesk - you should see a new ticket with:
   - Title: "Test Ticket"
   - Description: "This is a test email to create a ticket."
   - Source: Your email address

### Test Email Reply

1. Reply to the email you just sent
2. Check the ticket in helpdesk
3. You should see your reply as a comment

## Troubleshooting

### Emails Not Creating Tickets

1. **Check webhook logs**:
   ```bash
   ssh root@abcoafrica.co.za
   tail -f /root/.pm2/logs/abcotronics-erp-out-0.log | grep "email-webhook"
   ```

2. **Verify webhook URL**:
   - Make sure the webhook URL in your email service matches: `https://abcoafrica.co.za/api/helpdesk/email-webhook`

3. **Check DNS**:
   - Verify MX records are correctly configured
   - Use `dig MX abcotronics.co.za` to check

4. **Test webhook manually**:
   ```bash
   curl -X POST https://abcoafrica.co.za/api/helpdesk/email-webhook \
     -H "Content-Type: application/json" \
     -d '{
       "from": "test@example.com",
       "to": "support@abcotronics.co.za",
       "subject": "Test",
       "text": "Test body"
     }'
   ```

### Replies Not Appearing as Comments

1. **Check email headers**:
   - Make sure your email client includes `In-Reply-To` or `References` headers
   - Some email services strip these headers

2. **Check thread detection**:
   - Look for logs: `📧 Email reply to ticket TKT-XXXX-XXXX`
   - If you see `📧 Creating new ticket from email`, thread detection failed

### Attachments Not Working

1. **Check webhook format**:
   - Different email services send attachments in different formats
   - Check server logs for attachment parsing errors

2. **Verify attachment size**:
   - Some services have size limits
   - Large attachments may be stripped

## Security Considerations

1. **Webhook Validation**: Consider adding webhook signature validation
2. **Rate Limiting**: The endpoint should have rate limiting (already configured in Express)
3. **Spam Filtering**: Enable spam checking in your email service
4. **Email Validation**: Only process emails sent to `support@abcotronics.co.za`

## Database Migration

After setting up, run the migration to add email fields to the Ticket model:

```bash
npx prisma migrate dev --name add_email_fields_to_ticket
```

Or on production:
```bash
npx prisma migrate deploy
npx prisma generate
pm2 restart abcotronics-erp
```

## Next Steps

1. Set up email service webhook (choose one of the options above)
2. Configure DNS records
3. Run database migration
4. Test with a real email
5. Monitor logs for any issues

## Support

If you encounter issues:
1. Check server logs: `pm2 logs abcotronics-erp`
2. Check webhook delivery in your email service dashboard
3. Test the webhook endpoint manually
4. Verify DNS configuration















