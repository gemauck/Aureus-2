/**
 * Reallocate misplaced "Email from Client" comments (e.g. from Barberton to Mafube/Bultfontien).
 *
 * Run: node scripts/reallocate-document-collection-emails.js [projectId] [year] [month]
 *
 * Default: projectId from env REALLOCATE_PROJECT_ID or first project with document sections,
 *          year=2026, month=1.
 *
 * What it does:
 * 1. Finds sections for the project/year that look like "Barberton" (source) and "Mafube" / "Bultfontien" (targets).
 * 2. Finds document named like "Any deviations" in each of those sections.
 * 3. Finds received comments (Email from Client) on the Barberton "Any deviations" doc for the given month/year.
 * 4. Moves those comments to the target sections' "Any deviations" docs: first comment -> first target (alphabetically by section name), second -> second, etc.
 *
 * Uses DATABASE_URL from .env / .env.local (same as other scripts).
 */

import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
config({ path: join(root, '.env') });
if (!process.env.USE_PROD && !process.env.PRODUCTION_DB) {
  config({ path: join(root, '.env.local'), override: true });
}

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const SOURCE_SECTION_MATCH = /barberton/i;
const TARGET_SECTION_MATCHES = [/mafube/i, /bultfontien/i]; // order: first comment -> first match, etc.
const DOC_NAME_MATCH = /any\s+deviations|deviations\s*\(/i;

async function reallocate() {
  const projectId = process.argv[2] || process.env.REALLOCATE_PROJECT_ID || null;
  const year = parseInt(process.argv[3] || '2026', 10);
  const month = parseInt(process.argv[4] || '1', 10);

  if (!projectId) {
    const project = await prisma.project.findFirst({
      where: {},
      select: { id: true, name: true }
    });
    if (!project) {
      console.error('No project found. Pass projectId: node scripts/reallocate-document-collection-emails.js <projectId> [year] [month]');
      process.exit(1);
    }
    console.log('Using project:', project.name, '(' + project.id + ')');
  }
  const pid = projectId || (await prisma.project.findFirst({ where: {}, select: { id: true } })).id;

  const sections = await prisma.documentSection.findMany({
    where: { projectId: pid, year },
    include: {
      documents: {
        where: { name: { contains: 'deviations', mode: 'insensitive' } },
        select: { id: true, name: true }
      }
    },
    orderBy: { order: 'asc' }
  });

  const sourceSection = sections.find((s) => SOURCE_SECTION_MATCH.test(s.name));
  const sourceDoc = sourceSection?.documents?.find((d) => DOC_NAME_MATCH.test(d.name)) || sourceSection?.documents?.[0];
  const targetSections = sections.filter((s) => TARGET_SECTION_MATCHES.some((re) => re.test(s.name)));
  const targetSectionsSorted = targetSections.slice().sort((a, b) => a.name.localeCompare(b.name));
  const targetDocs = targetSectionsSorted
    .map((s) => s.documents?.find((d) => DOC_NAME_MATCH.test(d.name)) || s.documents?.[0])
    .filter(Boolean);

  if (!sourceDoc) {
    console.log('No source document found (Barberton section with "Any deviations" doc). Sections for year', year, ':', sections.map((s) => s.name).join(', '));
    await prisma.$disconnect();
    return;
  }
  if (targetDocs.length === 0) {
    console.log('No target sections/documents found (Mafube, Bultfontien with "Any deviations").');
    await prisma.$disconnect();
    return;
  }

  const comments = await prisma.documentItemComment.findMany({
    where: {
      itemId: sourceDoc.id,
      year,
      month,
      OR: [
        { author: 'Email from Client' },
        { text: { startsWith: 'Email from Client' } }
      ]
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, text: true, createdAt: true }
  });

  if (comments.length === 0) {
    console.log('No received (Email from Client) comments found on', sourceSection?.name, 'for', year + '-' + String(month).padStart(2, '0'));
    await prisma.$disconnect();
    return;
  }

  console.log('Found', comments.length, 'received email(s) on', sourceSection?.name, '-> reallocating to', targetSectionsSorted.map((s) => s.name).join(', '));
  for (let i = 0; i < comments.length; i++) {
    const comment = comments[i];
    const targetDoc = targetDocs[i % targetDocs.length];
    const targetSection = targetSectionsSorted[i % targetSectionsSorted.length];
    const snippet = (comment.text || '').trim().slice(0, 60).replace(/\n/g, ' ');
    console.log('  Moving comment', comment.id, '("' + snippet + '...") ->', targetSection.name);
    await prisma.documentItemComment.update({
      where: { id: comment.id },
      data: { itemId: targetDoc.id }
    });
  }
  console.log('Done. Reallocated', comments.length, 'comment(s).');
  await prisma.$disconnect();
}

reallocate().catch((e) => {
  console.error(e);
  process.exit(1);
});
