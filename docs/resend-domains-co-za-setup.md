# Resend DNS Setup for Domains.co.za

## Step-by-Step Guide for abcotronics.co.za

### Step 1: Get Resend DNS Records

1. Go to https://resend.com/domains
2. Click "Add Domain" (or click on existing domain)
3. Enter: `abcotronics.co.za`
4. Resend will show you **3 DNS records** to add:
   - **SPF Record** (TXT type)
   - **DKIM Record** (TXT type)
   - **MX Record** (MX type)
5. **Copy each record** - you'll need:
   - Record Type (TXT or MX)
   - Host/Name (e.g., `@` or `_resend._domainkey`)
   - Value/Content (the long string)

### Step 2: Access Domains.co.za DNS Management

1. Log in to https://www.domains.co.za
2. Go to: **Domains** → **Manage DNS**
3. Find `abcotronics.co.za` in your domain list
4. Click on it to view/edit DNS records

### Step 3: Update SPF Record (TXT)

**Current SPF Record:**
```
v=spf1 include:spf.protection.outlook.com include:_spf.google.com -all
```

**Action:**
1. Find your existing **TXT record** with the SPF value above
2. Click **Edit** on that record
3. Update the value to include Resend:
   ```
   v=spf1 include:spf.protection.outlook.com include:_spf.google.com include:_spf.resend.com ~all
   ```
4. **Important changes:**
   - Added: `include:_spf.resend.com`
   - Changed: `-all` to `~all` (soft fail - safer)
5. Click **Save**

### Step 4: Add DKIM Record (TXT)

**This is a NEW record - don't modify existing ones**

1. Click **Add Record** or **+**
2. Select **TXT** as record type
3. **Host/Name field:** Enter exactly what Resend provides (usually `_resend._domainkey` or similar)
4. **Value/Content field:** Paste the DKIM value from Resend (long string)
5. **TTL:** Leave default or set to 3600
6. Click **Save**

**Example:**
- Type: `TXT`
- Host: `_resend._domainkey`
- Value: `(long string from Resend)`

### Step 5: Add MX Record

**This is a NEW record**

1. Click **Add Record** or **+**
2. Select **MX** as record type
3. **Host/Name field:** Enter `@` (for root domain) or leave blank
4. **Priority field:** Enter the priority number Resend provides (usually `10`)
5. **Value/Content field:** Enter the MX value from Resend (usually something like `feedback-smtp.resend.com`)
6. Click **Save**

**Example:**
- Type: `MX`
- Host: `@`
- Priority: `10`
- Value: `feedback-smtp.resend.com`

### Step 6: Verify in Resend

1. Wait **5-15 minutes** for DNS propagation
2. Go back to https://resend.com/domains
3. Click on `abcotronics.co.za`
4. Click **"Verify DNS Records"** or **"Check Status"**
5. Resend will check if all records are visible

### Step 7: Troubleshooting

**If verification still fails after 15 minutes:**

1. **Check records are visible:**
   - Go to https://dns.email
   - Enter: `abcotronics.co.za`
   - Check if SPF, DKIM, and MX records show up
   - Compare values with what Resend expects

2. **Common issues:**
   - ✅ Make sure you **updated** the SPF (not created duplicate)
   - ✅ DKIM host/name must match exactly (case-sensitive)
   - ✅ No extra spaces in values
   - ✅ All 3 records are added (SPF, DKIM, MX)

3. **Check Resend dashboard:**
   - Resend will show which record is missing/incorrect
   - Look for specific error messages

## Alternative: Use Subdomain (Easier)

If root domain setup is complicated, use a subdomain:

### Setup `mail.abcotronics.co.za`

1. **In Resend:**
   - Add domain: `mail.abcotronics.co.za`
   - Get DNS records for this subdomain

2. **In Domains.co.za:**
   - Add all 3 records for `mail.abcotronics.co.za`
   - No conflicts with existing records

3. **Update .env:**
   ```bash
   EMAIL_FROM="noreply@mail.abcotronics.co.za"
   ```

## Quick Reference

**Records to Add/Update:**
1. ✅ **SPF (TXT)** - Update existing to include Resend
2. ✅ **DKIM (TXT)** - Add new record
3. ✅ **MX** - Add new record

**After adding, wait 5-15 minutes then verify in Resend dashboard.**

## Need Help?

- **Domains.co.za Support:** 011 640 9700
- **Resend Support:** support@resend.com
- **Check DNS:** https://dns.email

