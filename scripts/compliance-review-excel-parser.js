import XLSX from 'xlsx';

/**
 * Shared parser for Compliance Monthly Assessment Excel files.
 * Used by scripts/import-compliance-review-excel.js and api/projects/[id]/compliance-review-import.js
 *
 * @param {string|Buffer} input - Path to .xlsx file (string) or file buffer (Buffer)
 * @returns {{ sections: Array<{ id: string, name: string, description: string, documents: Array<{ id: string, name: string, description?: string, collectionStatus: {}, comments: {}, notesByMonth: {}, emailRequestByMonth: {} }> }> }}
 */
export function parseComplianceExcel(input) {
  const wb =
    typeof input === 'string'
      ? XLSX.readFile(input)
      : XLSX.read(input, { type: 'buffer' });

  const SECTION_HEADER_PATTERN = /^File \d+:/i;
  const sheetName =
    wb.SheetNames.find((n) => n === 'Compliance Team Checking Sheet') ||
    wb.SheetNames[0];
  const sh = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });

  function trimCell(val) {
    if (val == null) return '';
    return String(val).trim();
  }

  const sectionRowIndices = [];
  for (let i = 0; i < data.length; i++) {
    const a = trimCell(data[i][0]);
    if (SECTION_HEADER_PATTERN.test(a)) {
      sectionRowIndices.push({ index: i, title: a });
    }
  }

  const sections = [];
  for (let s = 0; s < sectionRowIndices.length; s++) {
    const { index: startRow, title } = sectionRowIndices[s];
    const endRow =
      s + 1 < sectionRowIndices.length
        ? sectionRowIndices[s + 1].index
        : data.length;
    const documents = [];
    for (let r = startRow + 1; r < endRow; r++) {
      const row = data[r] || [];
      const colA = trimCell(row[0]);
      const colB = trimCell(row[1]);
      if (!colB) continue;
      documents.push({
        id: `doc-${s}-${documents.length}`,
        name: colB,
        description: colA || undefined,
        collectionStatus: {},
        comments: {},
        notesByMonth: {},
        emailRequestByMonth: {}
      });
    }
    sections.push({
      id: `section-${s}`,
      name: title,
      description: '',
      documents
    });
  }

  return { sections };
}
