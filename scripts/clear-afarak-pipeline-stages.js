#!/usr/bin/env node
/**
 * One-time script: clear AIDA Status and Engagement Stage for "Afarak South Africa (Pty) Ltd"
 * so they display as blank (—) in the Sales Pipeline.
 * Run: node scripts/clear-afarak-pipeline-stages.js
 */
import 'dotenv/config';
import { Prisma } from '@prisma/client';
import { prisma } from '../api/_lib/prisma.js';

const NAME_PATTERN = 'Afarak South Africa';

async function main() {
  const pattern = '%' + NAME_PATTERN + '%';
  const clients = await prisma.$queryRaw`SELECT id, name FROM "Client" WHERE type = 'lead' AND name ILIKE ${pattern}`;

  if (!clients || clients.length === 0) {
    console.log(`No lead found matching "${NAME_PATTERN}". Nothing to update.`);
    return;
  }

  for (const c of clients) {
    await prisma.$executeRaw`UPDATE "Client" SET "engagementStage" = '', "aidaStatus" = '' WHERE id = ${c.id}`;
    console.log('Updated lead:', c.name, '(id:', c.id, ') -> engagementStage and aidaStatus cleared.');
  }

  const clientIds = clients.map(c => c.id);
  const sitesResult = await prisma.$executeRaw`UPDATE "ClientSite" SET "engagementStage" = '', "aidaStatus" = '' WHERE "clientId" IN (${Prisma.join(clientIds)})`;
  if (sitesResult > 0) {
    console.log('Cleared stages for', sitesResult, 'site(s) under this lead.');
  }

  console.log('Done. Refresh the Sales Pipeline to see Afarak with blank stages.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
