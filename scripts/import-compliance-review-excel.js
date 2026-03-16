#!/usr/bin/env node
/**
 * Import Compliance Monthly Assessment Excel into a project's Compliance Review checklist.
 * - Section headers: rows where column A matches "File N: ..."
 * - Checklist items: rows between section headers with non-empty column B (Description)
 * - Column A (e.g. "Every 6 Month") is stored as item description when present
 *
 * Usage: node scripts/import-compliance-review-excel.js "/path/to/Compliance Monthly Assessment.xlsx" <projectId> [year]
 * Example: node scripts/import-compliance-review-excel.js "/Users/gemau/Downloads/Jan 2026 to Dec 2026 Compliance Monthly Assessment Isibonelo Colli (2).xlsx" abc-123 2026
 * Requires: DATABASE_URL in .env (or environment)
 */

import 'dotenv/config';
import { parseComplianceExcel } from './compliance-review-excel-parser.js';
import { prisma } from '../api/_lib/prisma.js';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node scripts/import-compliance-review-excel.js <excelPath> <projectId> [year]');
    process.exit(1);
  }
  const [excelPath, projectId, yearArg] = args;
  const year = yearArg || '2026';

  const { sections } = parseComplianceExcel(excelPath);
  console.log(`Parsed ${sections.length} sections and ${sections.reduce((n, s) => n + s.documents.length, 0)} checklist items for year ${year}.`);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, complianceReviewSections: true, hasComplianceReviewProcess: true }
  });
  if (!project) {
    console.error('Project not found:', projectId);
    process.exit(1);
  }

  let existing = {};
  try {
    const raw = project.complianceReviewSections;
    if (raw != null && raw !== '' && String(raw).trim() !== '') {
      existing = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (typeof existing !== 'object' || Array.isArray(existing)) existing = {};
    }
  } catch (e) {
    console.warn('Could not parse existing complianceReviewSections, using empty object:', e.message);
  }

  const merged = { ...existing, [year]: sections };
  const payload = JSON.stringify(merged);

  await prisma.project.update({
    where: { id: projectId },
    data: {
      complianceReviewSections: payload,
      hasComplianceReviewProcess: true
    }
  });

  console.log(`Updated project "${project.name}" (${projectId}): Compliance Review for year ${year} now has ${sections.length} sections.`);
  console.log('Done.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
