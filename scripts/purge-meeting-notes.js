#!/usr/bin/env node

/**
 * Purge all management meeting notes data (months, weeks, action items, comments, allocations).
 * Usage: node scripts/purge-meeting-notes.js
 */

import { prisma } from '../api/_lib/prisma.js';

async function main() {
  try {
    const existing = await prisma.monthlyMeetingNotes.count();
    if (!existing) {
      console.log('No meeting notes found. Nothing to delete.');
      return;
    }

    const result = await prisma.monthlyMeetingNotes.deleteMany();
    console.log(`✅ Deleted ${result.count} monthly meeting notes (cascade removed related weeks, action items, comments, allocations).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('❌ Failed to purge meeting notes:', error);
  process.exit(1);
});

