# Resend DNS Records Fix for abcotronics.co.za

## Current Issue

Your domain `abcotronics.co.za` already has an SPF record for Outlook/Google:
```
v=spf1 include:spf.protection.outlook.com include:_spf.google.com -all
```

## Solution: Update SPF Record to Include Resend

You need to **modify** your existing SPF record to include Resend, not create a new one.

### Step 1: Get Resend DNS Records

1. Go to https://resend.com/domains
2. Click on `abcotronics.co.za` (or add it if not added)
3. Copy the DNS records Resend provides:
   - **SPF Record** (TXT)
   - **DKIM Record** (TXT)
   - **MX Record** (MX)

### Step 2: Update SPF Record

Your SPF record needs to include Resend. It should look like:

```
v=spf1 include:spf.protection.outlook.com include:_spf.google.com include:_spf.resend.com ~all
```

**Important:** 
- Keep your existing Outlook and Google includes
- Add `include:_spf.resend.com` 
- Change `-all` to `~all` (soft fail instead of hard fail) - this is safer

### Step 3: Add DKIM Record

Resend will provide a DKIM record that looks like:
```
TXT record: _resend._domainkey.abcotronics.co.za
Value: (provided by Resend)
```

Add this as a **new TXT record** (don't modify existing ones).

### Step 4: Add MX Record

Resend will provide an MX record:
```
MX record: @ (or abcotronics.co.za)
Priority: (provided by Resend)
Value: (provided by Resend)
```

**Note:** If you already have MX records for email hosting, you can add Resend's MX record with a lower priority (higher number).

### Step 5: Update DNS in Your Provider

**If using Cloudflare:**
1. Log in to Cloudflare
2. Select `abcotronics.co.za`
3. Go to DNS → Records
4. Find your existing SPF TXT record
5. Click "Edit"
6. Update the value to include Resend (see Step 2)
7. Add new TXT record for DKIM
8. Add new MX record for Resend
9. Save all changes

**If using another DNS provider:**
- Follow similar steps
- Modify existing SPF record
- Add new DKIM and MX records

### Step 6: Verify in Resend

1. Wait 5-15 minutes for DNS propagation
2. Go to https://resend.com/domains
3. Click "Verify DNS Records"
4. Check status

## Alternative: Use Subdomain (Easier)

If updating the root domain is complicated, use a subdomain:

### Option A: Use `mail.abcotronics.co.za`

1. **In Resend:**
   - Add domain: `mail.abcotronics.co.za`
   - Get DNS records for this subdomain

2. **In Your DNS Provider:**
   - Add all records for `mail.abcotronics.co.za` subdomain
   - No conflicts with existing records

3. **Update .env:**
   ```bash
   EMAIL_FROM="noreply@mail.abcotronics.co.za"
   ```

### Option B: Use `email.abcotronics.co.za`

Same process as Option A, just use `email.abcotronics.co.za` instead.

## Quick Check Commands

After adding records, verify they're visible:

```bash
# Check SPF (should include _spf.resend.com)
dig TXT abcotronics.co.za +short | grep spf

# Check DKIM (replace selector with Resend's)
dig TXT _resend._domainkey.abcotronics.co.za +short

# Check MX
dig MX abcotronics.co.za +short
```

## Still Having Issues?

1. **Check Resend Dashboard:**
   - Go to https://resend.com/domains
   - Click on your domain
   - Look for specific error messages
   - Resend will tell you which record is missing/incorrect

2. **Use DNS Checker:**
   - https://dns.email - Enter your domain and check all records
   - https://mxtoolbox.com - Check SPF, DKIM, MX records

3. **Contact Support:**
   - Resend support: support@resend.com
   - Include your domain and any error messages

## Temporary Workaround

While fixing verification, you can still send emails to your verified address:
- Emails to `garethm@abcotronics.co.za` will work
- Other recipients require domain verification







