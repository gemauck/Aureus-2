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
      'proof of payment', 'proof of payments', 'proof of paument', 'proof of payement',
      'proof of bank payment', 'proof of eft payment', 'pop', 'p.o.p', 'p o p',
      'proof of delivery', 'pod',
      'tank reconcil', 'reconciliation', 'reconcilation',
      'photos of tanks', 'tank photo', 'calibration certificate', 'file 3 explanation',
      'invoice', 'invoices', 'supplier invoice', 'fuel invoice',
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
      'contractor pop', 'contractor pod',
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
      const kwNorm = normalizeForTokens(kw)
      rules.push({
        kw,
        kwNorm,
        kwTokens: kwNorm.split(' ').filter(Boolean),
        len: kw.length,
        fileNum: cat.fileNum,
        folderName: cat.folderName,
      })
    }
  }
  rules.sort((a, b) => b.len - a.len || a.kw.localeCompare(b.kw))
  return rules
}

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
        kwNorm: normalizeForTokens(kw),
        kwTokens: normalizeForTokens(kw).split(' ').filter(Boolean),
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

function normalizeForTokens(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const SORTED_RULES = buildSortedRules()

/** Short tokens (e.g. afs, cipc) should not match inside longer words like "gloss" / "cafs" */
const BOUNDARY_MAX_LEN = 4

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function containsAllTokens(text, tokens) {
  if (!tokens.length) return false
  return tokens.every((t) => text.includes(` ${t} `))
}

/**
 * High-confidence disambiguation rules before generic keywords.
 * These are tuned for common false positives in diesel refund bundles.
 */
function heuristicMatch(normalized, tokenText) {
  const has = (t) => tokenText.includes(` ${t} `)
  const hasAny = (tokens) => tokens.some((t) => has(t))
  const hasPhrase = (phrase) => tokenText.includes(` ${normalizeForTokens(phrase)} `)

  // Contractor financial docs should not fall into generic File 3 "invoice"
  if (
    hasPhrase('contractor invoice') ||
    hasPhrase('contractor remittance') ||
    hasPhrase('contractor proof of payment') ||
    (
      has('contractor') &&
      (hasPhrase('proof of payment') || hasPhrase('proof of paument') || hasPhrase('proof of payement') || hasPhrase('remittance advice'))
    )
  ) {
    return {
      fileNum: 6,
      folderName: 'File 6 - Operational and Contractor',
      matchedKeyword: 'heuristic: contractor + payment/invoice',
    }
  }

  // Explicit supplier/fuel invoice routing should win in non-contractor context
  if (
    (has('invoice') || has('invoices')) &&
    !has('contractor') &&
    (has('supplier') || has('fuel') || has('diesel') || has('delivery') || has('remittance'))
  ) {
    return {
      fileNum: 3,
      folderName: 'File 3 - Fuel System and Transactions',
      matchedKeyword: 'heuristic: supplier/fuel invoice',
    }
  }

  // POP/PoP/Proof of payment in normal supplier/fuel context -> File 3
  // (contractor POP still handled by the contractor heuristic above)
  const popAlias =
    hasAny(['pop']) ||
    tokenText.includes(' p o p ') ||
    (has('proof') && hasAny(['payment', 'payments', 'paument', 'payement']))
  if (popAlias) {
    return {
      fileNum: 3,
      folderName: 'File 3 - Fuel System and Transactions',
      matchedKeyword: 'heuristic: pop/proof-of-payment alias',
    }
  }

  // Contract-like terms with fuel/mining context -> File 2
  if ((has('contract') || has('agreement')) && (has('fuel') || has('supply') || has('mining') || has('product'))) {
    return {
      fileNum: 2,
      folderName: 'File 2 - Contracts',
      matchedKeyword: 'heuristic: contract/agreement context',
    }
  }

  // VAT201 and management/financial statements -> File 7
  if (normalized.includes('vat201') || has('vat') && has('201') || has('management') && has('accounts')) {
    return {
      fileNum: 7,
      folderName: 'File 7 - Financial and Compliance',
      matchedKeyword: 'heuristic: vat201/management accounts',
    }
  }

  return null
}

function keywordMatches(norm, base, tokenText, kw) {
  const kwNorm = normalizeForTokens(kw)
  const kwTokens = kwNorm.split(' ').filter(Boolean)

  if (kw.length <= BOUNDARY_MAX_LEN) {
    const re = new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i')
    return re.test(norm) || re.test(base)
  }

  if (norm.includes(kw) || base.includes(kw)) return true

  // For phrases like "contractor invoice", also match tokens in any separator/order context.
  if (kwTokens.length >= 2) {
    return containsAllTokens(tokenText, kwTokens)
  }

  return false
}

function scoreRuleMatch({ normalized, baseName, tokenText, rule }) {
  const kw = rule.kw
  const kwTokens = rule.kwTokens || []
  let score = 0

  if (kw.length <= BOUNDARY_MAX_LEN) {
    const re = new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i')
    if (re.test(normalized)) score += 100
    if (re.test(baseName)) score += 45
    return score
  }

  if (normalized.includes(kw)) score += 110 + Math.min(rule.len, 40)
  if (baseName.includes(kw)) score += 50 + Math.min(rule.len, 20)
  if (kwTokens.length >= 2 && containsAllTokens(tokenText, kwTokens)) {
    score += 55 + Math.min(rule.len, 25)
  }
  return score
}

function toConfidence(top, second) {
  if (top <= 0) return 0
  const margin = top - second
  if (margin >= 120) return 0.95
  if (margin >= 70) return 0.88
  if (margin >= 40) return 0.78
  if (margin >= 20) return 0.66
  return 0.52
}

/**
 * @param {string} entryPath - path inside zip (and/or filename)
 * @param {{ rules?: typeof SORTED_RULES }} [options]
 * @returns {{ fileNum: number, folderName: string, matchedKeyword: string | null, matchedBy: string, confidence: number, classifyReason: string }}
 */
export function classifyPath(entryPath, options = {}) {
  const normalized = (entryPath || '').toLowerCase().replace(/\\/g, '/')
  const baseName = normalized.split('/').pop() || ''
  const tokenText = ` ${normalizeForTokens(normalized)} `
  const ruleList = options.rules && Array.isArray(options.rules) ? options.rules : SORTED_RULES

  const heuristic = heuristicMatch(normalized, tokenText)
  if (heuristic) {
    return {
      ...heuristic,
      matchedBy: 'heuristic',
      confidence: 0.97,
      classifyReason: heuristic.matchedKeyword,
    }
  }

  const categoryScores = new Map()
  let bestRule = null
  let bestRuleScore = 0

  for (const rule of ruleList) {
    const kw = rule.kw
    if (!keywordMatches(normalized, baseName, tokenText, kw)) continue

    const score = scoreRuleMatch({ normalized, baseName, tokenText, rule })
    if (score <= 0) continue

    const prev = categoryScores.get(rule.fileNum) || 0
    categoryScores.set(rule.fileNum, prev + score)
    if (score > bestRuleScore) {
      bestRuleScore = score
      bestRule = rule
    }
  }

  const ranked = [...categoryScores.entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length > 0 && bestRule) {
    const [topFileNum, topScore] = ranked[0]
    const secondScore = ranked[1]?.[1] || 0
    return {
      fileNum: topFileNum,
      folderName: folderNameForFileNum(topFileNum),
      matchedKeyword: bestRule.kw,
      matchedBy: 'rule-score',
      confidence: toConfidence(topScore, secondScore),
      classifyReason: `top=${topScore};second=${secondScore};best=${bestRule.kw}`,
    }
  }

  return {
    fileNum: 0,
    folderName: 'Uncategorized',
    matchedKeyword: null,
    matchedBy: 'none',
    confidence: 0,
    classifyReason: 'no-rule-match',
  }
}

/** Folder titles for manifest / AI mapping */
export function folderNameForFileNum(fileNum) {
  const cat = CATEGORIES.find((c) => c.fileNum === fileNum)
  return cat ? cat.folderName : 'Uncategorized'
}

export { CATEGORIES, SORTED_RULES }
