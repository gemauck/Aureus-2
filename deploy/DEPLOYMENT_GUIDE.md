# 🚀 Deployment Guide - Abcotronics ERP

Complete guide for deploying the Abcotronics ERP system to a DigitalOcean droplet with Git and automated CI/CD.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Part 1: Local Git Setup](#part-1-local-git-setup)
3. [Part 2: DigitalOcean Droplet Setup](#part-2-digitalocean-droplet-setup)
4. [Part 3: Application Deployment](#part-3-application-deployment)
5. [Part 4: CI/CD with GitHub Actions](#part-4-cicd-with-github-actions)
6. [Part 5: SSL & Domain Setup](#part-5-ssl--domain-setup)
7. [Maintenance & Troubleshooting](#maintenance--troubleshooting)

---

## Prerequisites

### Required Accounts
- ✅ GitHub account
- ✅ DigitalOcean account
- ✅ Domain name (optional but recommended)

### Local Development Environment
- ✅ Git installed
- ✅ Node.js 18+ installed
- ✅ SSH key generated

---

## Part 1: Local Git Setup

### Step 1: Initialize Git Repository

```bash
cd "/Users/gemau/Documents/Project ERP/abcotronics-erp-modular"

# Initialize Git (if not already initialized)
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit - Abcotronics ERP system"
```

### Step 2: Create GitHub Repository

1. Go to https://github.com/new
2. Create repository named: `abcotronics-erp`
3. **Do NOT** initialize with README, .gitignore, or license
4. Click "Create repository"

### Step 3: Connect Local Repo to GitHub

```bash
# Add GitHub remote
git remote add origin git@github.com:YOUR_USERNAME/abcotronics-erp.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### Step 4: Create Development Branch

```bash
# Create and switch to dev branch
git checkout -b development

# Push dev branch
git push -u origin development
```

### Step 5: Setup Branch Protection (Optional)

In GitHub:
1. Go to: Settings → Branches → Add rule
2. Branch name pattern: `main`
3. Enable:
   - ✅ Require pull request reviews
   - ✅ Require status checks to pass
4. Save changes

---

## Part 2: DigitalOcean Droplet Setup

### Step 1: Create Droplet

1. Log in to DigitalOcean
2. Click "Create" → "Droplets"
3. Choose:
   - **Image**: Ubuntu 22.04 LTS
   - **Plan**: Basic ($12/month recommended for production)
   - **CPU**: Regular (2 GB RAM / 1 CPU minimum)
   - **Datacenter**: Choose closest to users
   - **Authentication**: SSH Key (recommended)
   - **Hostname**: abcotronics-erp

4. Click "Create Droplet"
5. Note your droplet's IP address

### Step 2: Initial Server Access

```bash
# SSH into your droplet (use your IP)
ssh root@YOUR_DROPLET_IP

# Update system
apt update && apt upgrade -y

# Create secure password for root (if not using SSH keys only)
passwd
```

### Step 3: Run Automated Setup Script

```bash
# Download and run the setup script
wget https://raw.githubusercontent.com/YOUR_USERNAME/abcotronics-erp/main/deploy/setup-droplet.sh

# Make it executable
chmod +x setup-droplet.sh

# Run the setup (this takes 5-10 minutes)
sudo ./setup-droplet.sh
```

**OR** Copy the script manually:

```bash
# Create the script
nano setup-droplet.sh

# Paste the content from deploy/setup-droplet.sh
# Save with Ctrl+X, Y, Enter

# Make executable and run
chmod +x setup-droplet.sh
sudo ./setup-droplet.sh
```

### Step 4: Setup Deploy User SSH Key

```bash
# Generate SSH key for deploy user
sudo -u deploy ssh-keygen -t ed25519 -C "deploy@abcotronics-erp"

# Display public key
sudo cat /home/deploy/.ssh/id_ed25519.pub

# Copy this key and add it to GitHub:
# GitHub → Settings → SSH and GPG keys → New SSH key
```

---

## Part 3: Application Deployment

### Step 1: Clone Repository

```bash
# Switch to deploy user
sudo -u deploy -i

# Navigate to web directory
cd /var/www/abcotronics-erp

# Clone your repository
git clone git@github.com:YOUR_USERNAME/abcotronics-erp.git .
```

### Step 2: Configure Environment Variables

```bash
# Copy environment template
cp .env.template .env

# Edit environment variables
nano .env
```

**Important variables to set:**

```env
# Database
DATABASE_URL=postgresql://erp_user:YOUR_SECURE_PASSWORD@localhost:5432/abcotronics_erp
DB_PASSWORD=YOUR_SECURE_PASSWORD

# JWT & Session Secrets (generate with: openssl rand -base64 32)
JWT_SECRET=your_generated_jwt_secret
SESSION_SECRET=your_generated_session_secret

# Domain
CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com

# Email (if using)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

### Step 3: Install Dependencies

```bash
# Install server dependencies
cd /var/www/abcotronics-erp/server
npm ci --only=production

# Create logs directory
mkdir -p /var/www/abcotronics-erp/logs
```

### Step 4: Setup Database

```bash
# Run database migrations
cd /var/www/abcotronics-erp/server
npm run migrate

# Optional: Seed initial data
npm run seed
```

### Step 5: Configure Nginx

```bash
# Exit from deploy user
exit

# Copy Nginx configuration
sudo cp /var/www/abcotronics-erp/deploy/nginx.conf /etc/nginx/sites-available/abcotronics-erp

# Edit the configuration
sudo nano /etc/nginx/sites-available/abcotronics-erp

# Update these lines:
# - server_name: your-domain.com www.your-domain.com
# - ssl_certificate paths (will be added after SSL setup)

# Enable the site
sudo ln -s /etc/nginx/sites-available/abcotronics-erp /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# If test passes, reload Nginx
sudo systemctl reload nginx
```

### Step 6: Start Application with PM2

```bash
# Switch to deploy user
sudo -u deploy -i

# Navigate to app directory
cd /var/www/abcotronics-erp

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup

# Check status
pm2 status
pm2 logs
```

### Step 7: Test Deployment

```bash
# Test locally on server
curl http://localhost:3000/health

# Test from outside (use your droplet IP)
curl http://YOUR_DROPLET_IP/health
```

---

## Part 4: CI/CD with GitHub Actions

### Step 1: Generate Deployment SSH Key

```bash
# On your droplet, create a new SSH key for GitHub Actions
sudo -u deploy ssh-keygen -t ed25519 -f /home/deploy/.ssh/github_actions -C "github-actions@abcotronics"

# Display private key (you'll need this for GitHub Secrets)
sudo cat /home/deploy/.ssh/github_actions

# Add public key to authorized_keys
sudo cat /home/deploy/.ssh/github_actions.pub | sudo -u deploy tee -a /home/deploy/.ssh/authorized_keys

# Set correct permissions
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

### Step 2: Add GitHub Secrets

1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Click "New repository secret" for each:

| Secret Name | Value |
|-------------|-------|
| `DROPLET_HOST` | Your droplet IP address |
| `DROPLET_USER` | `deploy` |
| `DROPLET_SSH_KEY` | Private key content from `/home/deploy/.ssh/github_actions` |

### Step 3: Test Automated Deployment

```bash
# On your local machine, make a small change
echo "# Deployment test" >> README.md

# Commit and push
git add README.md
git commit -m "test: Trigger automated deployment"
git push origin main

# Check GitHub Actions tab for deployment status
```

### Step 4: Monitor Deployment

- Go to GitHub → Actions tab
- Watch the deployment workflow
- Check droplet logs: `pm2 logs`

---

## Part 5: SSL & Domain Setup

### Step 1: Point Domain to Droplet

1. Go to your domain registrar
2. Add/Update DNS records:
   - **A Record**: `@` → `YOUR_DROPLET_IP`
   - **A Record**: `www` → `YOUR_DROPLET_IP`

3. Wait for DNS propagation (5-30 minutes)

### Step 2: Install SSL Certificate

```bash
# On your droplet
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Follow the prompts:
# - Enter email address
# - Agree to terms
# - Choose redirect option (2) - Recommended

# Test auto-renewal
sudo certbot renew --dry-run
```

### Step 3: Update Nginx Configuration

```bash
# Certbot should auto-update, but verify:
sudo nano /etc/nginx/sites-available/abcotronics-erp

# Ensure SSL certificates are correctly referenced
# Reload Nginx
sudo systemctl reload nginx
```

### Step 4: Test SSL

Visit:
- https://your-domain.com
- https://www.your-domain.com
- https://www.ssllabs.com/ssltest/analyze.html?d=your-domain.com

---

## Maintenance & Troubleshooting

### Common Commands

```bash
# View application logs
pm2 logs

# Restart application
pm2 restart abcotronics-erp

# Check application status
pm2 status

# Monitor application
pm2 monit

# View Nginx logs
sudo tail -f /var/log/nginx/abcotronics-erp.access.log
sudo tail -f /var/log/nginx/abcotronics-erp.error.log

# Check Nginx status
sudo systemctl status nginx

# Test Nginx configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Check PostgreSQL status
sudo systemctl status postgresql

# Access PostgreSQL
sudo -u postgres psql -d abcotronics_erp
```

### Backup Database

```bash
# Create backup
sudo -u postgres pg_dump abcotronics_erp > backup_$(date +%Y%m%d).sql

# Restore backup
sudo -u postgres psql abcotronics_erp < backup_20240101.sql
```

### Update Application

```bash
# Manual update
sudo -u deploy -i
cd /var/www/abcotronics-erp
git pull origin main
cd server && npm ci --only=production
pm2 restart abcotronics-erp

# Or let GitHub Actions do it automatically when you push to main
```

### Troubleshooting

#### Application won't start

```bash
# Check logs
pm2 logs abcotronics-erp --lines 50

# Check environment variables
pm2 env 0

# Restart with verbose logging
pm2 delete abcotronics-erp
NODE_ENV=production pm2 start ecosystem.config.js --log-date-format 'YYYY-MM-DD HH:mm:ss'
```

#### 502 Bad Gateway

```bash
# Check if application is running
pm2 status

# Check application logs
pm2 logs

# Restart application
pm2 restart abcotronics-erp

# Check Nginx error log
sudo tail -100 /var/log/nginx/abcotronics-erp.error.log
```

#### Database connection issues

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test database connection
sudo -u postgres psql -d abcotronics_erp -c "SELECT NOW();"

# Check database credentials in .env
cat /var/www/abcotronics-erp/.env | grep DB_
```

#### SSL certificate renewal fails

```bash
# Check certificates
sudo certbot certificates

# Manually renew
sudo certbot renew --force-renewal

# Check Nginx configuration
sudo nginx -t
```

### Performance Monitoring

```bash
# Monitor server resources
htop

# Monitor disk usage
df -h

# Monitor memory usage
free -h

# Monitor network
netstat -tuln

# PM2 monitoring
pm2 monit
```

### Security Updates

```bash
# Update system packages monthly
sudo apt update && sudo apt upgrade -y

# Update Node packages
cd /var/www/abcotronics-erp/server
npm outdated
npm audit
npm audit fix
```

---

## 🎉 Deployment Complete!

Your Abcotronics ERP system is now deployed with:

✅ Automated CI/CD with GitHub Actions  
✅ SSL/HTTPS encryption  
✅ PM2 process management  
✅ Nginx reverse proxy  
✅ PostgreSQL database  
✅ Automatic deployments on push to main  

### Access Your Application

- **Frontend**: https://your-domain.com
- **API**: https://your-domain.com/api
- **Health Check**: https://your-domain.com/health

### Support

For issues or questions, check:
- Application logs: `pm2 logs`
- Nginx logs: `/var/log/nginx/`
- Database logs: `/var/log/postgresql/`

---

**Last Updated**: January 2025  
**Version**: 1.0
