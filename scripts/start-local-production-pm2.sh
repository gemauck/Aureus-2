#!/bin/bash
# Start local production server using PM2 (exactly like droplet)
# This runs the app in production mode with PM2 for process management

set -e

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "   Run 'npm run setup:local-prod' first to set up the environment"
    exit 1
fi

# Check if build exists
if [ ! -d "dist" ] || [ ! -f "dist/styles.css" ]; then
    echo "⚠️  Build not found. Building now..."
    npm run build
fi

# Ensure Prisma client is generated
if [ ! -d "node_modules/.prisma" ]; then
    echo "🏗️  Generating Prisma client..."
    npx prisma generate
fi

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
fi

# Create logs directory
mkdir -p logs

# Create local PM2 ecosystem file
cat > ecosystem.local.mjs << 'EOFPM2'
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file
const envFile = readFileSync(join(__dirname, '.env'), 'utf8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      let value = valueParts.join('=');
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      envVars[key.trim()] = value;
    }
  }
});

export default {
  apps: [{
    name: 'abcotronics-erp-local',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: envVars.PORT || '3000',
      ...envVars
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
EOFPM2

echo "🚀 Starting local production server with PM2..."
echo ""

# Stop existing PM2 process if running
pm2 delete abcotronics-erp-local 2>/dev/null || true

# Start with PM2
pm2 start ecosystem.local.mjs

# Show status
echo ""
echo "✅ Server started with PM2"
echo ""
pm2 status
echo ""
echo "📝 View logs:"
echo "   pm2 logs abcotronics-erp-local"
echo ""
echo "🛑 Stop server:"
echo "   pm2 stop abcotronics-erp-local"
echo "   pm2 delete abcotronics-erp-local"
echo ""
echo "🌐 Server should be available at: http://localhost:${PORT:-3000}"











