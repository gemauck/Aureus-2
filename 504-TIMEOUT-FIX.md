# 504 Gateway Timeout Fix Guide

## Problem
The application is experiencing **504 Gateway Timeout** errors when processing file uploads, particularly for the POA Review feature that processes Excel files (fuel transaction data).

## Root Cause
The POA Review processing endpoint (`/api/poa-review/process`) executes Python scripts that can take **up to 5 minutes** to process large Excel files. However, nginx's default timeout is only **60 seconds**, causing nginx to return a 504 error before the processing completes.

## Quick Fix

### Option 1: Run the Diagnostic Script (Recommended)

Run the diagnostic script which will automatically increase timeouts:

```bash
./scripts/diagnose-504.sh
```

This script will:
- Check current nginx timeout settings
- Test upstream response times
- Automatically increase timeouts to 300s (5 minutes) if needed
- Increase `client_max_body_size` to 50MB for file uploads

### Option 2: Manual Fix via SSH

SSH into your server and update nginx configuration:

```bash
# SSH into server
ssh root@your-server-ip

# Find your nginx site config
SITE_FILE=$(grep -R -l "server_name.*abcoafrica.co.za" /etc/nginx/sites-enabled/ /etc/nginx/sites-available/ | head -n1)
echo "Config file: $SITE_FILE"

# Backup the config
cp "$SITE_FILE" "$SITE_FILE.backup.$(date +%Y%m%d%H%M%S)"

# Edit the config
nano "$SITE_FILE"
```

Add or update these settings in the `location /` block:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    
    # WebSocket support
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    
    # Headers
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Increased timeouts for file processing (5 minutes)
    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
    
    # Existing buffering settings...
}
```

Also add in the `server { }` block (outside location blocks):

```nginx
server {
    # ... existing SSL and server_name settings ...
    
    # Allow larger file uploads (50MB)
    client_max_body_size 50M;
    client_body_timeout 300s;
    
    # ... rest of config ...
}
```

Test and reload:

```bash
nginx -t && systemctl reload nginx
```

## Verification

After applying the fix:

1. **Check timeout settings:**
   ```bash
   grep -E "proxy_(connect|send|read)_timeout|client_max_body_size" /etc/nginx/sites-enabled/*
   ```

2. **Test file upload:**
   - Try uploading the Excel file again
   - The processing should complete without timing out

3. **Monitor logs:**
   ```bash
   # Watch nginx error log
   tail -f /var/log/nginx/error.log
   
   # Watch application logs
   pm2 logs
   ```

## Expected Behavior After Fix

- File uploads up to 50MB are accepted
- Processing can take up to 5 minutes without timing out
- 504 errors should no longer occur for file processing operations
- Normal API requests still respond quickly

## Additional Notes

### Why This Happens

The POA Review processing involves:
1. Reading large Excel files with pandas
2. Running multiple data analysis functions
3. Calculating SMR totals and compliance metrics
4. Formatting and generating output Excel files

For a 1.55 MB Excel file, this can easily take 2-3 minutes, which exceeds the default 60-second nginx timeout.

### Performance Optimization (Future)

Consider these improvements:
1. **Async Processing**: Move file processing to background jobs
2. **Progress Updates**: Use WebSockets to send progress updates
3. **Chunked Processing**: Process large files in chunks
4. **Caching**: Cache intermediate results

## Troubleshooting

If 504 errors persist after increasing timeouts:

1. **Check Python script execution:**
   ```bash
   # Test Python script directly
   cd /path/to/app/scripts/poa-review
   python3 process_*.py
   ```

2. **Check system resources:**
   ```bash
   # CPU and memory usage
   top
   htop
   
   # Disk I/O
   iostat -x 1 5
   ```

3. **Check application logs:**
   ```bash
   pm2 logs --lines 100
   ```

4. **Verify database performance:**
   - Check for slow queries
   - Ensure database connections are not exhausted

## Related Files

- Processing endpoint: `api/poa-review/process.js`
- Frontend component: `src/components/teams/POAReview.jsx`
- Python scripts: `scripts/poa-review/ProofReview.py`, `scripts/poa-review/FormatExcel.py`













