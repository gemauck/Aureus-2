# Resend Domain Verification Troubleshooting Guide

## Common Issues and Solutions

### Issue 1: DNS Records Not Propagating

**Problem:** DNS records added but verification still fails after 15+ minutes.

**Solutions:**
1. **Check DNS Propagation:**
   - Use https://dns.email to check if your DNS records are publicly visible
   - Enter your domain and check for SPF, DKIM, and MX records
   - Records should match exactly what Resend provided

2. **Wait for Propagation:**
   - DNS changes can take up to 72 hours to propagate globally
   - Most changes propagate within 15 minutes to 2 hours
   - If it's been less than 24 hours, wait a bit longer

3. **Verify Record Values:**
   - Make sure you copied the exact values from Resend
   - Check for extra spaces or typos
   - Some DNS providers auto-append domain names - add a trailing period (.) to prevent this

### Issue 2: DNS Provider Auto-Appending Domain

**Problem:** Your DNS provider automatically appends your domain name to record values.

**Solution:**
- Add a trailing period (.) at the end of the record value
- Example: If Resend says `v=spf1 include:_spf.resend.com ~all`
- Add it as: `v=spf1 include:_spf.resend.com ~all.` (note the period at the end)

### Issue 3: Missing Required DNS Records

**Problem:** Not all required records are added.

**Required Records:**
1. **SPF (TXT record)** - Authorizes Resend to send emails
2. **DKIM (TXT record)** - Ensures email integrity
3. **MX record** - For bounce/complaint feedback

**Solution:**
- Go to https://resend.com/domains
- Click on your domain
- Copy ALL the DNS records shown
- Add each one to your DNS provider

### Issue 4: Using Wrong Record Type

**Problem:** Added records but used wrong type (e.g., CNAME instead of TXT).

**Solution:**
- SPF and DKIM must be **TXT records**
- MX must be **MX record**
- Check your DNS provider to ensure correct record types

### Issue 5: Domain Already in Use

**Problem:** Domain is already verified in another Resend account or email service.

**Solution:**
- Check if domain is verified elsewhere
- Remove old DNS records if switching from another service
- Contact Resend support if needed

## Step-by-Step Verification Process

### Step 1: Add Domain in Resend
1. Go to https://resend.com/domains
2. Click "Add Domain"
3. Enter `abcotronics.co.za` (or use a subdomain like `mail.abcotronics.co.za`)
4. Click "Add"

### Step 2: Get DNS Records
1. Resend will show you the required DNS records
2. You'll see:
   - **SPF Record** (TXT type)
   - **DKIM Record** (TXT type) 
   - **MX Record** (MX type)
3. Copy each record exactly as shown

### Step 3: Add to Your DNS Provider

**For Cloudflare:**
1. Log in to Cloudflare
2. Select your domain
3. Go to DNS → Records
4. Click "Add record"
5. For each record:
   - **Type:** Select TXT (for SPF/DKIM) or MX (for MX)
   - **Name:** Enter the hostname (e.g., `@` for root, or `_resend` for subdomain)
   - **Content/Value:** Paste the exact value from Resend
   - **TTL:** Auto or 3600
6. Click "Save"

**For Other DNS Providers:**
- Follow similar steps
- Make sure to use the exact record types and values
- Some providers may have different field names (e.g., "Host" instead of "Name")

### Step 4: Verify in Resend
1. Wait 5-15 minutes for DNS propagation
2. Go back to https://resend.com/domains
3. Click "Verify DNS Records" or "Check Status"
4. Resend will check if records are visible

### Step 5: Troubleshoot if Still Failing

**Check DNS Records Publicly:**
1. Go to https://dns.email
2. Enter your domain: `abcotronics.co.za`
3. Check if SPF, DKIM, and MX records are visible
4. Compare values with what Resend provided

**Common Mistakes to Check:**
- ✅ Record type is correct (TXT for SPF/DKIM, MX for MX)
- ✅ Hostname/Name field is correct
- ✅ Value matches exactly (no extra spaces)
- ✅ Trailing period added if DNS provider auto-appends domain
- ✅ All three records are added (SPF, DKIM, MX)

## Alternative: Use a Subdomain

If root domain verification is problematic, use a subdomain:

1. **Add subdomain in Resend:**
   - Use `mail.abcotronics.co.za` or `email.abcotronics.co.za`
   - Easier to verify and doesn't affect main domain

2. **Update EMAIL_FROM:**
   ```bash
   EMAIL_FROM="noreply@mail.abcotronics.co.za"
   ```

3. **Benefits:**
   - Isolated from main domain
   - Easier DNS management
   - Can segment sending reputation

## Quick DNS Check Commands

Check if your DNS records are visible:

```bash
# Check SPF record
dig TXT abcotronics.co.za | grep spf

# Check DKIM record (replace with your DKIM selector)
dig TXT _resend._domainkey.abcotronics.co.za

# Check MX record
dig MX abcotronics.co.za
```

Or use online tools:
- https://dns.email
- https://mxtoolbox.com
- https://www.whatsmydns.net

## Still Not Working?

1. **Contact Resend Support:**
   - Email: support@resend.com
   - Include your domain name and API key (they can check status)

2. **Check Resend Dashboard:**
   - Go to https://resend.com/domains
   - Click on your domain
   - Look for specific error messages
   - Resend often provides helpful error details

3. **Temporary Workaround:**
   - For now, emails will only send to your verified email (garethm@abcotronics.co.za)
   - This works for testing and internal emails
   - Complete domain verification for production use

## Need Help?

If you're still stuck, provide:
1. Your DNS provider (Cloudflare, Namecheap, etc.)
2. Screenshot of DNS records in Resend dashboard
3. Screenshot of DNS records in your DNS provider
4. Any error messages from Resend


