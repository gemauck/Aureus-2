/**
 * Shared helpers for project correspondence threads and entries.
 */
import crypto from 'crypto'
import { prisma } from './prisma.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const CORRESPONDENCE_TYPES = [
  { id: 'formal_letter', label: 'Formal letter' },
  { id: 'email', label: 'Email' },
  { id: 'phone_call', label: 'Phone call' },
  { id: 'meeting', label: 'Meeting / minutes' },
  { id: 'site_visit', label: 'Site visit' },
  { id: 'memo', label: 'Memo / note' },
  { id: 'contract', label: 'Contract / agreement' },
  { id: 'notice', label: 'Notice / instruction' },
  { id: 'invoice_payment', label: 'Invoice / payment' },
  { id: 'other', label: 'Other' }
]

export const CORRESPONDENCE_STATUSES = [
  { id: 'open', label: 'Open' },
  { id: 'pending', label: 'Awaiting response' },
  { id: 'closed', label: 'Closed' },
  { id: 'archived', label: 'Archived' }
]

export const CONFIDENTIALITY_LEVELS = [
  { id: 'standard', label: 'Standard' },
  { id: 'client', label: 'Client confidential' },
  { id: 'internal', label: 'Internal only' }
]

const TYPE_IDS = new Set(CORRESPONDENCE_TYPES.map((t) => t.id))
const STATUS_IDS = new Set(CORRESPONDENCE_STATUSES.map((s) => s.id))
const CONF_IDS = new Set(CONFIDENTIALITY_LEVELS.map((c) => c.id))

export function isValidEmail(s) {
  return typeof s === 'string' && s.trim().length > 0 && EMAIL_RE.test(s.trim())
}

export function normalizeCorrespondenceType(value, fallback = 'other') {
  const v = String(value || '').trim().toLowerCase()
  return TYPE_IDS.has(v) ? v : fallback
}

export function normalizeCorrespondenceStatus(value, fallback = 'open') {
  const v = String(value || '').trim().toLowerCase()
  return STATUS_IDS.has(v) ? v : fallback
}

export function normalizeConfidentiality(value, fallback = 'standard') {
  const v = String(value || '').trim().toLowerCase()
  return CONF_IDS.has(v) ? v : fallback
}

export function generateCorrespondenceRequestNumber(year) {
  const y = Number(year) && !Number.isNaN(Number(year)) ? Number(year) : new Date().getFullYear()
  return `CORR-${y}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
}

function getInboundBaseEmail() {
  return (
    process.env.PROJECT_CORRESPONDENCE_INBOUND_EMAIL ||
    process.env.DOCUMENT_REQUEST_INBOUND_EMAIL ||
    process.env.INBOUND_EMAIL_FOR_DOCUMENT_REQUESTS ||
    ''
  )
}

export const PROJECT_INBOX_EMAIL_SUFFIX = '_doc_proj'

export function normalizeInboxSlug(value) {
  const slug = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return slug
}

export function getCorrespondenceInboundDomain() {
  const base = getInboundBaseEmail()
  if (!base || !isValidEmail(base)) return null
  const at = base.indexOf('@')
  return at > 0 ? base.slice(at + 1).trim().toLowerCase() : null
}

export function buildProjectCorrespondenceEmailFromSlug(slug, projectId) {
  const domain = getCorrespondenceInboundDomain()
  if (!domain) return null
  const normalized = normalizeInboxSlug(slug)
  const fallback = `p${String(projectId || '')
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 12)
    .toLowerCase()}`
  const finalSlug = normalized || fallback
  if (!finalSlug) return null
  return `${finalSlug}${PROJECT_INBOX_EMAIL_SUFFIX}@${domain}`.toLowerCase()
}

export function generateProjectCorrespondenceInboundEmail(projectId, inboxSlug = null) {
  return buildProjectCorrespondenceEmailFromSlug(inboxSlug, projectId)
}

export function getCorrespondenceInboundEmail(requestNumber) {
  const base = getInboundBaseEmail()
  if (!base || !isValidEmail(base)) return null
  const at = base.indexOf('@')
  if (at <= 0) return base
  const local = base.slice(0, at)
  const domain = base.slice(at + 1)
  const slug = String(requestNumber || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug ? `${local}+corr-${slug}@${domain}` : base
}

function isLegacyProjectInboxEmail(email) {
  return typeof email === 'string' && /\+corr-proj-/i.test(email)
}

export async function ensureProjectCorrespondenceInboundEmail(projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      correspondenceInboundEmail: true,
      correspondenceInboxSlug: true,
      hasCorrespondenceProcess: true
    }
  })
  if (!project) return null

  const existing = (project.correspondenceInboundEmail || '').trim().toLowerCase()
  let slug = normalizeInboxSlug(project.correspondenceInboxSlug)

  if (!slug && existing && isLegacyProjectInboxEmail(existing)) {
    const legacyMatch = existing.match(/\+corr-proj-([^@]+)@/i)
    if (legacyMatch?.[1]) slug = normalizeInboxSlug(legacyMatch[1])
  }

  const canonical = buildProjectCorrespondenceEmailFromSlug(slug || null, projectId)
  if (!canonical) {
    return existing && isValidEmail(existing) ? existing : null
  }

  const needsUpdate =
    existing !== canonical ||
    (slug && normalizeInboxSlug(project.correspondenceInboxSlug) !== slug)

  if (needsUpdate) {
    try {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          correspondenceInboundEmail: canonical,
          ...(slug ? { correspondenceInboxSlug: slug } : {})
        }
      })
    } catch (_) {
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "Project" SET "correspondenceInboundEmail" = $1, "correspondenceInboxSlug" = $2 WHERE id = $3`,
          canonical,
          slug || null,
          projectId
        )
      } catch (e2) {
        console.warn('ensureProjectCorrespondenceInboundEmail:', e2?.message)
        return existing && isValidEmail(existing) ? existing : canonical
      }
    }
  }

  return canonical
}

