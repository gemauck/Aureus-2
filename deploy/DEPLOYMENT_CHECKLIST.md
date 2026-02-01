# 🎯 Deployment Setup - Step-by-Step Checklist

Use this checklist to track your deployment progress.

---

## ✅ Pre-Deployment Checklist

### Local Setup
- [ ] Git installed on local machine
- [ ] Node.js 18+ installed
- [ ] GitHub account created
- [ ] SSH key generated (`ssh-keygen -t ed25519 -C "your-email@example.com"`)
- [ ] SSH key added to GitHub (Settings → SSH and GPG keys)

### Accounts & Services
- [ ] GitHub account ready
- [ ] DigitalOcean account created (or alternative cloud provider)
- [ ] Domain name purchased (optional but recommended)
- [ ] Domain DNS access available

---

## 📝 Step 1: Initialize Git Repository

**Time**: 5 minutes

```bash
cd "/Users/gemau/Documents/Project ERP/abcotronics-erp-modular"

# Make script executable
chmod +x setup-git.sh

# Run setup script
./setup-git.sh
```

**What it does:**
- ✅ Initializes Git repository
- ✅ Creates initial commit
- ✅ Configures GitHub remote
- ✅ Provides next steps

**Checklist:**
- [ ] Script completed successfully
- [ ] Git repository initialized
- [ ] Remote URL configured

---

## 📝 Step 2: Create GitHub Repository

**Time**: 3 minutes

1. [ ] Go to https://github.com/new
2. [ ] Repository name: `abcotronics-erp`
3. [ ] Set to **Private**
4. [ ] **DO NOT** initialize with README
5. [ ] Click "Create repository"
6. [ ] Push code: `git push -u origin main`

**Verify:**
- [ ] Code visible on GitHub
- [ ] All files uploaded
- [ ] Main branch is default

---

## 📝 Step 3: Create DigitalOcean Droplet

**Time**: 5 minutes

1. [ ] Log in to DigitalOcean
2. [ ] Click "Create" → "Droplets"
3. [ ] Select configuration:
   - [ ] **Image**: Ubuntu 22.04 LTS
   - [ ] **Plan**: Basic - $12/month (2GB RAM / 1 CPU)
   - [ ] **Datacenter**: Closest to your users
   - [ ] **Authentication**: SSH Key (add your public key)
   - [ ] **Hostname**: abcotronics-erp
4. [ ] Create Droplet
5. [ ] Note IP address: ___________________

**Verify:**
- [ ] Droplet created and running
- [ ] Can SSH: `ssh root@YOUR_DROPLET_IP`
- [ ] IP address saved

---

## 📝 Step 4: Setup Droplet

**Time**: 10-15 minutes

```bash
# SSH into droplet
ssh root@YOUR_DROPLET_IP

# Download setup script
wget https://raw.githubusercontent.com/YOUR_USERNAME/abcotronics-erp/main/deploy/setup-droplet.sh

# Or copy manually from deploy/setup-droplet.sh

# Make executable
chmod +x setup-droplet.sh

# Run setup
sudo ./setup-droplet.sh
```

**Checklist:**
- [ ] Script completed without errors
- [ ] PostgreSQL installed and running
- [ ] Nginx installed
- [ ] PM2 installed
- [ ] Deploy user created
- [ ] Firewall configured
- [ ] SSH key generated for deploy user

**Save this info:**
- Database password: ___________________
- JWT secret: ___________________
- Session secret: ___________________

---

## 📝 Step 5: Configure GitHub Deploy Keys

**Time**: 5 minutes

```bash
# On droplet, display public key
sudo cat /home/deploy/.ssh/id_ed25519.pub
```

1. [ ] Copy the entire public key
2. [ ] Go to GitHub → Your Repo → Settings → Deploy keys
3. [ ] Click "Add deploy key"
4. [ ] Title: "Abcotronics Production Server"
5. [ ] Paste key
6. [ ] Check "Allow write access"
7. [ ] Click "Add key"

**Verify:**
- [ ] Deploy key added to GitHub
- [ ] Can clone repo from server

