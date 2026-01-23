#!/bin/bash
# Single command to fix everything - copy and paste this entire block

# Fix PostgreSQL config
sudo bash -c 'echo "local   all   all   trust" > /tmp/pg_trust_line.txt && head -1 /tmp/pg_trust_line.txt > /tmp/pg_hba_new.txt && grep -v "^local.*all.*all.*trust" /Library/PostgreSQL/18/data/pg_hba.conf >> /tmp/pg_hba_new.txt && cp /Library/PostgreSQL/18/data/pg_hba.conf /Library/PostgreSQL/18/data/pg_hba.conf.backup && mv /tmp/pg_hba_new.txt /Library/PostgreSQL/18/data/pg_hba.conf'

# Restart PostgreSQL
sudo launchctl unload /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist 2>/dev/null
sleep 2
sudo launchctl load /Library/LaunchDaemons/com.edb.launchd.postgresql-18.plist 2>/dev/null
sleep 3

# Create database
createdb abcotronics_erp_local

# Create .env.local
cat > .env.local << 'EOF'
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000
DATABASE_URL="postgresql://gemau@localhost:5432/abcotronics_erp_local"
JWT_SECRET=0266f788ee2255e2aa973f0984903fb61f3fb1d9f528b315c9dbd0bf53fe5ea8
DEV_LOCAL_NO_DB=false
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=gemauck@gmail.com
SMTP_PASS=psrbqbzifyooosfx
EMAIL_FROM=gemauck@gmail.com
SMTP_FROM_EMAIL=noreply@abcotronics.com
SMTP_FROM_NAME=Abcotronics Security
EOF

# Set up schema
export DATABASE_URL="postgresql://gemau@localhost:5432/abcotronics_erp_local"
npx prisma db push --accept-data-loss

echo ""
echo "✅ Setup complete! Run: npm run dev"

