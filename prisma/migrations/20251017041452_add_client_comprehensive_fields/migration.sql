-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "activityLog" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "billingTerms" JSONB NOT NULL DEFAULT '{"paymentTerms":"Net 30","billingFrequency":"Monthly","currency":"ZAR","retainerAmount":0,"taxExempt":false,"notes":""}',
ADD COLUMN     "contracts" JSONB NOT NULL DEFAULT '[]';
