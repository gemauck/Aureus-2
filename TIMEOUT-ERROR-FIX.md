# ERR_TIMED_OUT Error Fix Guide

## Problem
Your site `https://abcoafrica.co.za` is showing **ERR_TIMED_OUT** errors. The connection times out during the SSL handshake.

## Quick Diagnosis

### Step 1: Check DNS (from your local machine)
```bash
dig abcoafrica.co.za +short
# Should show: 165.22.127.196
```

### Step 2: Test connectivity (from your local machine)
```bash
# Test HTTP (should redirect to HTTPS)
curl -v http://abcoafrica.co.za

# Test HTTPS (this is timing out)
curl -v --connect-timeout 10 https://abcoafrica.co.za
```

## Root Cause
Based on tests:
- ✅ DNS resolves correctly
- ✅ Port 80 (HTTP) responds with 301 redirect
- ❌ Port 443 (HTTPS) times out during SSL handshake

This indicates:
- Server is reachable
- Nginx is running
- SSL/HTTPS connection is hanging

## Solution

### Option 1: Run Diagnostic Script (Recommended)

SSH into your server and run the diagnostic:

```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp
bash diagnose-timeout.sh
```

This will check:
- Nginx status
- PM2 application status
- SSL certificates
- Port listeners
- Health endpoints
- Error logs

### Option 2: Run Fix Script

SSH into your server and run the fix script:

```bash
ssh root@abcoafrica.co.za
cd /var/www/abcotronics-erp
bash fix-timeout.sh
```

This will automatically:
- Restart Nginx
- Restart PM2 application
- Verify SSL certificates
- Check Nginx SSL configuration
- Test local connectivity

### Option 3: Manual Fix

If scripts don't work, follow these steps:

#### 1. SSH into your server
```bash
ssh root@abcoafrica.co.za
```

#### 2. Check Nginx status
```bash
sudo systemctl status nginx
```

If not running:
```bash
sudo systemctl start nginx
```

#### 3. Check PM2 application
```bash
pm2 status
pm2 logs abcotronics-erp --lines 50
```

If not running:
```bash
cd /var/www/abcotronics-erp
pm2 restart abcotronics-erp
# Or if not in PM2:
pm2 start server.js --name abcotronics-erp
pm2 save
```

#### 4. Test application locally
```bash
curl http://127.0.0.1:3000/health
```

Should return JSON with status. If not, check logs:
```bash
pm2 logs abcotronics-erp --lines 100
```

#### 5. Check Nginx SSL configuration
```bash
sudo nginx -t
sudo cat /etc/nginx/sites-available/abcotronics-erp | grep -A 20 "443"
```

Verify:
- SSL certificate paths are correct
- Port 443 is configured
- SSL protocols/ciphers are set

#### 6. Check SSL certificate
```bash
sudo ls -la /etc/letsencrypt/live/abcoafrica.co.za/
sudo openssl x509 -in /etc/letsencrypt/live/abcoafrica.co.za/fullchain.pem -text -noout | grep -A 2 Validity
```

If certificate is missing or expired:
```bash
sudo certbot certonly --standalone -d abcoafrica.co.za -d www.abcoafrica.co.za
sudo systemctl reload nginx
```

#### 7. Test SSL locally
```bash
sudo openssl s_client -connect localhost:443 -servername abcoafrica.co.za
```

If this hangs, there's an SSL configuration issue in Nginx.

#### 8. Restart services
```bash
sudo systemctl restart nginx
pm2 restart abcotronics-erp
```

#### 9. Check error logs
```bash
sudo tail -50 /var/log/nginx/error.log
pm2 logs abcotronics-erp --lines 50
```

## Common Issues and Fixes

### Issue 1: Nginx SSL Handshake Hanging
**Symptom**: Local SSL test (`openssl s_client`) hangs

**Fix**: Check Nginx SSL configuration for:
- Missing `ssl_protocols`
- Missing `ssl_ciphers`
- Incorrect certificate paths
- SSL conflicts with proxy_pass

**Solution**:
```bash
# Check current config
sudo cat /etc/nginx/sites-available/abcotronics-erp

# Update SSL configuration if needed
sudo nano /etc/nginx/sites-available/abcotronics-erp
# Ensure you have:
#   ssl_protocols TLSv1.2 TLSv1.3;
#   ssl_ciphers HIGH:!aNULL:!MD5;

sudo nginx -t
sudo systemctl reload nginx
```

### Issue 2: Application Not Responding
**Symptom**: Port 3000 not listening, health check fails

**Fix**:
```bash
# Check PM2
pm2 status
pm2 logs abcotronics-erp --lines 50

# Restart
pm2 restart abcotronics-erp

# If still not working, check for errors
cd /var/www/abcotronics-erp
node server.js  # Check for startup errors
```

### Issue 3: SSL Certificate Expired
**Symptom**: Certificate validity check shows expired date

**Fix**:
```bash
sudo certbot renew --force-renewal -d abcoafrica.co.za -d www.abcoafrica.co.za
sudo systemctl reload nginx
```

### Issue 4: Firewall Blocking Port 443
**Symptom**: Port 443 not accessible externally but works locally

**Fix**:
```bash
# Check firewall
sudo ufw status
sudo iptables -L -n | grep 443

# Allow port 443 if needed
sudo ufw allow 443/tcp
sudo ufw reload
```

### Issue 5: DDoS Protection / Rate Limiting
**Symptom**: External connections time out but local works fine

**Fix**: Check with your hosting provider (DigitalOcean, Cloudflare, etc.) for:
- DDoS protection blocking connections
- Rate limiting rules
- Firewall rules

## Verification

After applying fixes, verify:

1. **Test locally on server**:
   ```bash
   curl -k https://127.0.0.1
   curl http://127.0.0.1:3000/health
   ```

2. **Test externally**:
   ```bash
   curl -v https://abcoafrica.co.za
   ```

3. **Check in browser**:
   - Visit: `https://abcoafrica.co.za`
   - Should load without timeout

## Prevention

To prevent future timeouts:

1. **Set up monitoring**:
   ```bash
   # Use PM2 monitoring
   pm2 install pm2-logrotate
   pm2 set pm2-logrotate:max_size 10M
   ```

2. **Set up auto-restart**:
   ```bash
   pm2 startup systemd
   pm2 save
   ```

3. **Monitor SSL certificate expiry**:
   ```bash
   # Add to crontab
   certbot renew --dry-run
   ```

4. **Check logs regularly**:
   ```bash
   pm2 logs abcotronics-erp --lines 100
   sudo tail -100 /var/log/nginx/error.log
   ```

## Still Not Working?

If the issue persists:

1. Check server resources:
   ```bash
   df -h  # Disk space
   free -h  # Memory
   top  # CPU usage
   ```

2. Check for port conflicts:
   ```bash
   sudo netstat -tlnp | grep -E ":(80|443|3000)"
   ```

3. Check system logs:
   ```bash
   sudo journalctl -u nginx -n 50
   sudo journalctl -xe | tail -50
   ```

4. Test from different networks to rule out local firewall issues

5. Contact your hosting provider if issue persists

## Quick Reference Commands

```bash
# Status checks
sudo systemctl status nginx
pm2 status
pm2 logs abcotronics-erp --lines 50

# Restart services
sudo systemctl restart nginx
pm2 restart abcotronics-erp

# Test connectivity
curl http://127.0.0.1:3000/health
curl -k https://127.0.0.1

# Check logs
sudo tail -50 /var/log/nginx/error.log
pm2 logs abcotronics-erp --lines 100

# SSL test
sudo openssl s_client -connect localhost:443 -servername abcoafrica.co.za
```









