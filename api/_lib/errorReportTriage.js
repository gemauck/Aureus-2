/**
 * Auto error report triage — open or update GitHub issues for ERP Feedback rows.
 * Sections: mobile-app, web-erp.
 * Enable with ERROR_REPORT_GITHUB_TRIAGE=1 (or MOBILE_ERROR_GITHUB_TRIAGE=1) and a GitHub token.
 */
import { getAppUrl } from './getAppUrl.js'
import { isInternalErrorProbe } from './errorReportProbe.js'

const DEFAULT_REPO = 'gemauck/Aureus-2'

const SECTION_CONFIG = {
  'mobile-app': {
    label: 'mobile-error',
    fpPrefix: 'mobile-fp-',
    categoryPrefix: 'mobile-',
    reportsTab: 'mobile-app',
    productName: 'Mobile app',
    cursorFocus: 'Focus on mobile-rn/ for React Native issues; check api/ if the report is API-related.'
  },
  'web-erp': {
    label: 'web-error',
    fpPrefix: 'web-fp-',
    categoryPrefix: 'web-',
    reportsTab: 'web-erp',
    productName: 'Web ERP',
    cursorFocus: 'Focus on src/ and api/ for browser ERP issues.'
  }
}

function triageEnabled() {
  const flag =
    String(process.env.ERROR_REPORT_GITHUB_TRIAGE || process.env.MOBILE_ERROR_GITHUB_TRIAGE || '').trim().toLowerCase()
  if (flag === '0' || flag === 'false' || flag === 'off') return false
  if (flag === '1' || flag === 'true' || flag === 'on') return Boolean(githubToken())
  return Boolean(githubToken())
}

function githubToken() {
  return (
    String(process.env.ERROR_REPORT_GITHUB_TOKEN || process.env.MOBILE_ERROR_GITHUB_TOKEN || '').trim() ||
    String(process.env.GITHUB_TOKEN || '').trim() ||
    ''
  )
}

function githubRepo() {
  return (
    String(process.env.ERROR_REPORT_GITHUB_REPO || process.env.MOBILE_ERROR_GITHUB_REPO || DEFAULT_REPO).trim() ||
    DEFAULT_REPO
  )
}

function parseMeta(feedback) {
  if (!feedback?.meta) return {}
  try {
    return typeof feedback.meta === 'string' ? JSON.parse(feedback.meta) : feedback.meta
  } catch {
    return {}
  }
}

function fingerprintLabel(fingerprint, fpPrefix) {
  const raw = String(fingerprint || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/_+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `${fpPrefix}${raw || 'unknown'}`
}

function categoryLabel(category, categoryPrefix) {
  const c = String(category || 'issue').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return `${categoryPrefix}${c || 'issue'}`.slice(0, 50)
}

function shouldTriage(feedback, meta) {
  const severity = String(feedback?.severity || 'medium').toLowerCase()
  const category = String(meta?.category || '').toLowerCase()
  if (category === 'crash') return true
  if (severity === 'high' || severity === 'medium') return true
  return false
}

function truncate(text, max) {
  const s = String(text || '')
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

function formatBreadcrumbs(breadcrumbs) {
  if (!Array.isArray(breadcrumbs) || !breadcrumbs.length) return '_None_'
  return breadcrumbs
    .slice(-15)
    .map((b) => {
      const ts = b?.ts ? `\`${b.ts}\` ` : ''
      const type = b?.type ? `[${b.type}] ` : ''
      return `- ${ts}${type}${b?.message || ''}`
    })
    .join('\n')
}

function buildIssueBody(feedback, meta, submittingUser, config) {
  const appBase = getAppUrl().replace(/\/$/, '')
  const erpUrl = `${appBase}/#/reports?tab=${config.reportsTab}&highlightFeedbackId=${encodeURIComponent(feedback.id)}`
  const err = meta?.error || {}
  const device = meta?.device || {}
  const browser = meta?.browser || {}
  const api = meta?.api
  const userLine = submittingUser?.name || submittingUser?.email || feedback.userId || 'unknown user'
  const location = meta?.screen || meta?.route || feedback.pageUrl || '—'

  const lines = [
    `## ${config.productName} error report`,
    '',
    `**ERP report:** [Open in Reports → ${config.productName}](${erpUrl})`,
    `**Feedback ID:** \`${feedback.id}\``,
    `**Severity:** ${feedback.severity || 'medium'}`,
    `**Category:** ${meta?.category || '—'}`,
    `**Location:** ${location}`,
    `**Context:** ${meta?.context || '—'}`,
    `**Fingerprint:** \`${meta?.fingerprint || '—'}\``,
    `**Reporter:** ${userLine}`,
    ''
  ]

  if (api?.path) {
    lines.push(
      '### API',
      '',
      `\`${api.method || 'GET'} ${api.path}\`${api.statusCode != null ? ` — HTTP ${api.statusCode}` : ''}`,
      ''
    )
  }

  if (device?.nativeVersion || device?.platform) {
    lines.push(
      '### Device',
      '',
      `- App: ${device.nativeVersion || '—'}${device.runtimeVersion ? ` (OTA ${device.runtimeVersion})` : ''}`,
      `- Platform: ${device.platform || '—'} ${device.osVersion || ''}`.trim(),
      device.deviceName ? `- Device: ${device.deviceName}` : null,
      device.channel ? `- OTA channel: ${device.channel}` : null,
      ''
    )
  }

  if (browser?.userAgent || browser?.viewport) {
    lines.push(
      '### Browser',
      '',
      browser.userAgent ? `- User agent: ${browser.userAgent}` : null,
      browser.viewport ? `- Viewport: ${browser.viewport}` : null,
      browser.platform ? `- Platform: ${browser.platform}` : null,
      browser.buildTag ? `- Build: ${browser.buildTag}` : null,
      browser.online === false ? '- **Offline** at report time' : null,
      ''
    )
  }

  lines.push(
    '### Message',
    '',
    '```',
    String(feedback.message || '').trim(),
    '```',
    ''
  )

  if (err?.message || err?.stack) {
    lines.push(
      '### Stack',
      '',
      '```',
      truncate(err.stack || `${err.name || 'Error'}: ${err.message || ''}`, 12000),
      '```',
      ''
    )
  }

  if (meta?.componentStack) {
    lines.push(
      '### Component stack',
      '',
      '```',
      truncate(meta.componentStack, 6000),
      '```',
      ''
    )
  }

  lines.push('### Breadcrumbs', '', formatBreadcrumbs(meta?.breadcrumbs), '')

  lines.push(
    '---',
    `_Auto-created from Abcotronics ERP ${config.productName.toLowerCase()} error reporting. Cursor triage may open a PR — review before deploy._`
  )

  return lines.filter((line) => line != null).join('\n')
}

function buildIssueTitle(feedback, meta, config) {
  const category = String(meta?.category || 'issue')
  const err = meta?.error || {}
  const short =
    truncate(err.message || String(feedback.message || '').split('\n')[0] || 'Unknown error', 72) ||
    'Unknown error'
  const location = meta?.screen || meta?.route
  const locBit = location ? ` @ ${location}` : ''
  return `[${config.productName} — ${category}]${locBit}: ${short}`
}

async function githubRequest(path, { method = 'GET', body } = {}) {
  const token = githubToken()
  const repo = githubRepo()
  const [owner, name] = repo.split('/')
  if (!owner || !name) throw new Error(`Invalid ERROR_REPORT_GITHUB_REPO: ${repo}`)

  const url = path.startsWith('http')
    ? path
    : `https://api.github.com/repos/${owner}/${name}${path}`

  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })

  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!response.ok) {
    const msg =
      (data && typeof data === 'object' && data.message) ||
      (typeof data === 'string' ? data : '') ||
      response.statusText
    throw new Error(`GitHub API ${response.status}: ${msg}`)
  }

  return data
}

