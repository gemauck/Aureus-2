/**
 * Restore missing Invoices / Remittance / Proof Of Payment sub-documents under File 6
 * contractor parents (e.g. Siluno, Ritluka) after mistaken duplicate cleanup.
 * Dry-run by default; pass --write to persist JSON + DocumentSection table.
 */
import { PrismaClient } from '@prisma/client';
import { saveDocumentSectionsToTable } from '../api/projects.js';

const PAYMENT_DOC_NAMES = ['Invoices', 'Remittance', 'Proof Of Payment'];

/** Original ids removed by scripts/fix-exxaro-file6-duplicate-docs.js (18 Jun 2026). */
const KNOWN_DOC_IDS_BY_PARENT = {
  cmnsl4aux00hkp6qd0dtufqsq: {
    Invoices: 'cmnsl4axt00itp6qddt0ge1jh',
    Remittance: 'cmnsl4ay600j1p6qd9a4di762',
    'Proof Of Payment': 'cmnsl4ax700igp6qducefadse'
  },
  cmnsl4aux00hmp6qda9j671ho: {
    Invoices: 'cmnsl4axe00ikp6qd5b47wb9y',
    Remittance: 'cmnsl4ay000ixp6qdc6i21ttk',
    'Proof Of Payment': 'cmnsl4ax000icp6qdfru1g3s4'
  }
};

const write = process.argv.includes('--write');
const projectIdArg = process.argv.find((a) => a.startsWith('--project='))?.split('=')[1];

const prisma = new PrismaClient();

function normName(name) {
  return String(name || '').trim().toLowerCase();
}

function hasPaymentChild(children, kind) {
  return children.some((c) => {
    const n = normName(c.name);
    if (kind === 'invoices') return n === 'invoice' || n === 'invoices';
    if (kind === 'remittance') return n.startsWith('remittance');
    if (kind === 'pop') return n.includes('proof of payment');
    return false;
  });
}

function missingPaymentNames(children) {
  const missing = [];
  if (!hasPaymentChild(children, 'invoices')) missing.push('Invoices');
  if (!hasPaymentChild(children, 'remittance')) missing.push('Remittance');
  if (!hasPaymentChild(children, 'pop')) missing.push('Proof Of Payment');
  return missing;
}

function sectionHasPaymentReference(section) {
  const docs = section?.documents || [];
  const roots = docs.filter((d) => !d?.parentId);
  return roots.some((root) => {
    const children = docs.filter((d) => d.parentId === root.id);
    return children.length > 0 && missingPaymentNames(children).length === 0;
  });
}

function findRestoreCandidates(section) {
  if (!/file\s*6/i.test(section?.name || '')) return [];
  if (!sectionHasPaymentReference(section)) return [];

  const docs = section.documents || [];
  const roots = docs.filter((d) => !d?.parentId);
  const candidates = [];

  for (const root of roots) {
    const children = docs.filter((d) => d.parentId === root.id);
    if (!children.length) continue;
    const missing = missingPaymentNames(children);
    if (!missing.length) continue;
    candidates.push({ parentId: root.id, parentName: root.name, missing });
  }
  return candidates;
}

function lastParentBlockIndex(docs, parentId) {
  let lastIdx = docs.findIndex((d) => d.id === parentId);
  if (lastIdx === -1) return -1;
  for (let i = 0; i < docs.length; i++) {
    if (docs[i].id === parentId || docs[i].parentId === parentId) lastIdx = i;
  }
  return lastIdx;
}

function makeRestoredDoc(parentId, name) {
  const knownId = KNOWN_DOC_IDS_BY_PARENT[parentId]?.[name];
  return {
    id: knownId || `restored_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name,
    description: '',
    parentId,
    collectionStatus: {},
    comments: {},
    notesByMonth: {},
    assignedTo: []
  };
}

function restoreSection(section) {
  const candidates = findRestoreCandidates(section);
  if (!candidates.length) return { section, restored: [] };

  let docs = [...(section.documents || [])];
  const restored = [];

  for (const { parentId, parentName, missing } of candidates) {
    const insertAt = lastParentBlockIndex(docs, parentId);
    if (insertAt === -1) continue;
    const newDocs = missing.map((name) => {
      const doc = makeRestoredDoc(parentId, name);
      restored.push({ parentId, parentName, name, id: doc.id });
      return doc;
    });
    docs = [...docs.slice(0, insertAt + 1), ...newDocs, ...docs.slice(insertAt + 1)];
  }

  return { section: { ...section, documents: docs }, restored };
}

function restoreSectionsPayload(parsed) {
  const allRestored = [];
  if (Array.isArray(parsed)) {
    const next = parsed.map((section) => {
      const { section: updated, restored } = restoreSection(section);
      allRestored.push(...restored);
      return updated;
    });
    return { sections: next, restored: allRestored };
  }

  const next = { ...parsed };
  for (const year of Object.keys(next)) {
    if (!Array.isArray(next[year])) continue;
    next[year] = next[year].map((section) => {
      const { section: updated, restored } = restoreSection(section);
      allRestored.push(...restored.map((r) => ({ ...r, year })));
      return updated;
    });
  }
  return { sections: next, restored: allRestored };
}

async function main() {
  const projects = projectIdArg
    ? await prisma.project.findMany({
        where: { id: projectIdArg },
        select: { id: true, name: true, documentSections: true }
      })
    : await prisma.project.findMany({
        select: { id: true, name: true, documentSections: true }
      });

  let totalRestored = 0;

  for (const project of projects) {
    if (!project.documentSections) continue;

    let parsed;
    try {
      parsed =
        typeof project.documentSections === 'string'
          ? JSON.parse(project.documentSections)
          : project.documentSections;
    } catch (e) {
      console.warn(`Skip ${project.name}: invalid documentSections JSON (${e.message})`);
      continue;
    }

    const { sections, restored } = restoreSectionsPayload(parsed);
    if (!restored.length) continue;

    console.log(`\nProject: ${project.name} (${project.id})`);
    restored.forEach((r) => {
      const yearPrefix = r.year ? `${r.year} ` : '';
      console.log(`  + ${yearPrefix}${r.parentName} → ${r.name} (${r.id})`);
    });
    totalRestored += restored.length;

    if (!write) continue;

    const payload = JSON.stringify(sections);
    await prisma.project.update({
      where: { id: project.id },
      data: { documentSections: payload }
    });
    await saveDocumentSectionsToTable(project.id, sections, {
      userName: 'restore-contractor-payment-subdocs',
      skipMerge: true,
      skipActivityLog: true
    });
    console.log('  Applied: JSON + DocumentSection table synced.');
  }

  if (!totalRestored) {
    console.log('No missing contractor payment sub-documents found.');
    return;
  }

  console.log(`\nTotal rows to restore: ${totalRestored}`);
  if (!write) {
    console.log('Dry-run only. Re-run with --write to apply.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