export async function setProjectCorrespondenceInboxSlug(projectId, rawSlug) {
  const slug = normalizeInboxSlug(rawSlug)
  if (!slug || slug.length < 2) {
    return { ok: false, error: 'Inbox name must be at least 2 characters (letters and numbers)', status: 400 }
  }
  const email = buildProjectCorrespondenceEmailFromSlug(slug, projectId)
  if (!email) {
    return { ok: false, error: 'Inbound email is not configured on the server', status: 503 }
  }
  const clash = await prisma.project.findFirst({
    where: {
      id: { not: projectId },
      OR: [
        { correspondenceInboundEmail: { equals: email, mode: 'insensitive' } },
        { correspondenceInboxSlug: { equals: slug, mode: 'insensitive' } }
      ]
    },
    select: { id: true, name: true }
  })
  if (clash) {
    return {
      ok: false,
      error: `Inbox name "${slug}" is already used by project "${clash.name}"`,
      status: 409
    }
  }
  await prisma.project.update({
    where: { id: projectId },
    data: {
      correspondenceInboxSlug: slug,
      correspondenceInboundEmail: email
    }
  })
  return {
    ok: true,
    correspondenceInboxSlug: slug,
    correspondenceInboundEmail: email,
    correspondenceInboxDomain: getCorrespondenceInboundDomain()
  }
}

export function parseJsonArrayStored(s) {
  if (!s || typeof s !== 'string') return []
  try {
    const j = JSON.parse(s)
    return Array.isArray(j) ? j : []
  } catch {
    return []
  }
}

export function parseAttachmentsStored(s) {
  const raw = parseJsonArrayStored(s)
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const fileName = String(item.fileName || item.name || '').trim()
      const filePath = String(item.filePath || item.path || '').trim()
      if (!fileName && !filePath) return null
      return {
        fileName: fileName || filePath.split('/').pop() || 'attachment',
        filePath,
        mimeType: item.mimeType || item.type || null,
        size: item.size != null ? Number(item.size) : null
      }
    })
    .filter(Boolean)
}

export function serializeJsonArray(arr) {
  return JSON.stringify(Array.isArray(arr) ? arr : [])
}

export function normalizeDirection(value, kind = 'manual') {
  const v = String(value || '').toLowerCase()
  if (v === 'outbound' || v === 'inbound' || v === 'internal') return v
  if (kind === 'sent') return 'outbound'
  if (kind === 'received') return 'inbound'
  return 'internal'
}

function normalizeEmailList(value) {
  if (!value) return []
  if (typeof value === 'string') {
    const out = []
    const parts = value.split(/[;,]+/)
    for (const p of parts) {
      const m = p.match(/<([^>]+)>/)
      const email = (m && m[1] ? m[1] : p).trim().toLowerCase()
      if (isValidEmail(email)) out.push(email)
    }
    return out
  }
  if (Array.isArray(value)) {
    const out = []
    for (const item of value) {
      if (!item) continue
      if (typeof item === 'string') out.push(...normalizeEmailList(item))
      else if (typeof item === 'object') {
        const email = item.email || item.address || item.value || ''
        out.push(...normalizeEmailList(String(email)))
      }
    }
    return out
  }
  return []
}

