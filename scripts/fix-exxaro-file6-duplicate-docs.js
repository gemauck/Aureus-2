/**
 * Remove duplicate Invoices/Remittance/Proof Of Payment rows under Exxaro File 6 (2026).
 * Dry-run by default; pass --write to persist.
 */
import { PrismaClient } from '@prisma/client';

const PROJECT_ID = 'cmha4l9120003neks02jof1ux';
const DUPLICATE_DOC_IDS = new Set([
  'cmnsl4ax000icp6qdfru1g3s4',
  'cmnsl4ax700igp6qducefadse',
  'cmnsl4axe00ikp6qd5b47wb9y',
  'cmnsl4axt00itp6qddt0ge1jh',
  'cmnsl4ay000ixp6qdc6i21ttk',
  'cmnsl4ay600j1p6qd9a4di762'
]);

const write = process.argv.includes('--write');

const prisma = new PrismaClient();

function removeDuplicateDocs(sections) {
  if (!sections || typeof sections !== 'object') return { sections, removed: [] };
  const removed = [];
  const next = Array.isArray(sections) ? [...sections] : { ...sections };

  const stripDocs = (docs) => {
    if (!Array.isArray(docs)) return docs;
    return docs.filter((d) => {
      const id = String(d?.id || '');
      if (DUPLICATE_DOC_IDS.has(id)) {
        removed.push({ id, name: d?.name });
        return false;
      }
      if (Array.isArray(d?.documents)) {
        d.documents = stripDocs(d.documents);
      }
      return true;
    });
  };

  if (Array.isArray(next)) {
    return { sections: stripDocs(next), removed };
  }

  for (const year of Object.keys(next)) {
    if (!Array.isArray(next[year])) continue;
    next[year] = next[year].map((section) => {
      if (!Array.isArray(section?.documents)) return section;
      return { ...section, documents: stripDocs(section.documents) };
    });
  }

  return { sections: next, removed };
}

async function main() {
  const project = await prisma.project.findUnique({
    where: { id: PROJECT_ID },
    select: { id: true, name: true, documentSections: true }
  });
  if (!project) throw new Error('Project not found');

  let parsed;
  try {
    parsed =
      typeof project.documentSections === 'string'
        ? JSON.parse(project.documentSections)
        : project.documentSections;
  } catch (e) {
    throw new Error(`Failed to parse documentSections: ${e.message}`);
  }

  const { sections, removed } = removeDuplicateDocs(parsed);
  console.log(`Project: ${project.name} (${project.id})`);
  console.log(`Duplicate docs to remove: ${removed.length}`);
  removed.forEach((r) => console.log(`  - ${r.id} ${r.name}`));

  if (!removed.length) {
    console.log('Nothing to do.');
    return;
  }

  if (!write) {
    console.log('\nDry-run only. Re-run with --write to apply.');
    return;
  }

  const payload = JSON.stringify(sections);
  await prisma.project.update({
    where: { id: PROJECT_ID },
    data: { documentSections: payload }
  });
  console.log('\nApplied: updated project.documentSections JSON.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
