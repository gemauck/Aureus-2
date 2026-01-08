# ⚠️ URGENT: Resend Domain Verification Required

## Problem

You're receiving **403 Forbidden** errors when sending invitation emails because:

**Resend's test domain (`onboarding@resend.dev`) can ONLY send to YOUR email address (`garethm@abcotronics.co.za`).**

You **CANNOT** send invitations to other recipients (like `gemauck@gmail.com`) using the test domain.

## Error from Server Logs

```
📧 Resend API response status: 403 Forbidden
📧 Resend API response body: {
  "message": "You can only send testing emails to your own email address (garethm@abcotronics.co.za). 
              To send emails to other recipients, please verify a domain at resend.com/domains, 
              and change the `from` address to an email using this domain."
}
```

## ✅ Solution: Verify Your Domain in Resend

### Step 1: Go to Resend Domains
1. Go to: https://resend.com/domains
2. Log in with your Resend account
3. Click "Add Domain"

### Step 2: Add Domain
1. Enter: `abcotronics.co.za`
2. Click "Add Domain"

### Step 3: Add DNS Records
Resend will show you **3 DNS records** to add:

1. **SPF (TXT record)**
   - Update your existing SPF record to include: `include:_spf.resend.com`
   - Example: `v=spf1 include:spf.protection.outlook.com include:_spf.google.com include:_spf.resend.com ~all`

2. **DKIM (TXT record)**
   - Host: `_resend._domainkey` (or what Resend provides)
   - Value: (long string from Resend)

3. **MX (MX record)** - Optional but recommended
   - Priority: (from Resend, usually 10)
   - Value: `feedback-smtp.resend.com`

### Step 4: Add DNS Records to Your Domain
Go to your domain registrar (wherever `abcotronics.co.za` is registered) and add the DNS records Resend provides.

### Step 5: Wait for Verification
- DNS propagation can take 5-15 minutes (sometimes up to 24 hours)
- Resend will automatically verify once DNS records are visible

### Step 6: Update Email From Address
Once verified, update the production server:

```bash
ssh root@165.22.127.196
cd /var/www/abcotronics-erp
nano .env
```

Change:
```
EMAIL_FROM="onboarding@resend.dev"
```

To:
```
EMAIL_FROM="garethm@abcotronics.co.za"
```

Then restart:
```bash
pm2 restart abcotronics-erp --update-env
```

## ✅ Quick Test (Using Test Domain)

While waiting for domain verification, you can test by:
1. **Only sending invitations to**: `garethm@abcotronics.co.za`
2. The test domain works for this email address

## 📋 Verification Checklist

- [ ] Added domain `abcotronics.co.za` in Resend
- [ ] Added SPF record (updated existing one)
- [ ] Added DKIM record
- [ ] Added MX record (optional)
- [ ] Waited 5-15 minutes for DNS propagation
- [ ] Domain verified in Resend dashboard (green checkmark)
- [ ] Updated `EMAIL_FROM` to `garethm@abcotronics.co.za` on production server
- [ ] Restarted server with `pm2 restart abcotronics-erp --update-env`
- [ ] Tested sending invitation to a different email address

## 🎯 After Domain Verification

Once your domain is verified:
1. ✅ You can send emails to **any email address**
2. ✅ Emails will come from `garethm@abcotronics.co.za`
3. ✅ Better deliverability (not marked as test emails)
4. ✅ Professional appearance

## ⚠️ Current Status

**Current:** Using Resend test domain (`onboarding@resend.dev`)
- ✅ Works for: `garethm@abcotronics.co.za` only
- ❌ Fails for: Any other email address (403 Forbidden)

**After domain verification:**
- ✅ Works for: **All email addresses**
- ✅ Emails come from your verified domain


