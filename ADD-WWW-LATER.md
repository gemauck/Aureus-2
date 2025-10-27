# Get SSL Certificate Now (Without www)

## Problem
The www subdomain DNS record doesn't exist yet.

## Solution
Get SSL for `abcoafrica.co.za` first, then add www later.

## Run This on Your Droplet

```bash
systemctl stop nginx
certbot certonly --standalone -d abcoafrica.co.za --agree-tos --register-unsafely-without-email
systemctl start nginx
```

This will give you HTTPS at: **https://abcoafrica.co.za**

## Next Steps After Certificate

1. Add www DNS record at domains.co.za
2. Run certbot again later to add www: `certbot certonly --standalone -d abcoafrica.co.za -d www.abcoafrica.co.za`

## For Now

Just use: **https://abcoafrica.co.za/app** (without www)
