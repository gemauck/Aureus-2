#!/bin/bash

###############################################################################
# Git Repository Initialization Script
# Run this script once to setup Git and push to GitHub
###############################################################################

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Abcotronics ERP - Git Setup${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo -e "${RED}Error: Git is not installed${NC}"
    echo "Please install Git first: https://git-scm.com/downloads"
    exit 1
fi

# Get GitHub username
echo -e "${YELLOW}Enter your GitHub username:${NC}"
read GITHUB_USERNAME

if [ -z "$GITHUB_USERNAME" ]; then
    echo -e "${RED}Error: GitHub username is required${NC}"
    exit 1
fi

# Get repository name
echo -e "${YELLOW}Enter repository name (default: abcotronics-erp):${NC}"
read REPO_NAME
REPO_NAME=${REPO_NAME:-abcotronics-erp}

# Configure Git user (if not already configured)
if [ -z "$(git config --global user.name)" ]; then
    echo -e "${YELLOW}Enter your name for Git commits:${NC}"
    read GIT_NAME
    git config --global user.name "$GIT_NAME"
fi

if [ -z "$(git config --global user.email)" ]; then
    echo -e "${YELLOW}Enter your email for Git commits:${NC}"
    read GIT_EMAIL
    git config --global user.email "$GIT_EMAIL"
fi

echo ""
echo -e "${GREEN}✓ Git user configured:${NC}"
echo "  Name: $(git config --global user.name)"
echo "  Email: $(git config --global user.email)"
echo ""

# Initialize Git repository if not already initialized
if [ ! -d .git ]; then
    echo -e "${YELLOW}[1/5] Initializing Git repository...${NC}"
    git init
    echo -e "${GREEN}✓ Git repository initialized${NC}"
else
    echo -e "${GREEN}✓ Git repository already exists${NC}"
fi

# Add all files
echo -e "${YELLOW}[2/5] Adding files to Git...${NC}"
git add .

# Create initial commit
echo -e "${YELLOW}[3/5] Creating initial commit...${NC}"
if git diff-index --quiet HEAD -- 2>/dev/null; then
    echo -e "${GREEN}✓ No changes to commit${NC}"
else
    git commit -m "Initial commit - Abcotronics ERP system

- Complete ERP system with CRM, Projects, Time Tracking, Invoicing, HR
- React frontend with modular architecture
- Node.js backend with PostgreSQL database
- Automated deployment with GitHub Actions
- PM2 process management
- Nginx reverse proxy configuration
- SSL/HTTPS support"
    echo -e "${GREEN}✓ Initial commit created${NC}"
fi

# Set main branch
echo -e "${YELLOW}[4/5] Setting up main branch...${NC}"
git branch -M main
echo -e "${GREEN}✓ Main branch configured${NC}"

# Add GitHub remote
echo -e "${YELLOW}[5/5] Adding GitHub remote...${NC}"
REMOTE_URL="git@github.com:${GITHUB_USERNAME}/${REPO_NAME}.git"

if git remote | grep -q "^origin$"; then
    echo "Remote 'origin' already exists. Updating URL..."
    git remote set-url origin "$REMOTE_URL"
else
    git remote add origin "$REMOTE_URL"
fi

echo -e "${GREEN}✓ GitHub remote configured${NC}"
echo "  URL: $REMOTE_URL"
echo ""

# Instructions for GitHub
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Git Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "1. Create a GitHub repository:"
echo "   → Go to: https://github.com/new"
echo "   → Repository name: $REPO_NAME"
echo "   → Privacy: Private (recommended)"
echo "   → Do NOT initialize with README, .gitignore, or license"
echo "   → Click 'Create repository'"
echo ""
echo "2. Push to GitHub:"
echo "   → Run: ${GREEN}git push -u origin main${NC}"
echo ""
echo "3. Verify push:"
echo "   → Go to: https://github.com/${GITHUB_USERNAME}/${REPO_NAME}"
echo ""
echo "4. Setup GitHub Secrets for deployment:"
echo "   → Repository → Settings → Secrets and variables → Actions"
echo "   → Add these secrets:"
echo "     • DROPLET_HOST: Your droplet IP"
echo "     • DROPLET_USER: deploy"
echo "     • DROPLET_SSH_KEY: Your SSH private key"
echo ""
echo "5. Create development branch:"
echo "   → Run: ${GREEN}git checkout -b development${NC}"
echo "   → Run: ${GREEN}git push -u origin development${NC}"
echo ""
echo -e "${GREEN}========================================${NC}"
echo ""
echo "📚 Read the deployment guide:"
echo "   deploy/DEPLOYMENT_GUIDE.md"
echo ""
echo "🚀 Ready to push to GitHub!"
echo "   Run: ${GREEN}git push -u origin main${NC}"
echo ""