---

## 📝 Step 6: Clone and Configure Application

**Time**: 10 minutes

```bash
# Switch to deploy user
sudo -u deploy -i

# Clone repository
cd /var/www/abcotronics-erp
git clone git@github.com:YOUR_USERNAME/abcotronics-erp.git .

# Copy environment template
cp .env.template .env

# Edit environment file
nano .env
```

**Required environment variables:**
- [ ] `DATABASE_URL` configured
- [ ] `DB_PASSWORD` set
- [ ] `JWT_SECRET` generated and set
- [ ] `SESSION_SECRET` generated and set
- [ ] `NODE_ENV=production`
- [ ] `PORT=3000`
- [ ] `CORS_ORIGINS` configured (if using domain)
- [ ] `RESEND_API_KEY` set (for sending email)
- [ ] `DOCUMENT_REQUEST_INBOUND_EMAIL` set (e.g. `documents@abcoafrica.co.za`) for reply-by-email
- [ ] `RESEND_WEBHOOK_SECRET` set (from Resend webhook details) to verify inbound webhook

**Generate secrets:**
```bash
# Generate JWT secret
openssl rand -base64 32

# Generate Session secret
openssl rand -base64 32
```

**Checklist:**
- [ ] Repository cloned
- [ ] .env file configured
- [ ] All secrets set
- [ ] Database password set

---

## 📝 Step 7: Setup Database and Install Dependencies

**Time**: 5 minutes

```bash
# Still as deploy user in /var/www/abcotronics-erp

# Install dependencies
cd server
npm ci --only=production

# Run migrations
npm run migrate

# Optional: Seed initial data
npm run seed
```

**Checklist:**
- [ ] Dependencies installed
- [ ] Migrations completed
- [ ] Database tables created
- [ ] No error messages

**Verify database:**
```bash
sudo -u postgres psql -d abcotronics_erp -c "\dt"
```
- [ ] Tables listed

---

## 📝 Step 8: Configure Nginx

**Time**: 5 minutes

```bash
# Exit deploy user
exit

# Copy Nginx config
sudo cp /var/www/abcotronics-erp/deploy/nginx.conf /etc/nginx/sites-available/abcotronics-erp

# Edit configuration
sudo nano /etc/nginx/sites-available/abcotronics-erp
```

**Update these lines:**
- [ ] Change `your-domain.com` to actual domain (or use IP temporarily)
- [ ] Comment out SSL certificate lines (will add after SSL setup)
- [ ] Save file

**Enable site:**
```bash
sudo ln -s /etc/nginx/sites-available/abcotronics-erp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**Checklist:**
- [ ] Nginx config copied
- [ ] Domain configured
- [ ] Config test passed
- [ ] Nginx reloaded

---

## 📝 Step 9: Start Application

**Time**: 3 minutes

```bash
# Switch to deploy user
sudo -u deploy -i

# Navigate to app
cd /var/www/abcotronics-erp

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 config
pm2 save

# Check status
pm2 status
pm2 logs
```

**Checklist:**
- [ ] PM2 started successfully
- [ ] Status shows "online"
- [ ] No errors in logs
- [ ] Can access health endpoint

**Test:**
```bash
curl http://localhost:3000/health
# Should return: {"status":"ok"}
```

---

## 📝 Step 10: Setup Domain and SSL (Optional)

**Time**: 10 minutes

### Configure Domain DNS
1. [ ] Log in to domain registrar
2. [ ] Add A record: `@` → `YOUR_DROPLET_IP`
3. [ ] Add A record: `www` → `YOUR_DROPLET_IP`
4. [ ] Wait 5-30 minutes for DNS propagation

**Check DNS:**
```bash
nslookup your-domain.com
```

### Install SSL Certificate
```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

1. [ ] Enter email address
2. [ ] Agree to terms
3. [ ] Choose option 2 (redirect HTTP to HTTPS)

**Checklist:**
- [ ] DNS records added
- [ ] DNS propagated
- [ ] SSL certificate installed
- [ ] Auto-renewal configured