async function findOpenIssueByFingerprint(fpLabel) {
  const issues = await githubRequest(`/issues?state=open&labels=${encodeURIComponent(fpLabel)}&per_page=5`)
  if (!Array.isArray(issues) || !issues.length) return null
  return issues.find((issue) => !issue.pull_request) || null
}

async function triageErrorFeedback(feedback, submittingUser = null) {
  if (!triageEnabled()) return null
  const section = feedback?.section
  const config = SECTION_CONFIG[section]
  if (!feedback?.id || !config) return null

  const meta = parseMeta(feedback)
  if (isInternalErrorProbe({ message: feedback.message, meta }, null)) return null
  if (!shouldTriage(feedback, meta)) return null

  const fpLabel = fingerprintLabel(meta.fingerprint, config.fpPrefix)
  const labels = [config.label, fpLabel, categoryLabel(meta.category, config.categoryPrefix)]

  try {
    const existing = await findOpenIssueByFingerprint(fpLabel)
    const erpUrl = `${getAppUrl().replace(/\/$/, '')}/#/reports?tab=${config.reportsTab}&highlightFeedbackId=${encodeURIComponent(feedback.id)}`

    if (existing?.number) {
      const comment = [
        `Another occurrence of this ${config.productName.toLowerCase()} error was reported.`,
        '',
        `- **Feedback ID:** \`${feedback.id}\``,
        `- **Severity:** ${feedback.severity || 'medium'}`,
        `- **Location:** ${meta?.screen || meta?.route || feedback.pageUrl || '—'}`,
        `- [View in ERP](${erpUrl})`
      ].join('\n')

      await githubRequest(`/issues/${existing.number}/comments`, {
        method: 'POST',
        body: { body: comment }
      })

      console.log(`✅ Error triage (${section}): commented on GitHub issue #${existing.number} (${feedback.id})`)
      return { action: 'comment', issueNumber: existing.number, url: existing.html_url }
    }

    const created = await githubRequest('/issues', {
      method: 'POST',
      body: {
        title: buildIssueTitle(feedback, meta, config),
        body: buildIssueBody(feedback, meta, submittingUser, config),
        labels
      }
    })

    console.log(`✅ Error triage (${section}): created GitHub issue #${created.number} (${feedback.id})`)
    return { action: 'created', issueNumber: created.number, url: created.html_url }
  } catch (error) {
    console.error(`❌ Error GitHub triage failed (${section}):`, error?.message || error)
    return null
  }
}

export async function triageMobileErrorFeedback(feedback, submittingUser = null) {
  return triageErrorFeedback(feedback, submittingUser)
}

export async function triageWebErrorFeedback(feedback, submittingUser = null) {
  return triageErrorFeedback(feedback, submittingUser)
}

export { SECTION_CONFIG }
