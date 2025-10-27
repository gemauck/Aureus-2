# Fix DNS Before Getting SSL Certificate

## The Problem

Certbot can't verify your domain because:
1. The DNS A record is pointing to the wrong IP or hasn't propagated yet
2. Your actual droplet IP is: **165.22.127.196** (from your system info)
3. But the domain might be pointing to: 138.68.167.88

## Solution

### Step 1: Update DNS at domains.co.za

Go to domains.co.za and update your A records to point to **165.22.127.196**:

```
Type: A
Hostname: @
Value: 165.22.127.196
TTL: 3600

Type: A
Hostname: www
Value: 165.22.127.196
TTL: 3600
```

### Step 2: Verify DNS is correct

Wait 5-15 minutes, then check:

```bash
# From any computer, check DNS:
nslookup abcoafrica.com
# Should show: 165.22.127.196

# Or use:
dig abcoafrica.com +short
# Should show: 165.22.127.196
```

### Step 3: Test domain is accessible

```bash
curl -I http://abcoafrica.com
```

You should get a response from your server.

### Step 4: Retry SSL certificate

Once DNS is correct, run:

```bash
certbot --nginx -d abcoafrica.com -d www.abcoafrica.com --non-interactive --agree-tos --redirect --register-unsafely-without-email
```

## Alternative: Use Your Correct IP

If your droplet IP is actually 165.22.127.196 (not 138.68.167.88), update the Nginx config:

```bash
# Test which IP is correct
curl ifconfig.me

# Should show your actual external IP
```

## Check Current DNS Status

Run this to check what DNS is currently set to:

```bash
# Check current DNS records
dig abcoafrica.com +short
dig www.abcoafrica.com +short
```

Both should show **165.22.127.196** (your droplet's IP).

## Quick Fix Commands

After DNS is updated to point to 165.22.127.196:

```bash
# Wait 5-15 minutes for DNS to propagate
sleep 300

# Verify DNS
nslookup abcoafrica.com

# If DNS is correct, get certificate
certbot --nginx -d abcoafrica.com -d www.abcoafrica.com --non-interactive --agree-tos --redirect --register-unsafely-without-email

# Check status
systemctl status nginx
certbot certificates
```

## Your App is Working!

Even without SSL, your app is accessible at:
- **http://abcoafrica.com/app**

Once DNS is fixed, you can add HTTPS.
