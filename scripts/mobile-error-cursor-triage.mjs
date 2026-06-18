#!/usr/bin/env node
/**
 * Launch a Cursor cloud agent to investigate a GitHub issue labeled mobile-error.
 * Used by .github/workflows/mobile-error-triage.yml — requires CURSOR_API_KEY.
 */
import { readFileSync } from 'node:fs'

const CURSOR_API = 'https://api.cursor.com/v1/agents'
const DEFAULT_REPO = 'https://github.com/gemauck/Aureus-2'

function required(name) {
  const value = String(process.env[name] || '').trim()
  if (!value) throw new Error(`Missing required env: ${name}`)
  return value
}

function loadIssueFromEvent() {
  const path = process.env.GITHUB_EVENT_PATH
  if (!path) throw new Error('GITHUB_EVENT_PATH is required')
  const event = JSON.parse(readFileSync(path, 'utf8'))
  const issue = event.issue
  if (!issue?.number) throw new Error('Event does not include issue.number')
  return issue
}

function hasLabel(issue, name) {
  return (issue.labels || []).some((label) => {
    const labelName = typeof label === 'string' ? label : label?.name
    return labelName === name
  })
}

function buildPrompt(issue) {
  const isWeb = hasLabel(issue, 'web-error')
  const product = isWeb ? 'web ERP (browser)' : 'mobile app (field devices)'
  const focus = isWeb
    ? 'Focus on src/ for React UI issues and api/ for backend/API failures.'
    : 'Focus on mobile-rn/ for React Native issues; check api/ if the report is API-related.'

  return [
    `A new ${product} error was reported from production.`,
    'The full diagnostics are in this GitHub issue body (stack, route/screen, breadcrumbs, device/browser info).',
    '',
    'Your job:',
    '1. Read the issue body carefully and locate the root cause in this repository.',
    `2. ${focus}`,
    '3. Implement a minimal, focused fix that matches existing code style.',
    '4. Do NOT deploy or merge — open a pull request only.',
    '5. In the PR description, link back to this issue and summarize cause + fix.',
    '',
    `GitHub issue #${issue.number}: ${issue.title}`,
    '',
    '---',
    '',
    issue.body || '(no body)'
  ].join('\n')
}

async function githubRequest(path, { method = 'GET', body } = {}) {
  const token = required('GITHUB_TOKEN')
  const repo = String(process.env.GITHUB_REPOSITORY || 'gemauck/Aureus-2').trim()
  const [owner, name] = repo.split('/')
  const url = `https://api.github.com/repos/${owner}/${name}${path}`

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
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new Error(`GitHub ${response.status}: ${data?.message || text}`)
  }
  return data
}

async function launchCursorAgent(issue) {
  const apiKey = required('CURSOR_API_KEY')
  const repoUrl = String(process.env.MOBILE_ERROR_CURSOR_REPO_URL || DEFAULT_REPO).trim()
  const startingRef = String(process.env.MOBILE_ERROR_CURSOR_REF || 'main').trim()
  const modelId = String(process.env.MOBILE_ERROR_CURSOR_MODEL || 'composer-2.5').trim()
  const autoCreatePR = String(process.env.MOBILE_ERROR_CURSOR_AUTO_PR || '1') !== '0'

  const response = await fetch(CURSOR_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: truncate(`Mobile fix #${issue.number}`, 100),
      prompt: { text: buildPrompt(issue) },
      model: { id: modelId },
      repos: [{ url: repoUrl, startingRef }],
      autoCreatePR,
      skipReviewerRequest: true,
      mode: 'agent'
    })
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new Error(`Cursor API ${response.status}: ${data?.message || text}`)
  }
  return data
}

function truncate(text, max) {
  const s = String(text || '')
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

async function main() {
  const issue = loadIssueFromEvent()

  if (!hasLabel(issue, 'mobile-error')) {
    console.log('Issue does not have mobile-error label — skipping.')
    return
  }
  if (hasLabel(issue, 'cursor-triaged')) {
    console.log('Issue already cursor-triaged — skipping.')
    return
  }

  const apiKey = String(process.env.CURSOR_API_KEY || '').trim()
  if (!apiKey) {
    await githubRequest(`/issues/${issue.number}/comments`, {
      method: 'POST',
      body: {
        body: [
          'ℹ️ **Mobile error logged** — Cursor auto-triage is not configured for this repo.',
          '',
          'To enable automatic investigation + PR:',
          '1. Add repo secret `CURSOR_API_KEY` (Cursor Dashboard → API Keys)',
          '2. Re-open this issue or remove/re-add the `mobile-error` label after configuring',
          '',
          'You can still fix manually in Cursor by pasting this issue into chat.'
        ].join('\n')
      }
    })
    await githubRequest(`/issues/${issue.number}/labels`, {
      method: 'POST',
      body: { labels: ['cursor-triaged'] }
    })
    console.log('CURSOR_API_KEY not set — posted setup note on issue.')
    return
  }

  const result = await launchCursorAgent(issue)
  const agent = result?.agent || result
  const agentUrl = agent?.url || `(agent ${agent?.id || 'unknown'})`

  await githubRequest(`/issues/${issue.number}/comments`, {
    method: 'POST',
    body: {
      body: [
        '🤖 **Cursor cloud agent started** to investigate this mobile error.',
        '',
        `- Agent: ${agentUrl}`,
        '- A pull request will be opened automatically if a fix is found.',
        '- **Review the PR before merging or deploying.**'
      ].join('\n')
    }
  })

  await githubRequest(`/issues/${issue.number}/labels`, {
    method: 'POST',
    body: { labels: ['cursor-triaged'] }
  })

  console.log(`Cursor agent launched for issue #${issue.number}: ${agentUrl}`)
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exit(1)
})
