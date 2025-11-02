#!/bin/bash

# SSH Migration using Node.js on server
# This uses the server's existing Prisma connection
# Usage: ./migrate-via-ssh-node.sh user@host [app_path]

set -e

SSH_HOST="${1:-}"
APP_PATH="${2:-/var/www/erp}"

if [ -z "$SSH_HOST" ]; then
    echo "Usage: ./migrate-via-ssh-node.sh user@host [app_path]"
    echo "Example: ./migrate-via-ssh-node.sh user@example.com /var/www/erp"
    exit 1
fi

echo "🔧 Running migration via SSH using Node.js on server..."
echo "📡 Server: $SSH_HOST"
echo "📁 App path: $APP_PATH"
echo ""

# Create migration script on server
ssh "$SSH_HOST" "cat > $APP_PATH/run-migration-remote.js << 'REMOTE_EOF'
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function runMigration() {
  try {
    console.log('🔧 Starting migration on server...');
    
    // Step 1: Add column
    try {
      await prisma.\$executeRawUnsafe(\`
        ALTER TABLE \\\"InventoryItem\\\" 
        ADD COLUMN IF NOT EXISTS \\\"locationId\\\" TEXT
      \`);
      console.log('✅ Step 1: locationId column added');
    } catch (e) {
      if (e.message?.includes('already exists')) {
        console.log('✅ Step 1: Column already exists');
      } else throw e;
    }

    // Step 2: Create index
    try {
      await prisma.\$executeRawUnsafe(\`
        CREATE INDEX IF NOT EXISTS \\\"InventoryItem_locationId_idx\\\" 
        ON \\\"InventoryItem\\\"(\\\"locationId\\\")
      \`);
      console.log('✅ Step 2: Index created');
    } catch (e) {
      console.log('⚠️ Step 2: Index may already exist');
    }

    // Step 3: Main Warehouse
    let mainWarehouse = await prisma.stockLocation.findFirst({
      where: { code: 'LOC001' }
    });
    
    if (!mainWarehouse) {
      mainWarehouse = await prisma.stockLocation.create({
        data: {
          code: 'LOC001',
          name: 'Main Warehouse',
          type: 'warehouse',
          status: 'active',
          address: '',
          contactPerson: '',
          contactPhone: '',
          meta: '{}'
        }
      });
      console.log('✅ Step 3: Main Warehouse created');
    } else {
      console.log('✅ Step 3: Main Warehouse exists');
    }

    // Step 4: Assign inventory
    const result = await prisma.inventoryItem.updateMany({
      where: { OR: [{ locationId: null }, { locationId: '' }] },
      data: { locationId: mainWarehouse.id }
    });
    console.log(\`✅ Step 4: Assigned \${result.count} items\`);

    console.log('✅✅✅ Migration complete!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.\$disconnect();
  }
}

runMigration().then(() => process.exit(0)).catch(() => process.exit(1));
REMOTE_EOF
"

echo "✅ Script uploaded to server"
echo "🚀 Running migration..."

ssh "$SSH_HOST" "cd $APP_PATH && node run-migration-remote.js"

echo ""
echo "✅✅✅ Migration completed via SSH! ✅✅✅"
echo ""
echo "📋 Next steps:"
echo "   1. Restart your server on $SSH_HOST"
echo "   2. Test the feature"