**Test:**
- [ ] Visit https://your-domain.com
- [ ] SSL padlock shows in browser
- [ ] Application loads correctly

---

## 📝 Step 11: Setup GitHub Actions CI/CD

**Time**: 10 minutes

### Generate Deploy SSH Key
```bash
# On droplet
sudo -u deploy ssh-keygen -t ed25519 -f /home/deploy/.ssh/github_actions -C "github-actions"

# Display private key (for GitHub Secrets)
sudo cat /home/deploy/.ssh/github_actions

# Add public key to authorized_keys
sudo cat /home/deploy/.ssh/github_actions.pub | sudo -u deploy tee -a /home/deploy/.ssh/authorized_keys
```

### Add GitHub Secrets
1. [ ] Go to: GitHub → Repo → Settings → Secrets and variables → Actions
2. [ ] Add secret: `DROPLET_HOST` = Your droplet IP
3. [ ] Add secret: `DROPLET_USER` = `deploy`
4. [ ] Add secret: `DROPLET_SSH_KEY` = Private key content

**Checklist:**
- [ ] Deploy SSH key generated
- [ ] Public key added to authorized_keys
- [ ] All 3 secrets added to GitHub

### Test Automated Deployment
```bash
# On local machine
echo "# Test deployment" >> README.md
git add README.md
git commit -m "test: Automated deployment"
git push origin main
```

1. [ ] Go to GitHub → Actions
2. [ ] Watch deployment workflow
3. [ ] Deployment completes successfully
4. [ ] Check app on server: `pm2 logs`

---

## 📝 Step 12: Final Verification

**Time**: 5 minutes

### Test All Features
- [ ] Frontend loads: https://your-domain.com
- [ ] Can log in
- [ ] API works: https://your-domain.com/api/health
- [ ] Database queries work
- [ ] File uploads work (if applicable)

### Monitor Health
```bash
pm2 status
pm2 monit
```

- [ ] CPU usage normal (<50%)
- [ ] Memory usage normal (<80%)
- [ ] No error logs
- [ ] Response times good (<200ms)

### Security Check
- [ ] HTTPS works (green padlock)
- [ ] HTTP redirects to HTTPS
- [ ] Firewall enabled: `sudo ufw status`
- [ ] Only ports 22, 80, 443 open
- [ ] Database not accessible externally

---

## 🎉 Deployment Complete!

### What You've Achieved:
✅ Git repository initialized and pushed to GitHub  
✅ DigitalOcean droplet configured and secured  
✅ Application deployed and running with PM2  
✅ Nginx reverse proxy configured  
✅ SSL/HTTPS encryption enabled  
✅ Automated CI/CD with GitHub Actions  
✅ Database setup and migrated  
✅ Domain configured (if applicable)  

### Your URLs:
- **Production**: https://your-domain.com
- **API**: https://your-domain.com/api
- **GitHub**: https://github.com/YOUR_USERNAME/abcotronics-erp

### Quick Commands:
```bash
# Deploy new changes
git push origin main

# Check application
ssh deploy@YOUR_DROPLET_IP
pm2 status
pm2 logs

# Rollback if needed
./deploy/rollback.sh
```

### Next Steps:
1. Set up monitoring (optional)
2. Configure backups
3. Add team members
4. Plan regular maintenance

---

## 📚 Additional Resources

- **Deployment Guide**: `deploy/DEPLOYMENT_GUIDE.md`
- **Quick Reference**: `deploy/QUICK_REFERENCE.md`
- **README**: `README.md`

---

## 🆘 Need Help?

If something isn't working:

1. **Check logs**: `pm2 logs`
2. **Check Nginx**: `sudo nginx -t`
3. **Check database**: `sudo systemctl status postgresql`
4. **Review**: `deploy/DEPLOYMENT_GUIDE.md` → Troubleshooting section

---

**Checklist completed**: _____ / _____ steps  
**Deployment date**: _________________  
**Deployed by**: _________________  
**Production URL**: _________________  

🎉 **Congratulations on your successful deployment!**
