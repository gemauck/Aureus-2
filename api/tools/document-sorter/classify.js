/**
 * Maps file path (and name) to category: { fileNum: 1-7, folderName: string }.
 * Keywords are matched longest-first so specific phrases win over generic ones (e.g. contractor invoice before invoice).
 */

const CATEGORIES = [
  {
    fileNum: 1,
    keywords: [
      'mining right', 'mining rights', 'cipc', 'diesel refund registration', 'vat registration',
      'environmental authorisation', 'environmental authorization', 'summary of operations',
      'summary of activities', 'file 1 explanation', 'company registration', 'registration certificate',
    ],
    folderName: 'File 1 - Regulatory and Operations Summary',
  },
  {
    fileNum: 2,
    keywords: [
      'fuel supply contract', 'mining contractor', 'mining contractors contract',
      'sale of product', 'sale of product contract', 'supply agreement', 'file 2 explanation',
    ],
    folderName: 'File 2 - Contracts',
  },
  {
    fileNum: 3,
    keywords: [
      'tank and pump', 'pump configuration', 'diagram of fuel', 'fuel system',
      'delivery note', 'delivery notes', 'remittance advice', 'remittance advices',
      'proof of payment', 'proof of payments', 'tank reconcil', 'reconciliation', 'reconcilation',
      'photos of tanks', 'tank photo', 'calibration certificate', 'file 3 explanation',
      'invoice', 'invoices',
    ],
    folderName: 'File 3 - Fuel System and Transactions',
  },
  {
    fileNum: 4,
    keywords: [
      'asset register', 'combined assets', 'mining assets', 'non mining assets',
      'driver list', 'drivers list', 'file 4 explanation',
    ],
    folderName: 'File 4 - Assets and Drivers',
  },
  {
    fileNum: 5,
    keywords: [
      'fms raw data', 'description and literature of fms', 'fuel management system',
      'detailed fuel refund report', 'fuel refund logbook', 'fuel refund report',
      'file 5 explanation', 'fms data', 'fms report',
    ],
    folderName: 'File 5 - FMS Data and Reports',
  },
  {
    fileNum: 6,
    keywords: [
      'monthly survey', 'survey report', 'production report', 'asset activity report',
      'contractor invoice', 'contractor remittance', 'contractor proof of payment',
      'file 6 explanation', 'contractor payment',
    ],
    folderName: 'File 6 - Operational and Contractor',
  },
  {
    fileNum: 7,
    keywords: [
      'annual financial statement', 'management account', 'deviations', 'theft', 'loss',
      'fuel cap exceeded', 'fuel caps exceeded', 'vat 201', 'vat201', 'file 7 explanation',
      'financial statement', 'afs',
    ],
    folderName: 'File 7 - Financial and Compliance',
  },
]

/** Flatten keywords sorted longest-first for specificity wins */
function buildSortedRules() {
  const rules = []
  for (const cat of CATEGORIES) {
    for (const kw of cat.keywords) {
      rules.push({
        kw,
        len: kw.length,
        fileNum: cat.fileNum,
        folderName: cat.folderName,
      })
    }
  }
  rules.sort((a, b) => b.len - a.len || a.kw.localeCompare(b.kw))
  return rules
}

const SORTED_RULES = buildSortedRules()

/**
 * Merge user-supplied keywords (per File 1–7) with built-in rules. Sorts longest-first globally
 * so specific phrases win; extras compete equally with defaults.
 * @param {Record<string, unknown>} extraKeywordsByFile - e.g. { "3": ["fuel slip"], "6": ["site contractor"] }
 * @returns {typeof SORTED_RULES}
 */
export function buildMergedRules(extraKeywordsByFile) {
  if (!extraKeywordsByFile || typeof extraKeywordsByFile !== 'object') {
    return SORTED_RULES
  }
  const keys = Object.keys(extraKeywordsByFile)
  if (keys.length === 0) return SORTED_RULES

  const extra = []
  const seen = new Set()
  for (const key of keys) {
    const num = parseInt(String(key), 10)
    if (num < 1 || num > 7) continue
    const kws = extraKeywordsByFile[key]
    if (!Array.isArray(kws)) continue
    const folderName = folderNameForFileNum(num)
    for (const raw of kws) {
      const kw = String(raw || '')
        .trim()
        .toLowerCase()
      if (!kw || kw.length > 200) continue
      const dedupe = `${num}:${kw}`
      if (seen.has(dedupe)) continue
      seen.add(dedupe)
      extra.push({
        kw,
        len: kw.length,
        fileNum: num,
        folderName,
      })
    }
  }
  if (extra.length === 0) return SORTED_RULES

  const merged = [...extra, ...SORTED_RULES.map((r) => ({ ...r }))]
  merged.sort((a, b) => b.len - a.len || a.kw.localeCompare(b.kw))
  return merged
}

/** Short tokens (e.g. afs, cipc) should not match inside longer words like "gloss" / "cafs" */
const BOUNDARY_MAX_LEN = 4

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function keywordMatches(norm, base, kw) {
  if (kw.length <= BOUNDARY_MAX_LEN) {
    const re = new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i')
    return re.test(norm) || re.test(base)
  }
  return norm.includes(kw) || base.includes(kw)
}

/**
 * @param {string} entryPath - path inside zip (and/or filename)
 * @param {{ rules?: typeof SORTED_RULES }} [options]
 * @returns {{ fileNum: number, folderName: string, matchedKeyword: string | null }}
 */
export function classifyPath(entryPath, options = {}) {
  const normalized = (entryPath || '').toLowerCase().replace(/\\/g, '/')
  const baseName = normalized.split('/').pop() || ''
  const ruleList = options.rules && Array.isArray(options.rules) ? options.rules : SORTED_RULES

  for (const rule of ruleList) {
    const kw = rule.kw
    if (keywordMatches(normalized, baseName, kw)) {
      return {
        fileNum: rule.fileNum,
        folderName: rule.folderName,
        matchedKeyword: kw,
      }
    }
  }

  return {
    fileNum: 0,
    folderName: 'Uncategorized',
    matchedKeyword: null,
  }
}

/** Folder titles for manifest / AI mapping */
export function folderNameForFileNum(fileNum) {
  const cat = CATEGORIES.find((c) => c.fileNum === fileNum)
  return cat ? cat.folderName : 'Uncategorized'
}

export { CATEGORIES, SORTED_RULES }
