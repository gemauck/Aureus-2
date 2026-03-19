#!/usr/bin/env node

/**
 * Delete all helpdesk tickets.
 * Clears relatedTicketId first to satisfy self-relation, then deletes all tickets.
 * Usage: node scripts/delete-all-tickets.js
 */

import { prisma } from '../api/_lib/prisma.js';

async function main() {
  try {
    const count = await prisma.ticket.count();
    if (count === 0) {
      console.log('No tickets found. Nothing to delete.');
      return;
    }

    await prisma.ticket.updateMany({
      data: { relatedTicketId: null },
    });
    const deleted = await prisma.ticket.deleteMany({});
    console.log(`✅ Deleted ${deleted.count} ticket(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('❌ Failed to delete tickets:', error);
  process.exit(1);
});
