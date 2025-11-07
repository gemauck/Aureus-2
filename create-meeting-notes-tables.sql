-- Meeting Notes Platform - SQL Migration Script
-- Run this directly on the database when Prisma migration fails due to connection issues

-- MonthlyMeetingNotes
CREATE TABLE IF NOT EXISTS "MonthlyMeetingNotes" (
    "id" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "monthlyGoals" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyMeetingNotes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MonthlyMeetingNotes_monthKey_key" ON "MonthlyMeetingNotes"("monthKey");
CREATE INDEX IF NOT EXISTS "MonthlyMeetingNotes_monthKey_idx" ON "MonthlyMeetingNotes"("monthKey");
CREATE INDEX IF NOT EXISTS "MonthlyMeetingNotes_status_idx" ON "MonthlyMeetingNotes"("status");
CREATE INDEX IF NOT EXISTS "MonthlyMeetingNotes_ownerId_idx" ON "MonthlyMeetingNotes"("ownerId");

-- WeeklyMeetingNotes
CREATE TABLE IF NOT EXISTS "WeeklyMeetingNotes" (
    "id" TEXT NOT NULL,
    "monthlyNotesId" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3),
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyMeetingNotes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WeeklyMeetingNotes_monthlyNotesId_weekKey_key" ON "WeeklyMeetingNotes"("monthlyNotesId", "weekKey");
CREATE INDEX IF NOT EXISTS "WeeklyMeetingNotes_monthlyNotesId_idx" ON "WeeklyMeetingNotes"("monthlyNotesId");
CREATE INDEX IF NOT EXISTS "WeeklyMeetingNotes_weekKey_idx" ON "WeeklyMeetingNotes"("weekKey");
CREATE INDEX IF NOT EXISTS "WeeklyMeetingNotes_ownerId_idx" ON "WeeklyMeetingNotes"("ownerId");

ALTER TABLE "WeeklyMeetingNotes" ADD CONSTRAINT IF NOT EXISTS "WeeklyMeetingNotes_monthlyNotesId_fkey" FOREIGN KEY ("monthlyNotesId") REFERENCES "MonthlyMeetingNotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DepartmentNotes
CREATE TABLE IF NOT EXISTS "DepartmentNotes" (
    "id" TEXT NOT NULL,
    "weeklyNotesId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "successes" TEXT NOT NULL DEFAULT '',
    "weekToFollow" TEXT NOT NULL DEFAULT '',
    "frustrations" TEXT NOT NULL DEFAULT '',
    "agendaPoints" TEXT NOT NULL DEFAULT '[]',
    "assignedUserId" TEXT,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentNotes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DepartmentNotes_weeklyNotesId_departmentId_key" ON "DepartmentNotes"("weeklyNotesId", "departmentId");
CREATE INDEX IF NOT EXISTS "DepartmentNotes_weeklyNotesId_idx" ON "DepartmentNotes"("weeklyNotesId");
CREATE INDEX IF NOT EXISTS "DepartmentNotes_departmentId_idx" ON "DepartmentNotes"("departmentId");
CREATE INDEX IF NOT EXISTS "DepartmentNotes_assignedUserId_idx" ON "DepartmentNotes"("assignedUserId");

ALTER TABLE "DepartmentNotes" ADD CONSTRAINT IF NOT EXISTS "DepartmentNotes_weeklyNotesId_fkey" FOREIGN KEY ("weeklyNotesId") REFERENCES "WeeklyMeetingNotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentNotes" ADD CONSTRAINT IF NOT EXISTS "DepartmentNotes_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- MeetingActionItem
CREATE TABLE IF NOT EXISTS "MeetingActionItem" (
    "id" TEXT NOT NULL,
    "monthlyNotesId" TEXT,
    "weeklyNotesId" TEXT,
    "departmentNotesId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "assignedUserId" TEXT,
    "dueDate" TIMESTAMP(3),
    "completedDate" TIMESTAMP(3),
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingActionItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MeetingActionItem_monthlyNotesId_idx" ON "MeetingActionItem"("monthlyNotesId");
CREATE INDEX IF NOT EXISTS "MeetingActionItem_weeklyNotesId_idx" ON "MeetingActionItem"("weeklyNotesId");
CREATE INDEX IF NOT EXISTS "MeetingActionItem_departmentNotesId_idx" ON "MeetingActionItem"("departmentNotesId");
CREATE INDEX IF NOT EXISTS "MeetingActionItem_assignedUserId_idx" ON "MeetingActionItem"("assignedUserId");
CREATE INDEX IF NOT EXISTS "MeetingActionItem_status_idx" ON "MeetingActionItem"("status");
CREATE INDEX IF NOT EXISTS "MeetingActionItem_dueDate_idx" ON "MeetingActionItem"("dueDate");

ALTER TABLE "MeetingActionItem" ADD CONSTRAINT IF NOT EXISTS "MeetingActionItem_monthlyNotesId_fkey" FOREIGN KEY ("monthlyNotesId") REFERENCES "MonthlyMeetingNotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingActionItem" ADD CONSTRAINT IF NOT EXISTS "MeetingActionItem_weeklyNotesId_fkey" FOREIGN KEY ("weeklyNotesId") REFERENCES "WeeklyMeetingNotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingActionItem" ADD CONSTRAINT IF NOT EXISTS "MeetingActionItem_departmentNotesId_fkey" FOREIGN KEY ("departmentNotesId") REFERENCES "DepartmentNotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingActionItem" ADD CONSTRAINT IF NOT EXISTS "MeetingActionItem_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- MeetingComment
CREATE TABLE IF NOT EXISTS "MeetingComment" (
    "id" TEXT NOT NULL,
    "monthlyNotesId" TEXT,
    "departmentNotesId" TEXT,
    "actionItemId" TEXT,
    "content" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MeetingComment_monthlyNotesId_idx" ON "MeetingComment"("monthlyNotesId");
CREATE INDEX IF NOT EXISTS "MeetingComment_departmentNotesId_idx" ON "MeetingComment"("departmentNotesId");
CREATE INDEX IF NOT EXISTS "MeetingComment_actionItemId_idx" ON "MeetingComment"("actionItemId");
CREATE INDEX IF NOT EXISTS "MeetingComment_authorId_idx" ON "MeetingComment"("authorId");
CREATE INDEX IF NOT EXISTS "MeetingComment_createdAt_idx" ON "MeetingComment"("createdAt");

ALTER TABLE "MeetingComment" ADD CONSTRAINT IF NOT EXISTS "MeetingComment_monthlyNotesId_fkey" FOREIGN KEY ("monthlyNotesId") REFERENCES "MonthlyMeetingNotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingComment" ADD CONSTRAINT IF NOT EXISTS "MeetingComment_departmentNotesId_fkey" FOREIGN KEY ("departmentNotesId") REFERENCES "DepartmentNotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingComment" ADD CONSTRAINT IF NOT EXISTS "MeetingComment_actionItemId_fkey" FOREIGN KEY ("actionItemId") REFERENCES "MeetingActionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingComment" ADD CONSTRAINT IF NOT EXISTS "MeetingComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- MeetingUserAllocation
CREATE TABLE IF NOT EXISTS "MeetingUserAllocation" (
    "id" TEXT NOT NULL,
    "monthlyNotesId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'contributor',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingUserAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MeetingUserAllocation_monthlyNotesId_departmentId_userId_key" ON "MeetingUserAllocation"("monthlyNotesId", "departmentId", "userId");
CREATE INDEX IF NOT EXISTS "MeetingUserAllocation_monthlyNotesId_idx" ON "MeetingUserAllocation"("monthlyNotesId");
CREATE INDEX IF NOT EXISTS "MeetingUserAllocation_departmentId_idx" ON "MeetingUserAllocation"("departmentId");
CREATE INDEX IF NOT EXISTS "MeetingUserAllocation_userId_idx" ON "MeetingUserAllocation"("userId");

ALTER TABLE "MeetingUserAllocation" ADD CONSTRAINT IF NOT EXISTS "MeetingUserAllocation_monthlyNotesId_fkey" FOREIGN KEY ("monthlyNotesId") REFERENCES "MonthlyMeetingNotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingUserAllocation" ADD CONSTRAINT IF NOT EXISTS "MeetingUserAllocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Update updatedAt trigger function (if it doesn't exist)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updatedAt (if they don't exist)
DROP TRIGGER IF EXISTS update_monthlymeetingnotes_updated_at ON "MonthlyMeetingNotes";
CREATE TRIGGER update_monthlymeetingnotes_updated_at BEFORE UPDATE ON "MonthlyMeetingNotes" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_weeklymeetingnotes_updated_at ON "WeeklyMeetingNotes";
CREATE TRIGGER update_weeklymeetingnotes_updated_at BEFORE UPDATE ON "WeeklyMeetingNotes" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_departmentnotes_updated_at ON "DepartmentNotes";
CREATE TRIGGER update_departmentnotes_updated_at BEFORE UPDATE ON "DepartmentNotes" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_meetingactionitem_updated_at ON "MeetingActionItem";
CREATE TRIGGER update_meetingactionitem_updated_at BEFORE UPDATE ON "MeetingActionItem" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_meetingcomment_updated_at ON "MeetingComment";
CREATE TRIGGER update_meetingcomment_updated_at BEFORE UPDATE ON "MeetingComment" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_meetinguserallocation_updated_at ON "MeetingUserAllocation";
CREATE TRIGGER update_meetinguserallocation_updated_at BEFORE UPDATE ON "MeetingUserAllocation" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

