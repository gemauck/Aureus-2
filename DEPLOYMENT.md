# Aureus ERP Deployment Guide

## Deployment Summary

✅ **GitHub Branch Created**: `aureus`  
✅ **Droplet IP**: `64.227.32.244`  
✅ **Deployment Script**: `deploy-to-droplet.sh`

## Setup Steps

### 1. Add SSH Key to Droplet

1. Go to: https://cloud.digitalocean.com/droplets/526452238
2. Click **Settings** → **Security** → **Add SSH Key**
3. Paste your SSH key:
   ```
   ssh-ed25519 AAAAC3NzaC1lZDI1NTE گرمS/OFCettWPVuytm7YAP7ePvedJ your_email@example.com
   ```

### 2. Deploy to Droplet

Once SSH access is configured, run:

```bash
./deploy-to-droplet.sh
```

This will:
- Install Node.js, npm, git, nginx
- Clone the `aureus` branch
- Install dependencies
- Setup Prisma database
- Start the app with PM2
- Configure auto-start on reboot

### 3. Manual Deployment (if needed)

SSH into the droplet:
```bash
ssh root@64.227.32.244
```

Then run:
```bash
cd /var/www/aureus-erp
git pull origin aureus
npm install
npx prisma migrate deploy
pm2 restart aureus-erp
```

### 4. Local Development Workflow

1. **Make changes locally** on the `aureus` branch
2. **Commit and push**:
   ```bash
   git add .
   git commit -m "Your changes"
   git push origin aureus
   ```
3. **Deploy to droplet**:
   ```bash
   ./deploy-to-droplet.sh
   ```

### 5. Access URLs

- **Live App**: http://64.227.32.244:3000
- **PM2 Status**: SSH and run `pm2 status`
- **Logs**: `pm2 logs aureus-erp`

## Troubleshooting

### SSH Connection Issues
```bash
# Test connection
ssh root@64.227.32.244

# If password prompt appears, reset password in DO console
```

### PM2 Issues
```bash
# Check status
pm2 status

# View logs
pm2 logs aureus-erp

# Restart app
pm2 restart aureus-erp
```

### Database Issues
```bash
cd /var/www/aureus-erp
npx prisma migrate deploy
npx prisma generate
pm2 restart aureus-erp
```

## Files

- `deploy-to-droplet.sh` - Automated deployment script
- `.droplet_ip` - Droplet IP address storage
- `DEPLOYMENT.md` - This file

## Git Branch Structure

- `main` - Production-ready code
- `aureus` - Active development and deployment branch

