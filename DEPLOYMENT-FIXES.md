# Deployment Fixes - January 2025

## Issues Fixed

### 1. SSH Connection Timeout
**Problem**: Deployment scripts were failing with SSH connection timeouts.

**Fix**: Added SSH connection testing before attempting deployment. The script now:
- Tests SSH connectivity with a 10-second timeout
- Provides clear error messages if connection fails
- Suggests troubleshooting steps

### 2. DB_PASSWORD Requirement
**Problem**: Deployment script required `DB_PASSWORD` environment variable, causing failures if not set.

**Fix**: Made `DB_PASSWORD` optional by:
- Reading existing `DATABASE_URL` from server's `.env` file first
- Only requiring `DB_PASSWORD` if no valid `DATABASE_URL` exists on server
- Preserving existing database configuration when possible

### 3. Error Handling
**Problem**: Script would exit on any error, making it hard to diagnose issues.

**Fix**: Improved error handling:
- Better error messages with actionable suggestions
- Graceful handling of missing environment variables
- Continues deployment when possible (e.g., preserves existing DATABASE_URL)

## How to Use

### Basic Deployment (Recommended)
If your server already has a valid `DATABASE_URL` in `.env`:

```bash
./deploy-direct.sh
```

The script will:
1. Test SSH connection
2. Build the project locally
3. Copy files to server via rsync
4. Install dependencies on server
5. Preserve existing DATABASE_URL
6. Restart the application

### Deployment with New Database Credentials
If you need to update database credentials:

```bash
export DB_PASSWORD='your-database-password'
export DB_USERNAME='doadmin'  # optional, defaults to doadmin
./deploy-direct.sh
```

## Troubleshooting

### SSH Connection Fails
If you see "Cannot connect to server via SSH":

1. **Test SSH manually**:
   ```bash
   ssh root@abcoafrica.co.za
   ```

2. **Check SSH keys**:
   ```bash
   ssh-add -l  # List loaded keys
   ssh-add ~/.ssh/id_rsa  # Add your key if needed
   ```

3. **Check firewall**: Ensure port 22 is open

4. **Verify server is running**: Check DigitalOcean dashboard

### Database URL Issues
If you see "Cannot determine DATABASE_URL":

1. **Option 1**: Set DB_PASSWORD before deployment:
   ```bash
   export DB_PASSWORD='your-password'
   ./deploy-direct.sh
   ```

2. **Option 2**: Ensure server has valid DATABASE_URL:
   ```bash
   ssh root@abcoafrica.co.za
   cd /var/www/abcotronics-erp
   cat .env | grep DATABASE_URL
   ```

### Build Failures
If the build step fails:

1. **Check Node.js version**:
   ```bash
   node --version  # Should be >= 18.0.0
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Check for syntax errors**:
   ```bash
   npm run build:jsx
   ```

## Files Modified

- `deploy-direct.sh` - Main deployment script with all fixes

## Next Steps

1. Test the deployment script:
   ```bash
   ./deploy-direct.sh
   ```

2. If SSH connection fails, fix SSH access first

3. If database issues occur, ensure server has valid DATABASE_URL or set DB_PASSWORD

## Server Information

- **Server**: root@abcoafrica.co.za
- **App Directory**: /var/www/abcotronics-erp
- **Process Manager**: PM2 (abcotronics-erp)
- **Port**: 3000
- **URL**: https://abcoafrica.co.za

