#!/bin/bash
# Deploy Helpdesk Ticket table migration
# Run this when database connections are available

set -e

echo "🚀 Deploying Helpdesk Ticket table migration..."

ssh root@abcoafrica.co.za << 'ENDSSH'
set -e

cd /var/www/abcotronics-erp

echo "📋 Checking if Ticket table exists..."
TABLE_EXISTS=$(psql $DATABASE_URL -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'Ticket');" 2>/dev/null || echo "false")

if [ "$TABLE_EXISTS" = "t" ]; then
    echo "✅ Ticket table already exists"
    exit 0
fi

echo "📦 Creating Ticket table..."

# Use Prisma db push as it's safer than raw SQL
echo "🔄 Running Prisma db push..."
npx prisma db push --accept-data-loss --skip-generate || {
    echo "⚠️  Prisma db push failed, trying SQL approach..."
    
    # Fallback: Use SQL directly
    psql $DATABASE_URL << 'SQL'
-- Create Ticket table
CREATE TABLE IF NOT EXISTS "Ticket" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "category" TEXT NOT NULL DEFAULT 'general',
    "type" TEXT NOT NULL DEFAULT 'internal',
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "clientId" TEXT,
    "projectId" TEXT,
    "relatedTicketId" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "attachments" TEXT NOT NULL DEFAULT '[]',
    "comments" TEXT NOT NULL DEFAULT '[]',
    "activityLog" TEXT NOT NULL DEFAULT '[]',
    "customFields" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "responseTimeMinutes" INTEGER,
    "resolutionTimeMinutes" INTEGER,
    "targetResponseMinutes" INTEGER,
    "targetResolutionMinutes" INTEGER,
    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Ticket_ticketNumber_key" ON "Ticket"("ticketNumber");
CREATE INDEX IF NOT EXISTS "Ticket_status_idx" ON "Ticket"("status");
CREATE INDEX IF NOT EXISTS "Ticket_priority_idx" ON "Ticket"("priority");
CREATE INDEX IF NOT EXISTS "Ticket_category_idx" ON "Ticket"("category");
CREATE INDEX IF NOT EXISTS "Ticket_createdById_idx" ON "Ticket"("createdById");
CREATE INDEX IF NOT EXISTS "Ticket_assignedToId_idx" ON "Ticket"("assignedToId");
CREATE INDEX IF NOT EXISTS "Ticket_clientId_idx" ON "Ticket"("clientId");
CREATE INDEX IF NOT EXISTS "Ticket_projectId_idx" ON "Ticket"("projectId");
CREATE INDEX IF NOT EXISTS "Ticket_createdAt_idx" ON "Ticket"("createdAt");
CREATE INDEX IF NOT EXISTS "Ticket_dueDate_idx" ON "Ticket"("dueDate");
SQL
}

echo "🔄 Regenerating Prisma client..."
npx prisma generate

echo "✅ Migration complete!"
ENDSSH

echo "✅ Helpdesk migration deployment complete!"











