-- Leave Platform Database Migration
-- Run this SQL script on the production database when connection slots are available
-- This creates all necessary tables for the Leave Platform

-- LeaveApplication table
CREATE TABLE IF NOT EXISTS "LeaveApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "days" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "emergency" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "appliedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedDate" TIMESTAMP(3),
    "rejectedDate" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectedById" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LeaveApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LeaveApplication_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LeaveApplication_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- LeaveBalance table
CREATE TABLE IF NOT EXISTS "LeaveBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "available" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "used" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "year" INTEGER NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LeaveBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LeaveBalance_userId_leaveType_year_key" UNIQUE ("userId", "leaveType", "year")
);

-- LeaveApprover table
CREATE TABLE IF NOT EXISTS "LeaveApprover" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "department" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LeaveApprover_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LeaveApprover_department_approverId_key" UNIQUE ("department", "approverId")
);

-- Birthday table
CREATE TABLE IF NOT EXISTS "Birthday" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Birthday_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Birthday_userId_key" UNIQUE ("userId")
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "LeaveApplication_userId_idx" ON "LeaveApplication"("userId");
CREATE INDEX IF NOT EXISTS "LeaveApplication_status_idx" ON "LeaveApplication"("status");
CREATE INDEX IF NOT EXISTS "LeaveApplication_startDate_idx" ON "LeaveApplication"("startDate");
CREATE INDEX IF NOT EXISTS "LeaveApplication_endDate_idx" ON "LeaveApplication"("endDate");
CREATE INDEX IF NOT EXISTS "LeaveApplication_approvedById_idx" ON "LeaveApplication"("approvedById");

CREATE INDEX IF NOT EXISTS "LeaveBalance_userId_idx" ON "LeaveBalance"("userId");
CREATE INDEX IF NOT EXISTS "LeaveBalance_leaveType_idx" ON "LeaveBalance"("leaveType");
CREATE INDEX IF NOT EXISTS "LeaveBalance_year_idx" ON "LeaveBalance"("year");

CREATE INDEX IF NOT EXISTS "LeaveApprover_department_idx" ON "LeaveApprover"("department");
CREATE INDEX IF NOT EXISTS "LeaveApprover_approverId_idx" ON "LeaveApprover"("approverId");

CREATE INDEX IF NOT EXISTS "Birthday_userId_idx" ON "Birthday"("userId");
CREATE INDEX IF NOT EXISTS "Birthday_date_idx" ON "Birthday"("date");

-- Add trigger for updatedAt
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_leave_application_updated_at BEFORE UPDATE ON "LeaveApplication"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leave_balance_updated_at BEFORE UPDATE ON "LeaveBalance"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leave_approver_updated_at BEFORE UPDATE ON "LeaveApprover"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_birthday_updated_at BEFORE UPDATE ON "Birthday"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

