# HTTPS Setup Guide for abcoafrica.com

Complete setup guide for configuring HTTPS on your domain through domains.co.za.

---

## Step 1: Configure DNS at domains.co.za

### Login to domains.co.za
1. Go to https://domains.co.za
2. Login to your account
3. Navigate to your domain: **abcoafrica.com**

### Add A Records
In your DNS management panel, add these A records:

**For the main domain:**
```
Type: A
Hostname: @ (or leave empty)
Value: 138.68.167.88
TTL: 3600 (or auto)
```

**For www subdomain (optional but recommended):**
```
Type: A
Hostname: www
Value: 138.68.167.88
TTL: 3600 (or auto)
```

### What to expect:
- DNS changes can take 15 minutes to 48 hours (usually much faster)
- You can check if DNS is working by running: `ping abcoafrica.com`

### Verify DNS is working (after waiting 5-15 minutes):
```bash
# On your local machine
ping abcoafrica.com
# Should show 138.68.167. thus88

# Or check with nslookup
nslookup abcoafrica.com
```

---

## Step 2: Upload and Run Setup Script on Droplet

### From your local machine, copy the script to your droplet:
```bash
# Make sure you're in your project directory
cd /Users/gemau/Documents/Project\ ERP/abcotronics-erp-modular

# Copy the setup script to your droplet
scp setup-https-abcoafrica.sh root@138.68.167.88:/root/
```

### SSH into your droplet:
```bash
ssh root@138.68.167.88
```

### Run the setup script:
```bash
chmod +x setup-https-abcoafrica.sh
./setup-https-abcoafrica.sh
```

The script will:
- ✅ Install Nginx
- ✅ Configure it as a reverse proxy
- ✅ Install Certbot
- ✅ Obtain SSL certificate for abcoafrica.com
- ✅ Configure auto-renewal
- ✅ Update your app's environment
- ✅ Restart your application

---

## Step 3: Update Your Application Code

After the script runs, you need to add your domain to the CORS whitelist.

### On your local machine, edit `server.js`:

Find the `allowedOrigins` array (around line 107) and add your domain:

```javascript
const allowedOrigins = [
  process.env.APP_URL,
  'http://localhost:3000',
  'http://localhost:3001', 
  'http://localhost:3002',
  'http://localhost:8000',
  'https://abcoafrica.com',
  'https://www.abcoafrica.com'
].filter(Boolean)
```

### Commit and push to GitHub:
```bash
git add .
git commit -m "Add abcoafrica.com to CORS whitelist"
git push origin main
```

### Deploy to droplet:
```bash
ssh root@138.68.167.88
cd /var/www/abcotronics-erp
git pull origin main
npm install --production
npx prisma generate
pm2 restart abcotronics-erp
```

---

## Step 4: Test Your Setup

### 1. Test the main domain:
Visit: **https://abcoafrica.com**

You should see:
- ✅ Padlock icon in the browser address bar
- ✅ Your ERP login page loads correctly
- ✅ HTTPS working (no "Not Secure" warnings)

### 2. Test SSL certificate quality:
Visit: https://www.ssllabs.com/ssltest/analyze.html?d=abcoafrica.com

You should get an **A or A+ rating**.

### 3. Verify both www and non-www work:
- https://abcoafrica.com
- https://www.abcoafrica.com

Both should redirect properly.

---

## Troubleshooting

### DNS Issues

**Problem:** Domain not resolving
```bash
# Check if DNS has propagated
dig abcoafrica.com +short

# Should return: 138.68.167.88
```

**Solution:** Wait a bit longer (up to 48 hours) or check your DNS records

### SSL Certificate Issues

**Problem:** Certbot can't verify domain
```
Error: Could not validate domain
```

**Solution:** Make sure:
1. DNS A record points to your droplet IP
2. Nginx is running: `systemctl status nginx`
3. Port 80 is accessible: `ufw allow 80/tcp`

### 502 Bad Gateway

**Problem:** Seeing "502 Bad Gateway" error

**Check app status:**
```bash
pm2 status
pm2 logs abcotronics-erp
```

**Restart app:**
```bash
pm2 restart abcotronics-erp
```

### CORS Errors

**Problem:** Getting CORS errors in browser console

**Solution:** Make sure you've added both URLs to server.js:
```javascript
'https://abcoafrica.com',
'https://www.abcoafrica.com'
```

Then restart the app on the droplet.

---

## Useful Commands on Droplet

### Check Nginx status:
```bash
systemctl status nginx
```

### View Nginx error logs:
```bash
tail -f /var/log/nginx/error.log
```

### View Nginx access logs:
```bash
tail -f /var/log/nginx/access.log
```

### Test Nginx configuration:
```bash
nginx -t
```

### Restart Nginx:
```bash
systemctl restart nginx
```

### Check SSL certificate:
```bash
certbot certificates
```

### Manually renew certificate:
```bash
certbot renew
systemctl reload nginx
```

### Check app status:
```bash
pm2 status
pm2 logs abcotronics-erp
```

### Restart app:
```bash
pm2 restart abcotronics-erp
```

---

## Security Checklist

- ✅ SSL/TLS encryption enabled
- ✅ HTTP to HTTPS redirect configured
- ✅ Firewall configured (ports 80, 443, 22 open)
- ✅ Strong SSL ciphers enabled
- ✅ Auto-renewal configured for certificates
- ✅ CORS configured for your domain
- ✅ Environment variables secure
- ✅ Database credentials secure

---

## Cost Breakdown

- **Domain (abcoafrica.com)**: Already owned via domains.co.za
- **SSL Certificate**: FREE (Let's Encrypt)
- **Nginx**: FREE (open source)
- **Certbot**: FREE (open source)

**Total additional cost: $0** 🎉

---

## What You've Achieved

✅ Professional domain name (abcoafrica.com)
✅ SSL/TLS encryption
✅ Secure HTTPS connection
✅ Free SSL certificate with auto-renewal
✅ Reverse proxy with Nginx
✅ Production-ready setup

---

## Next Steps (Optional Enhancements)

1. **Set up email** for your domain (e.g., info@abcoafrica.com)
2. **Configure monitoring** (e.g., UptimeRobot)
3. **Set up backups** for your database
4. **Add CDN** for faster global access
5. **Configure analytics** (e.g., Google Analytics)

---

**Your ERP is now live at: https://abcoafrica.com** 🚀

