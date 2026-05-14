#!/usr/bin/env node
/**
 * Move one calendar month column into another within the same year for Compliance Review
 * or Monthly Data Review JSON on Project (same shape as the monthly grid: ISO keys YYYY-MM
 * plus optional legacy keys like "January-2026").
 *
 * Default is dry-run (no DB write). Use --write to persist. Use --replace-target if March
 * already has data you want replaced by January’s values.
 *
 * Usage:
 *   node scripts/move-tracker-month-column.js --project-id <id> --year 2026 --from 1 --to 3
 *   npm run move:tracker-month -- --project-id <id> --year 2026 --from 1 --to 3 --write
 *
 * Requires: DATABASE_URL
 */

import 'dotenv/config';
import { prisma } from '../api/_lib/prisma.js';

const MONTH_NAMES = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]);

const PER_DOC_FIELDS = ['collectionStatus', 'notesByMonth', 'comments', 'notesReviewByMonth', 'emailRequestByMonth'];

const TRACKER_DB_FIELD = {
  compliance: 'complianceReviewSections',
  'monthly-data': 'monthlyDataReviewSections'
};

function keysForMonth(year, monthIndex0) {
  const num = monthIndex0 + 1;
  return {
    iso: `${year}-${String(num).padStart(2, '0')}`,
    legacy: `${MONTH_NAMES[monthIndex0]}-${year}`
  };
}

function deepClone(v) {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return v;
  }
}

function isMeaningful(field, value) {
  if (value === undefined || value === null) return false;
  if (field === 'comments') {
    return Array.isArray(value) && value.length > 0;
  }
  if (field === 'notesReviewByMonth') {
    return typeof value === 'object' && value != null && !!value.reviewedAt;
  }
  if (field === 'emailRequestByMonth') {
    if (typeof value !== 'object' || value == null) return false;
    return Object.keys(value).some((k) => {
      const v = value[k];
      if (v == null) return false;
      if (typeof v === 'string') return v.trim() !== '';
      if (typeof v === 'object') return Object.keys(v).length > 0;
      return true;
    });
  }
  if (field === 'collectionStatus') {
    const s = String(value).trim();
    return s !== '' && s !== 'Select Status';
  }
  const s = String(value);
  if (!s.trim()) return false;
  if (/<[a-z][\s\S]*?>/i.test(s)) {
    return s.replace(/<[^>]+>/gi, '').replace(/&nbsp;/gi, ' ').trim() !== '';
  }
  return true;
}

/**
 * Read value(s) stored for a month; return canonical value + all keys to delete when moving away.
 */
function readMonthEntry(sub, field, fIso, fLeg) {
  const keysToRemove = [];
  if (field === 'comments') {
    let val;
    if (Object.prototype.hasOwnProperty.call(sub, fIso)) {
      keysToRemove.push(fIso);
      val = sub[fIso];
    }
    if (Object.prototype.hasOwnProperty.call(sub, fLeg)) {
      keysToRemove.push(fLeg);
      if (!Array.isArray(val) || val.length === 0) val = sub[fLeg];
    }
    return {
      value: Array.isArray(val) ? val : [],
      keysToRemove: [...new Set(keysToRemove)]
    };
  }
  let value;
  if (Object.prototype.hasOwnProperty.call(sub, fIso)) {
    keysToRemove.push(fIso);
    value = sub[fIso];
  }
  if (Object.prototype.hasOwnProperty.call(sub, fLeg)) {
    keysToRemove.push(fLeg);
    if (value === undefined) value = sub[fLeg];
  }
  return { value, keysToRemove: [...new Set(keysToRemove)] };
}

function moveOneField(doc, field, year, fromIdx0, toIdx0, replaceTarget) {
  const sub = doc[field];
  if (!sub || typeof sub !== 'object' || Array.isArray(sub)) {
    return { status: 'skip' };
  }

  const { iso: fIso, legacy: fLeg } = keysForMonth(year, fromIdx0);
  const { iso: tIso, legacy: tLeg } = keysForMonth(year, toIdx0);

  const fromRead = readMonthEntry(sub, field, fIso, fLeg);
  if (!isMeaningful(field, fromRead.value)) {
    return { status: 'empty-source' };
  }

  const toRead = readMonthEntry(sub, field, tIso, tLeg);
  const targetBusy = isMeaningful(field, toRead.value);
  if (targetBusy && !replaceTarget) {
    return { status: 'conflict', field };
  }

  for (const k of fromRead.keysToRemove) {
    delete sub[k];
  }
  delete sub[tIso];
  delete sub[tLeg];

  sub[tIso] = deepClone(fromRead.value);
  return { status: 'moved', field };
}

function processSections(sections, year, fromMonth1, toMonth1, replaceTarget) {
  const fromIdx0 = fromMonth1 - 1;
  const toIdx0 = toMonth1 - 1;
  let moved = 0;
  let emptySource = 0;
  const conflicts = [];

  for (const section of sections) {
    for (const doc of section.documents || []) {
      for (const field of PER_DOC_FIELDS) {
        const r = moveOneField(doc, field, year, fromIdx0, toIdx0, replaceTarget);
        if (r.status === 'moved') moved += 1;
        else if (r.status === 'empty-source') emptySource += 1;
        else if (r.status === 'conflict') {
          conflicts.push({
            section: section.name || section.id,
            document: doc.name || doc.id,
            field
          });
        }
      }
    }
  }

  return { moved, emptySource, conflicts };
}

