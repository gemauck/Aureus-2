#!/usr/bin/env node
/**
 * One-time migration: set removed Engagement Stage options to "Potential"
 * (On Hold, Qualified, Inactive) in Client, ClientSite, and Opportunity.
 * Run: node scripts/migrate-remove-on-hold-qualified-engagement.js
 */
import 'dotenv/config';
import { prisma } from '../api/_lib/prisma.js';

async function main() {
  const clientResult = await prisma.$executeRaw`
    UPDATE "Client"
    SET "engagementStage" = 'Potential'
    WHERE LOWER(TRIM("engagementStage")) IN ('on hold', 'qualified', 'inactive')
  `;
  const siteResult = await prisma.$executeRaw`
    UPDATE "ClientSite"
    SET "engagementStage" = 'Potential'
    WHERE "engagementStage" IS NOT NULL AND LOWER(TRIM("engagementStage")) IN ('on hold', 'qualified', 'inactive')
  `;
  const oppResult = await prisma.$executeRaw`
    UPDATE "Opportunity"
    SET "engagementStage" = 'Potential'
    WHERE LOWER(TRIM("engagementStage")) IN ('on hold', 'qualified', 'inactive')
  `;
  console.log('Migration complete:');
  console.log('  Client rows updated:', clientResult);
  console.log('  ClientSite rows updated:', siteResult);
  console.log('  Opportunity rows updated:', oppResult);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