export function extractRecipientEmailsFromInbound(email) {
  if (!email || typeof email !== 'object') return []
  const headers = {}
  const rawHeaders = email.headers
  if (Array.isArray(rawHeaders)) {
    for (const h of rawHeaders) {
      if (h && typeof h === 'object') {
        const k = (h.name || h.key || '').toLowerCase().trim()
        const v = h.value ?? h.val ?? ''
        if (k) headers[k] = String(v)
      }
    }
  } else if (rawHeaders && typeof rawHeaders === 'object') {
    for (const [k, v] of Object.entries(rawHeaders)) {
      if (k && v != null) headers[k.toLowerCase()] = String(v)
    }
  }
  const list = [
    ...normalizeEmailList(email.to),
    ...normalizeEmailList(email.tos),
    ...normalizeEmailList(email.cc),
    ...normalizeEmailList(email.ccs),
    ...normalizeEmailList(email.bcc),
    ...normalizeEmailList(email.bccs),
    ...normalizeEmailList(headers.to),
    ...normalizeEmailList(headers.cc),
    ...normalizeEmailList(headers.bcc)
  ]
  return [...new Set(list.map((e) => e.trim().toLowerCase()))].filter((e) => isValidEmail(e))
}

export function parseCorrespondenceThread(row) {
  if (!row) return null
  return {
    id: row.id,
    projectId: row.projectId,
    subject: row.subject,
    requestNumber: row.requestNumber,
    correspondenceType: normalizeCorrespondenceType(row.correspondenceType),
    status: normalizeCorrespondenceStatus(row.status),
    counterparty: row.counterparty || null,
    externalReference: row.externalReference || null,
    summary: row.summary || null,
    createdById: row.createdById,
    createdBy: row.createdBy
      ? { id: row.createdBy.id, name: row.createdBy.name, email: row.createdBy.email }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastActivityAt: row.lastActivityAt
  }
}

export function parseCorrespondenceEntry(row) {
  if (!row) return null
  const parsed = { ...row }
  parsed.correspondenceType = normalizeCorrespondenceType(row.correspondenceType)
  parsed.confidentiality = normalizeConfidentiality(row.confidentiality)
  parsed.toEmails = parseJsonArrayStored(row.toEmails)
  parsed.ccEmails = parseJsonArrayStored(row.ccEmails)
  parsed.attachments = parseAttachmentsStored(row.attachments)
  parsed.emailArchivePath = row.emailArchivePath || null
  parsed.rawEmailPath = row.rawEmailPath || null
  if (row.author) {
    parsed.author = { id: row.author.id, name: row.author.name, email: row.author.email }
  }
  return parsed
}

