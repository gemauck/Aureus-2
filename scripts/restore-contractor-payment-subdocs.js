/**
 * Restore / repair File 6 contractor payment sub-documents (Siluno, Ritluka) after mistaken cleanup:
 * - correct parentId + doc name per stable document id
 * - replay collectionStatus from ProjectActivityLog, gap-fill from Dust-A-Side reference
 * Dry-run by default; pass --write to persist JSON + DocumentSection table.
 */
import { PrismaClient } from '@prisma/client';
import { saveDocumentSectionsToTable } from '../api/projects.js';

const PAYMENT_DOC_NAMES = ['Invoices', 'Remittance', 'Proof Of Payment'];

/** Stable ids removed 18 Jun 2026 — parent + name mapping verified via activity log metadata. */
const PAYMENT_DOCS_BY_PARENT = {
  cmnsl4aux00hkp6qd0dtufqsq: {
    // Siluno - Proof Of Mining
    Invoices: 'cmnsl4axt00itp6qddt0ge1jh',
    Remittance: 'cmnsl4ay000ixp6qdc6i21ttk',
    'Proof Of Payment': 'cmnsl4ay600j1p6qd9a4di762'
  },
  cmnsl4aux00hmp6qda9j671ho: {
    // Ritluka - Proof Of Mining
    Invoices: 'cmnsl4ax000icp6qdfru1g3s4',
    Remittance: 'cmnsl4ax700igp6qducefadse',
    'Proof Of Payment': 'cmnsl4axe00ikp6qd5b47wb9y'
  }
};

const ALL_PAYMENT_DOC_IDS = new Set(
  Object.values(PAYMENT_DOCS_BY_PARENT).flatMap((m) => Object.values(m))
);

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

