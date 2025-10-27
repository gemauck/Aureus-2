-- Add missing columns to User table
-- This fixes the error: "The column `main.User.department` does not exist in the current database."

-- Add department column
ALTER TABLE User ADD COLUMN department TEXT NOT NULL DEFAULT '';

-- Add other HR/Employee fields
ALTER TABLE User ADD COLUMN jobTitle TEXT NOT NULL DEFAULT '';
ALTER TABLE User ADD COLUMN phone TEXT NOT NULL DEFAULT '';
ALTER TABLE User ADD COLUMN avatar TEXT NOT NULL DEFAULT '';
ALTER TABLE User ADD COLUMN mustChangePassword BOOLEAN NOT NULL DEFAULT false;

-- Add employee fields
ALTER TABLE User ADD COLUMN employeeNumber TEXT;
ALTER TABLE User ADD COLUMN position TEXT NOT NULL DEFAULT '';
ALTER TABLE User ADD COLUMN employmentDate DATETIME;
ALTER TABLE User ADD COLUMN idNumber TEXT NOT NULL DEFAULT '';
ALTER TABLE User ADD COLUMN taxNumber TEXT;
ALTER TABLE User ADD COLUMN bankName TEXT;
ALTER TABLE User ADD COLUMN accountNumber TEXT;
ALTER TABLE User ADD COLUMN branchCode TEXT;
ALTER TABLE User ADD COLUMN salary REAL NOT NULL DEFAULT 0;
ALTER TABLE User ADD COLUMN employmentStatus TEXT NOT NULL DEFAULT 'Active';
ALTER TABLE User ADD COLUMN address TEXT NOT NULL DEFAULT '';
ALTER TABLE User ADD COLUMN emergencyContact TEXT NOT NULL DEFAULT '';

-- Create unique index for employeeNumber (nullable unique)
CREATE UNIQUE INDEX IF NOT EXISTS User_employeeNumber_key ON User(employeeNumber) WHERE employeeNumber IS NOT NULL;

