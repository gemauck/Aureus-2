#!/bin/bash

# Make all deployment scripts executable
chmod +x setup-git.sh
chmod +x deploy/setup-droplet.sh
chmod +x deploy/deploy.sh
chmod +x deploy/rollback.sh

echo "✅ All scripts are now executable!"
echo ""
echo "You can now run:"
echo "  ./setup-git.sh          - Initialize Git and push to GitHub"
echo "  ./deploy/setup-droplet.sh - Setup DigitalOcean droplet"
echo "  ./deploy/deploy.sh       - Quick deployment"
echo "  ./deploy/rollback.sh     - Rollback deployment"
echo ""
echo "📚 Read SETUP_COMPLETE.md for next steps!"