function makeRestoredDoc(parentId, name, collectionStatus = {}) {
  const knownId = PAYMENT_DOCS_BY_PARENT[parentId]?.[name];
  return {
    id: knownId || `restored_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name,
    description: '',
    parentId,
    collectionStatus: { ...collectionStatus },
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

function parseMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function replayStatusesFromActivity(events) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const out = {};
  for (const row of sorted) {
    const meta = parseMetadata(row.metadata);
    const year = meta.year;
    const month = meta.month;
    if (!year || !month) continue;
    const key = monthKey(year, month);
    if (meta.newValue != null && String(meta.newValue).trim() !== '') {
      out[key] = String(meta.newValue);
    }
  }
  return out;
}

function mergeStatusMaps(...maps) {
  const out = {};
  for (const map of maps) {
    if (!map || typeof map !== 'object') continue;
    for (const [key, value] of Object.entries(map)) {
      if (value != null && String(value).trim() !== '' && out[key] == null) {
        out[key] = String(value);
      }
    }
  }
  return out;
}

function findDustPaymentReference(section) {
  const docs = section?.documents || [];
  const dustRoot = docs.find(
    (d) => !d?.parentId && /dust-a-side/i.test(String(d.name || ''))
  );
  if (!dustRoot) return {};
  const ref = {};
  for (const name of PAYMENT_DOC_NAMES) {
    const doc = docs.find(
      (d) =>
        d.parentId === dustRoot.id &&
        normName(d.name) === normName(name) &&
        d.collectionStatus &&
        typeof d.collectionStatus === 'object'
    );
    if (doc) ref[name] = { ...doc.collectionStatus };
  }
  return ref;
}

function siblingPrimaryStatus(section, parentId) {
  const docs = section?.documents || [];
  const primary = docs.find(
    (d) =>
      d.parentId === parentId &&
      d.collectionStatus &&
      typeof d.collectionStatus === 'object' &&
      !PAYMENT_DOC_NAMES.some((n) => normName(n) === normName(d.name))
  );
  return primary?.collectionStatus ? { ...primary.collectionStatus } : {};
}

function repairPaymentDocsInSection(section, activityByDocId) {
  const dustRef = findDustPaymentReference(section);
  const docs = [...(section.documents || [])];
  const repairs = [];

  for (const [parentId, nameToId] of Object.entries(PAYMENT_DOCS_BY_PARENT)) {
    const parent = docs.find((d) => d.id === parentId);
    if (!parent) continue;
    const siblingStatus = siblingPrimaryStatus(section, parentId);

    for (const [name, docId] of Object.entries(nameToId)) {
      let doc = docs.find((d) => d.id === docId);
      const activityStatus = activityByDocId.get(docId) || {};
      const dustStatus = dustRef[name] || {};
      const targetStatus = mergeStatusMaps(activityStatus, dustStatus, siblingStatus);

      if (!doc) {
        doc = makeRestoredDoc(parentId, name, targetStatus);
        const insertAt = lastParentBlockIndex(docs, parentId);
        if (insertAt === -1) continue;
        docs.splice(insertAt + 1, 0, doc);
        repairs.push({
          action: 'created',
          parentName: parent.name,
          name,
          id: docId,
          statuses: Object.keys(targetStatus).length
        });
        continue;
      }

      const needsName = normName(doc.name) !== normName(name);
      const needsParent = String(doc.parentId) !== String(parentId);
      const needsStatus =
        JSON.stringify(doc.collectionStatus || {}) !== JSON.stringify(targetStatus);

      if (needsName || needsParent || needsStatus) {
        const idx = docs.findIndex((d) => d.id === docId);
        if (idx === -1) continue;
        docs[idx] = {
          ...doc,
          name,
          parentId,
          collectionStatus: targetStatus
        };
        repairs.push({
          action: 'repaired',
          parentName: parent.name,
          name,
          id: docId,
          fixName: needsName,
          fixParent: needsParent,
          fixStatus: needsStatus,
          statuses: Object.keys(targetStatus).length,
          collectionStatus: targetStatus
        });
      }
    }
  }

  return { section: { ...section, documents: docs }, repairs };
}

function processPayload(parsed, activityByDocId) {
  const allRestored = [];
  const allRepairs = [];

  if (Array.isArray(parsed)) {
    const next = parsed.map((section) => {
      const { section: withRows, restored } = restoreSection(section);
      const { section: repaired, repairs } = repairPaymentDocsInSection(withRows, activityByDocId);
      allRestored.push(...restored);
      allRepairs.push(...repairs);
      return repaired;
    });
    return { sections: next, restored: allRestored, repairs: allRepairs };
  }

  const next = { ...parsed };
  for (const year of Object.keys(next)) {
    if (!Array.isArray(next[year])) continue;
    next[year] = next[year].map((section) => {
      const { section: withRows, restored } = restoreSection(section);
      const { section: repaired, repairs } = repairPaymentDocsInSection(withRows, activityByDocId);
      allRestored.push(...restored.map((r) => ({ ...r, year })));
      allRepairs.push(...repairs.map((r) => ({ ...r, year })));
      return repaired;
    });
  }
  return { sections: next, restored: allRestored, repairs: allRepairs };
}

async function loadActivityStatuses(projectId) {
  const rows = await prisma.projectActivityLog.findMany({
    where: {
      projectId,
      type: 'document_section_status_change'
    },
    orderBy: { createdAt: 'asc' },
    select: { metadata: true, createdAt: true }
  });

  const byDocId = new Map();
  for (const row of rows) {
    const meta = parseMetadata(row.metadata);
    const docId = meta.entityId != null ? String(meta.entityId) : '';
    if (!ALL_PAYMENT_DOC_IDS.has(docId)) continue;
    if (!byDocId.has(docId)) byDocId.set(docId, []);
    byDocId.get(docId).push(row);
  }

  const statuses = new Map();
  for (const [docId, events] of byDocId.entries()) {
    statuses.set(docId, replayStatusesFromActivity(events));
  }
  return statuses;
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
  let totalRepaired = 0;

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

    const activityByDocId = await loadActivityStatuses(project.id);
    const { sections, restored, repairs } = processPayload(parsed, activityByDocId);
    if (!restored.length && !repairs.length) continue;

    console.log(`\nProject: ${project.name} (${project.id})`);
    restored.forEach((r) => {
      const yearPrefix = r.year ? `${r.year} ` : '';
      console.log(`  + ${yearPrefix}${r.parentName} → ${r.name} (${r.id})`);
    });
    repairs.forEach((r) => {
      const yearPrefix = r.year ? `${r.year} ` : '';
      const fixes = [
        r.fixName ? 'name' : null,
        r.fixParent ? 'parent' : null,
        r.fixStatus ? `status×${r.statuses}` : null
      ]
        .filter(Boolean)
        .join(', ');
      console.log(
        `  ~ ${yearPrefix}${r.parentName} → ${r.name} (${r.id})${fixes ? ` [${fixes}]` : ''}`
      );
      if (r.collectionStatus) {
        console.log(`      statuses: ${JSON.stringify(r.collectionStatus)}`);
      }
    });

    totalRestored += restored.length;
    totalRepaired += repairs.length;

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

  if (!totalRestored && !totalRepaired) {
    console.log('No contractor payment rows to restore or repair.');
    return;
  }

  console.log(`\nRows created: ${totalRestored}, rows repaired: ${totalRepaired}`);
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
