-- Phase 3: Create Normalized Tables (Safe - No Data Loss)
-- This creates NEW tables - existing JSON data remains untouched

-- Create ClientContact table
CREATE TABLE IF NOT EXISTS "ClientContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "role" TEXT,
    "title" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    
    CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") 
        REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create ClientComment table
CREATE TABLE IF NOT EXISTS "ClientComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "authorId" TEXT,
    "author" TEXT NOT NULL DEFAULT '',
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    
    CONSTRAINT "ClientComment_clientId_fkey" FOREIGN KEY ("clientId") 
        REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientComment_authorId_fkey" FOREIGN KEY ("authorId") 
        REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Create indexes for ClientContact
CREATE INDEX IF NOT EXISTS "ClientContact_clientId_idx" ON "ClientContact"("clientId");
CREATE INDEX IF NOT EXISTS "ClientContact_email_idx" ON "ClientContact"("email");
CREATE INDEX IF NOT EXISTS "ClientContact_phone_idx" ON "ClientContact"("phone");
CREATE INDEX IF NOT EXISTS "ClientContact_mobile_idx" ON "ClientContact"("mobile");
CREATE INDEX IF NOT EXISTS "ClientContact_isPrimary_idx" ON "ClientContact"("isPrimary");

-- Create indexes for ClientComment
CREATE INDEX IF NOT EXISTS "ClientComment_clientId_idx" ON "ClientComment"("clientId");
CREATE INDEX IF NOT EXISTS "ClientComment_createdAt_idx" ON "ClientComment"("createdAt");
CREATE INDEX IF NOT EXISTS "ClientComment_authorId_idx" ON "ClientComment"("authorId");




