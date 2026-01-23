#!/bin/bash
# Create database using postgres OS user directly

echo "Creating database using postgres OS user..."
echo "You'll be prompted for your macOS password:"

# Try to create database as postgres OS user
sudo -u postgres bash << 'EOF'
createdb abcotronics_erp_local 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Database created successfully"
    # Grant permissions to gemau user
    psql -d abcotronics_erp_local -c "GRANT ALL PRIVILEGES ON DATABASE abcotronics_erp_local TO gemau;" 2>/dev/null || true
    psql -d abcotronics_erp_local -c "ALTER DATABASE abcotronics_erp_local OWNER TO gemau;" 2>/dev/null || true
else
    echo "Checking if database already exists..."
    if psql -lqt | cut -d \| -f 1 | grep -qw abcotronics_erp_local; then
        echo "✅ Database already exists"
    else
        echo "❌ Failed to create database"
        exit 1
    fi
fi
EOF

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Database setup complete!"
    echo ""
    echo "Now run:"
    echo "  export DATABASE_URL=\"postgresql://gemau@localhost:5432/abcotronics_erp_local\""
    echo "  npx prisma db push --accept-data-loss"
    echo "  npm run dev"
else
    echo "❌ Failed to create database"
fi





