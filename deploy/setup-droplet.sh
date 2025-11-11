#!/bin/bash

###############################################################################
# Abcotronics ERP - DigitalOcean Droplet Setup Script
# This script sets up a fresh Ubuntu 22.04 droplet for the ERP system
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Abcotronics ERP - Droplet Setup${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root (use sudo)${NC}"
    exit 1
fi

# Update system
echo -e "${YELLOW}[1/12] Updating system packages...${NC}"
apt update && apt upgrade -y

# Install essential packages
echo -e "${YELLOW}[2/12] Installing essential packages...${NC}"
apt install -y curl wget git ufw nginx certbot python3-certbot-nginx build-essential

# Install Node.js 18.x
echo -e "${YELLOW}[3/12] Installing Node.js 18.x...${NC}"
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Verify installations
echo -e "${GREEN}Node.js version: $(node -v)${NC}"
echo -e "${GREEN}npm version: $(npm -v)${NC}"

# Install PM2 globally
echo -e "${YELLOW}[4/12] Installing PM2...${NC}"
npm install -g pm2

# Install PostgreSQL
echo -e "${YELLOW}[5/12] Installing PostgreSQL...${NC}"
apt install -y postgresql postgresql-contrib

# Start and enable PostgreSQL
systemctl start postgresql
systemctl enable postgresql

# Create database and user
echo -e "${YELLOW}[6/12] Setting up PostgreSQL database...${NC}"
sudo -u postgres psql <<EOF
CREATE DATABASE abcotronics_erp;
CREATE USER erp_user WITH ENCRYPTED PASSWORD 'your_secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE abcotronics_erp TO erp_user;
ALTER DATABASE abcotronics_erp OWNER TO erp_user;
EOF

echo -e "${GREEN}✓ PostgreSQL database created${NC}"

# Create application user
echo -e "${YELLOW}[7/12] Creating application user...${NC}"
if ! id -u deploy &>/dev/null; then
    useradd -m -s /bin/bash deploy
    echo -e "${GREEN}✓ User 'deploy' created${NC}"
else
    echo -e "${GREEN}✓ User 'deploy' already exists${NC}"
fi

# Create application directory
echo -e "${YELLOW}[8/12] Creating application directory...${NC}"
mkdir -p /var/www/abcotronics-erp
mkdir -p /var/www/abcotronics-erp/logs
chown -R deploy:deploy /var/www/abcotronics-erp

# Setup SSH for deploy user (for Git)
echo -e "${YELLOW}[9/12] Setting up SSH for deploy user...${NC}"
sudo -u deploy mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chown deploy:deploy /home/deploy/.ssh

echo -e "${YELLOW}Generate SSH key for deploy user:${NC}"
echo "Run: sudo -u deploy ssh-keygen -t ed25519 -C 'deploy@abcotronics-erp'"
echo "Then add the public key to your GitHub repository"

# Configure firewall
echo -e "${YELLOW}[10/12] Configuring firewall...${NC}"
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable

# Setup Nginx
echo -e "${YELLOW}[11/12] Configuring Nginx...${NC}"
systemctl start nginx
systemctl enable nginx

# Create Nginx config
cat > /etc/nginx/sites-available/abcotronics-erp <<'NGINX_EOF'
# Paste the content from deploy/nginx.conf here
# Or copy it manually after setup
NGINX_EOF

# Enable the site (symlink will be created manually)
echo -e "${YELLOW}To enable the site, run:${NC}"
echo "ln -s /etc/nginx/sites-available/abcotronics-erp /etc/nginx/sites-enabled/"
echo "nginx -t && systemctl reload nginx"

# Setup PM2 startup
echo -e "${YELLOW}[12/12] Configuring PM2 startup...${NC}"
pm2 startup systemd -u deploy --hp /home/deploy
echo -e "${GREEN}✓ PM2 startup configured${NC}"

# Create .env template
cat > /var/www/abcotronics-erp/.env.template <<'ENV_EOF'
# Database Configuration
DATABASE_URL=postgresql://erp_user:your_secure_password_here@localhost:5432/abcotronics_erp
DB_HOST=localhost
DB_PORT=5432
DB_NAME=abcotronics_erp
DB_USER=erp_user
DB_PASSWORD=your_secure_password_here

# Server Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET=your_jwt_secret_here

# Session Secret (generate with: openssl rand -base64 32)
SESSION_SECRET=your_session_secret_here

# CORS Origins (comma-separated)
CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com

# Email Configuration (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@your-domain.com

# File Upload
MAX_FILE_SIZE=52428800
UPLOAD_DIR=/var/www/abcotronics-erp/uploads

# Logging
LOG_LEVEL=info
ENV_EOF

chown deploy:deploy /var/www/abcotronics-erp/.env.template

# Print next steps
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "1. Copy your SSH public key to GitHub:"
echo "   cat /home/deploy/.ssh/id_ed25519.pub"
echo ""
echo "2. Clone your repository:"
echo "   sudo -u deploy git clone git@github.com:yourusername/abcotronics-erp.git /var/www/abcotronics-erp"
echo ""
echo "3. Copy and configure environment variables:"
echo "   sudo -u deploy cp /var/www/abcotronics-erp/.env.template /var/www/abcotronics-erp/.env"
echo "   sudo -u deploy nano /var/www/abcotronics-erp/.env"
echo ""
echo "4. Install dependencies:"
echo "   cd /var/www/abcotronics-erp/server && sudo -u deploy npm ci --only=production"
echo ""
echo "5. Run database migrations:"
echo "   cd /var/www/abcotronics-erp/server && sudo -u deploy npm run migrate"
echo ""
echo "6. Configure Nginx:"
echo "   Copy deploy/nginx.conf to /etc/nginx/sites-available/abcotronics-erp"
echo "   ln -s /etc/nginx/sites-available/abcotronics-erp /etc/nginx/sites-enabled/"
echo "   nginx -t && systemctl reload nginx"
echo ""
echo "7. Setup SSL with Let's Encrypt:"
echo "   certbot --nginx -d your-domain.com -d www.your-domain.com"
echo ""
echo "8. Start the application:"
echo "   cd /var/www/abcotronics-erp && sudo -u deploy pm2 start ecosystem.config.js"
echo "   sudo -u deploy pm2 save"
echo ""
echo "9. Add GitHub Secrets for CI/CD:"
echo "   DROPLET_HOST: Your droplet IP address"
echo "   DROPLET_USER: deploy"
echo "   DROPLET_SSH_KEY: Your private SSH key"
echo ""
echo -e "${GREEN}========================================${NC}"