export async function ensureCorrespondenceTables() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ProjectCorrespondenceThread" (
        id TEXT PRIMARY KEY,
        "projectId" TEXT NOT NULL,
        subject TEXT NOT NULL DEFAULT '',
        "requestNumber" TEXT,
        "correspondenceType" TEXT NOT NULL DEFAULT 'other',
        status TEXT NOT NULL DEFAULT 'open',
        counterparty TEXT,
        "externalReference" TEXT,
        summary TEXT,
        "createdById" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ProjectCorrespondenceEntry" (
        id TEXT PRIMARY KEY,
        "projectId" TEXT NOT NULL,
        "threadId" TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'manual',
        direction TEXT NOT NULL DEFAULT 'internal',
        "correspondenceType" TEXT NOT NULL DEFAULT 'other',
        subject TEXT NOT NULL DEFAULT '',
        "bodyText" TEXT NOT NULL DEFAULT '',
        "bodyHtml" TEXT,
        "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "authorId" TEXT,
        "fromEmail" TEXT,
        "toEmails" TEXT NOT NULL DEFAULT '[]',
        "ccEmails" TEXT NOT NULL DEFAULT '[]',
        "contactName" TEXT,
        "contactOrganization" TEXT,
        "contactPhone" TEXT,
        "externalReference" TEXT,
        "actionRequired" TEXT,
        "followUpDate" TIMESTAMP(3),
        location TEXT,
        "durationMinutes" INTEGER,
        outcome TEXT,
        confidentiality TEXT NOT NULL DEFAULT 'standard',
        "messageId" TEXT,
        "deliveryStatus" TEXT NOT NULL DEFAULT 'sent',
        "deliveredAt" TIMESTAMP(3),
        "bouncedAt" TIMESTAMP(3),
        "bounceReason" TEXT,
        "lastEventAt" TIMESTAMP(3),
        attachments TEXT NOT NULL DEFAULT '[]',
        "emailArchivePath" TEXT,
        "rawEmailPath" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ProjectCorrespondenceInboundUnmatched" (
        id TEXT PRIMARY KEY,
        "emailId" TEXT NOT NULL UNIQUE,
        "fromAddress" TEXT,
        subject TEXT,
        "candidatesJson" TEXT,
        reason TEXT DEFAULT 'no_match',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await prisma.$executeRawUnsafe(`ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "hasCorrespondenceProcess" BOOLEAN DEFAULT false`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "correspondenceInboundEmail" TEXT`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "correspondenceInboxSlug" TEXT`)
    const threadCols = [
      ['correspondenceType', "TEXT NOT NULL DEFAULT 'other'"],
      ['status', "TEXT NOT NULL DEFAULT 'open'"],
      ['counterparty', 'TEXT'],
      ['externalReference', 'TEXT'],
      ['summary', 'TEXT']
    ]
    for (const [col, def] of threadCols) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "ProjectCorrespondenceThread" ADD COLUMN IF NOT EXISTS "${col}" ${def}`)
    }
    const entryCols = [
      ['correspondenceType', "TEXT NOT NULL DEFAULT 'other'"],
      ['contactName', 'TEXT'],
      ['contactOrganization', 'TEXT'],
      ['contactPhone', 'TEXT'],
      ['externalReference', 'TEXT'],
      ['actionRequired', 'TEXT'],
      ['followUpDate', 'TIMESTAMP(3)'],
      ['location', 'TEXT'],
      ['durationMinutes', 'INTEGER'],
      ['outcome', 'TEXT'],
      ['confidentiality', "TEXT NOT NULL DEFAULT 'standard'"],
      ['emailArchivePath', 'TEXT'],
      ['rawEmailPath', 'TEXT']
    ]
    for (const [col, def] of entryCols) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "ProjectCorrespondenceEntry" ADD COLUMN IF NOT EXISTS "${col}" ${def}`)
    }
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProjectCorrespondenceThread_projectId_idx" ON "ProjectCorrespondenceThread" ("projectId")`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProjectCorrespondenceThread_requestNumber_idx" ON "ProjectCorrespondenceThread" ("requestNumber")`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProjectCorrespondenceEntry_threadId_idx" ON "ProjectCorrespondenceEntry" ("threadId")`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProjectCorrespondenceEntry_projectId_idx" ON "ProjectCorrespondenceEntry" ("projectId")`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProjectCorrespondenceEntry_messageId_idx" ON "ProjectCorrespondenceEntry" ("messageId")`)
  } catch (e) {
    console.warn('⚠️ Could not ensure correspondence tables:', e?.message)
  }
}

export async function assertProjectCorrespondenceEnabled(projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      hasCorrespondenceProcess: true,
      correspondenceInboundEmail: true,
      correspondenceInboxSlug: true
    }
  })
  if (!project) return { ok: false, error: 'Project not found', status: 404 }
  if (!project.hasCorrespondenceProcess) {
    return { ok: false, error: 'Correspondence module is not enabled for this project', status: 403 }
  }
  let inboxEmail = await ensureProjectCorrespondenceInboundEmail(projectId)
  if (!inboxEmail) {
    inboxEmail = (project.correspondenceInboundEmail || '').trim().toLowerCase()
  }
  const refreshed = await prisma.project.findUnique({
    where: { id: projectId },
    select: { correspondenceInboundEmail: true, correspondenceInboxSlug: true }
  })
  return {
    ok: true,
    project: {
      ...project,
      correspondenceInboundEmail: refreshed?.correspondenceInboundEmail || inboxEmail,
      correspondenceInboxSlug: refreshed?.correspondenceInboxSlug ?? project.correspondenceInboxSlug ?? null
    }
  }
}

export async function findProjectByCorrespondenceInbox(recipientEmails) {
  const emails = Array.isArray(recipientEmails) ? recipientEmails : []
  if (emails.length === 0) return null
  const normalized = [...new Set(emails.map((e) => String(e).trim().toLowerCase()).filter((e) => isValidEmail(e)))]
  if (normalized.length === 0) return null
  const project = await prisma.project.findFirst({
    where: {
      hasCorrespondenceProcess: true,
      correspondenceInboundEmail: { in: normalized, mode: 'insensitive' }
    },
    select: { id: true, name: true, correspondenceInboundEmail: true }
  })
  return project
}

export async function touchThreadActivity(threadId, at = new Date()) {
  try {
    await prisma.projectCorrespondenceThread.update({
      where: { id: threadId },
      data: { lastActivityAt: at, updatedAt: at }
    })
  } catch (_) {}
}

export function normalizeMessageId(value) {
  if (!value || typeof value !== 'string') return ''
  return value.replace(/[<>]/g, '').trim().toLowerCase()
}
