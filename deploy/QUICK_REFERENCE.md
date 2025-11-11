# 🚀 Quick Reference - Deployment Commands

## Essential Commands

### On Local Machine

```bash
# Commit and push changes (triggers auto-deploy)
git add .
git commit -m "Your message"
git push origin main

# Check deployment status
# Go to: https://github.com/yourusername/abcotronics-erp/actions
```

### On Droplet (via SSH)

```bash
# SSH into droplet
ssh deploy@YOUR_DROPLET_IP

# Check application status
pm2 status
pm2 logs
pm2 monit

# Restart application
pm2 restart abcotronics-erp

# Manual update
cd /var/www/abcotronics-erp
git pull origin main
./deploy/deploy.sh

# Rollback to previous version
./deploy/rollback.sh

# View logs
pm2 logs abcotronics-erp
pm2 logs --lines 100

# Database backup
sudo -u postgres pg_dump abcotronics_erp > backup_$(date +%Y%m%d_%H%M%S).sql

# Restart Nginx
sudo systemctl restart nginx
sudo nginx -t  # Test config first

# Check system resources
htop
df -h
free -h
```

## PM2 Commands

```bash
pm2 list                    # List all processes
pm2 logs                    # View logs
pm2 logs --lines 50         # View last 50 lines
pm2 restart abcotronics-erp # Restart app
pm2 reload abcotronics-erp  # Zero-downtime reload
pm2 stop abcotronics-erp    # Stop app
pm2 delete abcotronics-erp  # Remove from PM2
pm2 monit                   # Monitor resources
pm2 save                    # Save current state
```

## Git Commands

```bash
# Check status
git status
git log --oneline -5

# Create feature branch
git checkout -b feature/new-feature
git push -u origin feature/new-feature

# Switch branches
git checkout main
git checkout development

# Update from remote
git pull origin main

# Stash changes
git stash
git stash pop

# View differences
git diff
```

## Nginx Commands

```bash
sudo systemctl status nginx   # Check status
sudo systemctl start nginx    # Start
sudo systemctl stop nginx     # Stop
sudo systemctl restart nginx  # Restart
sudo systemctl reload nginx   # Reload config
sudo nginx -t                 # Test config

# View logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/abcotronics-erp.access.log
```

## Database Commands

```bash
# Connect to database
sudo -u postgres psql -d abcotronics_erp

# Inside psql:
\dt                    # List tables
\d table_name          # Describe table
\du                    # List users
\l                     # List databases
\q                     # Quit

# Backup database
sudo -u postgres pg_dump abcotronics_erp > backup.sql

# Restore database
sudo -u postgres psql abcotronics_erp < backup.sql

# Check database size
sudo -u postgres psql -d abcotronics_erp -c "SELECT pg_size_pretty(pg_database_size('abcotronics_erp'));"
```

## SSL/Certbot Commands

```bash
sudo certbot certificates           # List certificates
sudo certbot renew                  # Renew all
sudo certbot renew --dry-run       # Test renewal
sudo certbot delete --cert-name your-domain.com  # Delete cert

# Force renewal
sudo certbot renew --force-renewal
```

## System Monitoring

```bash
# CPU and Memory
top
htop

# Disk usage
df -h
du -sh /var/www/abcotronics-erp

# Network
netstat -tuln
ss -tuln

# Check open files
lsof -i :3000

# View system logs
sudo journalctl -u nginx -n 50
sudo journalctl -xe
```

## Troubleshooting Quick Fixes

### Application not responding

```bash
pm2 restart abcotronics-erp
pm2 logs --lines 100
```

### 502 Bad Gateway

```bash
# Check if app is running
pm2 status

# Restart everything
pm2 restart all
sudo systemctl restart nginx
```

### Database connection error

```bash
# Check PostgreSQL
sudo systemctl status postgresql
sudo systemctl restart postgresql

# Test connection
sudo -u postgres psql -d abcotronics_erp -c "SELECT NOW();"
```

### Disk full

```bash
# Check disk space
df -h

# Clear PM2 logs
pm2 flush

# Clear old logs
sudo find /var/log -type f -name "*.log" -mtime +30 -delete

# Clear old backups
find . -name "backup_*.sql" -mtime +7 -delete
```

### SSL certificate expired

```bash
sudo certbot renew --force-renewal
sudo systemctl reload nginx
```

## Emergency Contacts

- **Server IP**: YOUR_DROPLET_IP
- **Domain**: your-domain.com
- **Database**: abcotronics_erp
- **DB User**: erp_user

## File Locations

- **App**: `/var/www/abcotronics-erp`
- **Logs**: `/var/www/abcotronics-erp/logs`
- **Nginx Config**: `/etc/nginx/sites-available/abcotronics-erp`
- **SSL Certs**: `/etc/letsencrypt/live/your-domain.com/`
- **Env File**: `/var/www/abcotronics-erp/.env`

## Useful One-liners

```bash
# Tail all logs in real-time
pm2 logs --lines 0

# Check last deploy time
git log -1 --format="%cd" --date=short

# Count database records
sudo -u postgres psql -d abcotronics_erp -c "SELECT COUNT(*) FROM clients;"

# Current memory usage
free -h | grep Mem | awk '{print $3 "/" $2}'

# Current disk usage
df -h / | tail -1 | awk '{print $3 "/" $2 " (" $5 ")"}'

# Application uptime
pm2 jlist | grep -o '"pm_uptime":[0-9]*' | head -1
```

---

**Print this page and keep it handy!** 📄

**Last Updated**: January 2025
