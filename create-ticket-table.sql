-- Create Ticket table for Helpdesk module
-- This migration adds the Ticket model to the database

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
    "updatedAt" TIMESTAMP(3) NOT NULL,
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

-- Create unique constraint on ticketNumber
CREATE UNIQUE INDEX IF NOT EXISTS "Ticket_ticketNumber_key" ON "Ticket"("ticketNumber");

-- Create indexes
CREATE INDEX IF NOT EXISTS "Ticket_status_idx" ON "Ticket"("status");
CREATE INDEX IF NOT EXISTS "Ticket_priority_idx" ON "Ticket"("priority");
CREATE INDEX IF NOT EXISTS "Ticket_category_idx" ON "Ticket"("category");
CREATE INDEX IF NOT EXISTS "Ticket_createdById_idx" ON "Ticket"("createdById");
CREATE INDEX IF NOT EXISTS "Ticket_assignedToId_idx" ON "Ticket"("assignedToId");
CREATE INDEX IF NOT EXISTS "Ticket_clientId_idx" ON "Ticket"("clientId");
CREATE INDEX IF NOT EXISTS "Ticket_projectId_idx" ON "Ticket"("projectId");
CREATE INDEX IF NOT EXISTS "Ticket_createdAt_idx" ON "Ticket"("createdAt");
CREATE INDEX IF NOT EXISTS "Ticket_dueDate_idx" ON "Ticket"("dueDate");

-- Add foreign key constraints
DO $$ 
BEGIN
    -- Add foreign key to User (createdBy)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'Ticket_createdById_fkey'
    ) THEN
        ALTER TABLE "Ticket" 
        ADD CONSTRAINT "Ticket_createdById_fkey" 
        FOREIGN KEY ("createdById") 
        REFERENCES "User"("id") 
        ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    -- Add foreign key to User (assignedTo)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'Ticket_assignedToId_fkey'
    ) THEN
        ALTER TABLE "Ticket" 
        ADD CONSTRAINT "Ticket_assignedToId_fkey" 
        FOREIGN KEY ("assignedToId") 
        REFERENCES "User"("id") 
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- Add foreign key to Client
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'Ticket_clientId_fkey'
    ) THEN
        ALTER TABLE "Ticket" 
        ADD CONSTRAINT "Ticket_clientId_fkey" 
        FOREIGN KEY ("clientId") 
        REFERENCES "Client"("id") 
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- Add foreign key to Project
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'Ticket_projectId_fkey'
    ) THEN
        ALTER TABLE "Ticket" 
        ADD CONSTRAINT "Ticket_projectId_fkey" 
        FOREIGN KEY ("projectId") 
        REFERENCES "Project"("id") 
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- Add self-referential foreign key for related tickets
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'Ticket_relatedTicketId_fkey'
    ) THEN
        ALTER TABLE "Ticket" 
        ADD CONSTRAINT "Ticket_relatedTicketId_fkey" 
        FOREIGN KEY ("relatedTicketId") 
        REFERENCES "Ticket"("id") 
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;