function parseArgs(argv) {
  const o = {
    write: false,
    replaceTarget: false,
    year: null,
    from: null,
    to: null,
    projectId: null,
    nameContains: null,
    tracker: 'compliance'
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') o.write = true;
    else if (a === '--replace-target') o.replaceTarget = true;
    else if (a === '--project-id') o.projectId = argv[++i];
    else if (a === '--name-contains') o.nameContains = argv[++i];
    else if (a === '--year') o.year = parseInt(argv[++i], 10);
    else if (a === '--from') o.from = parseInt(argv[++i], 10);
    else if (a === '--to') o.to = parseInt(argv[++i], 10);
    else if (a === '--tracker') o.tracker = argv[++i];
    else if (a === '--help' || a === '-h') o.help = true;
  }
  return o;
}

async function resolveProject({ projectId, nameContains }) {
  if (projectId) {
    const p = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true }
    });
    if (!p) throw new Error(`Project not found: ${projectId}`);
    return p;
  }
  if (nameContains) {
    const list = await prisma.project.findMany({
      where: { name: { contains: nameContains, mode: 'insensitive' } },
      select: { id: true, name: true },
      take: 25
    });
    if (list.length === 0) {
      throw new Error(`No project whose name contains "${nameContains}"`);
    }
    if (list.length > 1) {
      const lines = list.map((x) => `  - ${x.id}  ${x.name}`).join('\n');
      throw new Error(
        `Multiple projects match "${nameContains}" (${list.length}). Use --project-id.\n${lines}`
      );
    }
    return list[0];
  }
  throw new Error('Provide --project-id <uuid> or --name-contains <substring>');
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`
Move one month column → another (same year) in Compliance Review or Monthly Data Review JSON.

  --project-id <id>       Project UUID
  --name-contains <str>   Single match only (else error)
  --year <n>              e.g. 2026
  --from <1-12>           Source month (January = 1)
  --to <1-12>             Target month (March = 3)
  --tracker compliance    Default: complianceReviewSections
  --tracker monthly-data  monthlyDataReviewSections
  --replace-target        Overwrite existing target month data if present
  --write                 Persist (default is dry-run)

Example (dry-run):
  node scripts/move-tracker-month-column.js --name-contains "Mondi FMS" --year 2026 --from 1 --to 3

Example (apply):
  node scripts/move-tracker-month-column.js --project-id <id> --year 2026 --from 1 --to 3 --write
`);
    process.exit(0);
  }

  const year = args.year;
  const fromM = args.from;
  const toM = args.to;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    console.error('Invalid or missing --year');
    process.exit(1);
  }
  if (!Number.isInteger(fromM) || fromM < 1 || fromM > 12) {
    console.error('Invalid or missing --from (1–12)');
    process.exit(1);
  }
  if (!Number.isInteger(toM) || toM < 1 || toM > 12) {
    console.error('Invalid or missing --to (1–12)');
    process.exit(1);
  }
  if (fromM === toM) {
    console.error('--from and --to must differ');
    process.exit(1);
  }

  const dbField = TRACKER_DB_FIELD[args.tracker];
  if (!dbField) {
    console.error('--tracker must be "compliance" or "monthly-data"');
    process.exit(1);
  }

  const project = await resolveProject({
    projectId: args.projectId,
    nameContains: args.nameContains
  });

  const row = await prisma.project.findUnique({
    where: { id: project.id },
    select: { id: true, name: true, [dbField]: true }
  });

  let blob = {};
  const raw = row[dbField];
  try {
    if (raw != null && String(raw).trim() !== '') {
      blob = typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
  } catch (e) {
    console.error('Failed to parse JSON blob:', e.message);
    process.exit(1);
  }
  if (typeof blob !== 'object' || blob == null || Array.isArray(blob)) {
    console.error('Blob is not an object (year-keyed map).');
    process.exit(1);
  }

  const yKey = String(year);
  const sections = blob[yKey];
  if (!Array.isArray(sections) || sections.length === 0) {
    console.error(`No section rows for year ${yKey} in ${dbField}. Nothing to move.`);
    process.exit(1);
  }

  const working = deepClone(blob);
  const workingSections = working[yKey];
  const { moved, conflicts } = processSections(workingSections, year, fromM, toM, args.replaceTarget);

  console.log(`Project: ${row.name} (${row.id})`);
  console.log(`Field: ${dbField}`);
  console.log(
    `Move ${MONTH_NAMES[fromM - 1]} ${year} → ${MONTH_NAMES[toM - 1]} ${year} (per-document: status, notes, comments, reviewed metadata, email month config)`
  );
  console.log(`Cells updated (field-level): ${moved}`);
  if (conflicts.length > 0) {
    console.log(`\nConflicts (${conflicts.length}) — target month already had data. Re-run with --replace-target or clear March in the UI first:`);
    for (const c of conflicts.slice(0, 40)) {
      console.log(`  - [${c.field}] section "${c.section}" / doc "${c.document}"`);
    }
    if (conflicts.length > 40) console.log(`  … and ${conflicts.length - 40} more`);
    if (args.write) {
      console.error('\nRefusing --write while conflicts exist.');
      process.exit(1);
    }
  }

  if (!args.write) {
    console.log('\nDry-run only. Add --write to save. Add --replace-target to overwrite non-empty target month cells.');
    process.exit(conflicts.length > 0 ? 2 : 0);
  }

  if (conflicts.length > 0) {
    process.exit(1);
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { [dbField]: JSON.stringify(working) }
  });

  console.log('\nSaved to database.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
