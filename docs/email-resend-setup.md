# Email Delivery Setup (Resend)

Use this guide to configure Resend API for transactional emails in both local development and on the Droplet.

## Why Resend?

- ✅ **Modern API** - Developer-friendly, simple integration
- ✅ **Free Tier** - 3,000 emails/month, 100 emails/day
- ✅ **Works on DigitalOcean** - HTTP API bypasses SMTP port blocking
- ✅ **Great Deliverability** - Reliable email delivery
- ✅ **Simple Setup** - Just one API key needed

## Quick Setup

### 1. Sign Up for Resend

1. Go to https://resend.com/signup
2. Create a free account
3. Verify your email address

### 2. Get Your API Key

1. Go to https://resend.com/api-keys
2. Click "Create API Key"
3. Give it a name (e.g., "Abcotronics ERP")
4. Copy the API key (starts with `re_`)

### 3. Verify Your Domain (Required for Production)

1. Go to https://resend.com/domains
2. Click "Add Domain"
3. Enter your domain (e.g., `abcotronics.co.za`)
4. Add the DNS records provided by Resend to your domain's DNS settings
5. Wait for verification (usually a few minutes)

**Note:** For testing, you can use Resend's test domain, but you'll need to verify your own domain for production use.

### 4. Configure Environment Variables

Add to your `.env` file:

```bash
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM=noreply@abcotronics.co.za
EMAIL_REPLY_TO=garethm@abcotronics.co.za
```

**Important:** The `EMAIL_FROM` address must use a domain you've verified in Resend.

### 5. Deploy to Droplet

The `deploy-to-droplet.sh` script will automatically sync `RESEND_API_KEY` if you export it before running:

```bash
export RESEND_API_KEY="re_your_api_key_here"
export EMAIL_FROM="noreply@abcotronics.co.za"
./deploy-to-droplet.sh
```

Or manually add to `.env` on the droplet:

```bash
ssh root@165.22.127.196
cd /var/www/abcotronics-erp
nano .env
# Add RESEND_API_KEY=re_your_api_key_here
pm2 restart abcotronics-erp --update-env
```

## Testing

### Test Email Sending

Run the test script:

```bash
node send-test-email.js
```

Or use the test endpoint:

```bash
curl http://localhost:3000/api/test-email
```

### Check Resend Dashboard

1. Go to https://resend.com/emails
2. View sent emails, delivery status, and any errors

## Priority Order

The system checks email providers in this order:

1. **Resend** (if `RESEND_API_KEY` is set) - ✅ Preferred
2. **SendGrid** (if `SENDGRID_API_KEY` is set)
3. **SMTP** (if `SMTP_USER` and `SMTP_PASS` are set)

## Troubleshooting

### "Resend API error: domain not verified"

**Solution:** Verify your sending domain in Resend dashboard:
1. Go to https://resend.com/domains
2. Add and verify your domain
3. Make sure `EMAIL_FROM` uses the verified domain

### "Email configuration not available"

**Solution:** Make sure `RESEND_API_KEY` is set in your `.env` file:
```bash
RESEND_API_KEY=re_your_api_key_here
```

### Emails not sending

1. Check Resend dashboard: https://resend.com/emails
2. Verify API key is correct (starts with `re_`)
3. Check domain verification status
4. Review server logs: `pm2 logs abcotronics-erp`

## Migration from SendGrid

If you're currently using SendGrid and want to switch to Resend:

1. Get your Resend API key
2. Add `RESEND_API_KEY` to `.env`
3. Keep `SENDGRID_API_KEY` as backup (or remove it)
4. Restart the server

Resend will be used automatically (higher priority than SendGrid).

## Free Tier Limits

- **3,000 emails/month** (free tier)
- **100 emails/day** (free tier)
- Upgrade for more: https://resend.com/pricing

## Support

- Resend Docs: https://resend.com/docs
- Resend Dashboard: https://resend.com
- API Reference: https://resend.com/docs/api-reference/emails/send-email
