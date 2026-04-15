/**
 * POST /api/projects/:id/document-collection-send-email
 * Send document request emails to contacts. Used by Document Collection checklist
 * "Request documents" flow. Uses existing mail infrastructure (Resend/SendGrid/SMTP).
 * Optional body: sectionId, documentId, month, year — when provided, Reply-To is set
 * to the inbound address and a custom Message-ID is set so reply In-Reply-To matches.
 * The requester is CC'd so that "Reply All" from the recipient includes them (reduces risk
 * of missing replies if the inbound webhook fails). A short line in the body asks recipients
 * to use Reply All when responding.
 */
import crypto from 'crypto'
import { authRequired } from '../../_lib/authRequired.js'
import { parseJsonBody } from '../../_lib/body.js'
import { normalizeDocumentCollectionCell, normalizeProjectIdFromRequest } from '../../_lib/documentCollectionCellKeys.js'
import { sendEmail } from '../../_lib/email.js'
import { ok, badRequest, serverError } from '../../_lib/response.js'
import { prisma } from '../../_lib/prisma.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidEmail(s) {
  return typeof s === 'string' && s.trim().length > 0 && EMAIL_RE.test(s.trim())
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function generateRequestNumber(year) {
  const y = Number(year) && !Number.isNaN(Number(year)) ? Number(year) : new Date().getFullYear()
  return `DOC-${y}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
}

async function getExistingRequestNumberForCell({ projectId, documentId, year, month }) {
  try {
    const log = await prisma.documentCollectionEmailLog.findFirst({
      where: { projectId, documentId, year, month, requestNumber: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { requestNumber: true }
    })
    if (log?.requestNumber) return log.requestNumber
  } catch (_) {}
  try {
    const row = await prisma.documentRequestEmailSent.findFirst({
      where: { projectId, documentId, year, month, requestNumber: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { requestNumber: true }
    })
    if (row?.requestNumber) return row.requestNumber
  } catch (_) {}
  return null
}

function parseJsonEmailArrayStored(s) {
  if (!s || typeof s !== 'string') return []
  try {
    const j = JSON.parse(s)
    return Array.isArray(j) ? j.map((e) => String(e).trim().toLowerCase()).filter(Boolean) : []
  } catch {
    return []
  }
}

async function getAllowedRecipientSetForReply({ projectId, documentId, year, month, requestNumber }) {
  const set = new Set()
  const addLog = (log) => {
    parseJsonEmailArrayStored(log.toEmails).forEach((e) => set.add(e))
    parseJsonEmailArrayStored(log.ccEmails).forEach((e) => set.add(e))
  }
  try {
    if (requestNumber) {
      const logs = await prisma.documentCollectionEmailLog.findMany({
        where: { projectId, documentId, year, month, kind: 'sent', requestNumber },
        orderBy: { createdAt: 'desc' },
        take: 10
      })
      logs.forEach(addLog)
    }
    if (set.size === 0) {
      const log = await prisma.documentCollectionEmailLog.findFirst({
        where: { projectId, documentId, year, month, kind: 'sent' },
        orderBy: { createdAt: 'desc' }
      })
      if (log) addLog(log)
    }
  } catch (_) {}
  const extra = (process.env.DOCUMENT_COLLECTION_CC_EXTRA_ALLOWLIST || '')
    .split(/[;,]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  extra.forEach((e) => set.add(e))
  return set
}

function parseDocAndPeriodFromSubject(subject) {
  if (!subject || typeof subject !== 'string') return { docName: null, month: null, year: null }
  const subj = subject.trim()
  if (!subj) return { docName: null, month: null, year: null }
  let month = null
  let year = null
  let docName = null
  const dash = '[\\s\\u002D\\u2013\\u2014]+'
  let lastMatchIndex = -1
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    const re = new RegExp(`${dash}([^\\u002D\\u2013\\u2014]+)${dash}${MONTH_NAMES[i]}\\s+(20\\d{2})\\b`, 'gi')
    let m
    while ((m = re.exec(subj)) !== null) {
      if (m.index > lastMatchIndex) {
        lastMatchIndex = m.index
        docName = m[1].trim()
        month = i + 1
        year = parseInt(m[2], 10)
      }
    }
  }
  if (!month || !year) {
    const abbr = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    for (let i = 0; i < MONTH_NAMES.length; i++) {
      const re = new RegExp(`\\b${MONTH_NAMES[i]}\\s+(20\\d{2})\\b`, 'i')
      const m = re.exec(subj)
      if (m && m[1]) {
        month = i + 1
        year = parseInt(m[1], 10)
        break
      }
      const reAbbr = new RegExp(`\\b${abbr[i]}\\w*\\s+(20\\d{2})\\b`, 'i')
      const mAbbr = reAbbr.exec(subj)
      if (mAbbr && mAbbr[1]) {
        month = i + 1
        year = parseInt(mAbbr[1], 10)
        break
      }
    }
  }
  return { docName, month, year }
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).setHeader('Allow', 'POST').json({ error: 'Method not allowed' })
  }

  let projectId = normalizeProjectIdFromRequest({ req, rawId: req.params?.id })

  try {
    const body = await parseJsonBody(req).catch(() => ({})) || {}
    if (!projectId && body.projectId != null) {
      projectId = String(body.projectId).trim() || null
    }
    if (!projectId) {
      return badRequest(res, 'Project ID required')
    }
    const fullUrl = req.originalUrl || req.url || ''
    const queryString = (typeof fullUrl === 'string' ? fullUrl : '').split('?')[1] || ''
    const query = new URLSearchParams(queryString)
    const q = req.query || {}
    // Prefer URL-parsed query for cell keys (some proxies/loaders may not set req.query for POST)
    const qDoc = query.get('documentId')?.trim() || (q.documentId != null ? String(q.documentId).trim() : null) || null
    const qMonth = query.get('month') != null ? parseInt(String(query.get('month')), 10) : (q.month != null ? parseInt(String(q.month), 10) : null)
    const qYear = query.get('year') != null ? parseInt(String(query.get('year')), 10) : (q.year != null ? parseInt(String(q.year), 10) : null)
    const to = Array.isArray(body.to) ? body.to : (typeof body.to === 'string' ? [body.to] : [])
    const cc = Array.isArray(body.cc) ? body.cc : (typeof body.cc === 'string' ? [body.cc] : [])
    let subject = typeof body.subject === 'string' ? body.subject.trim() : ''
    const isReplyPersist = subject.trim().toLowerCase().startsWith('re:')
    let html = typeof body.html === 'string' ? body.html.trim() : ''
    let text = typeof body.text === 'string' ? body.text.trim() : undefined
    const sectionId = body.sectionId != null ? String(body.sectionId).trim() : null
    const requestNumberHint = body.requestNumber != null ? String(body.requestNumber).trim() : ''
    const requesterEmail = typeof body.requesterEmail === 'string' ? body.requesterEmail.trim() : ''
    // Cell keys: body first, then URL query (manual), then Express req.query so reply always persists
    let documentId = (body.documentId != null ? String(body.documentId).trim() : null) || qDoc || null
    let month = body.month != null ? (typeof body.month === 'number' ? body.month : parseInt(String(body.month), 10)) : (qMonth != null && !isNaN(qMonth) ? qMonth : null)
    let year = body.year != null ? (typeof body.year === 'number' ? body.year : parseInt(String(body.year), 10)) : (qYear != null && !isNaN(qYear) ? qYear : null)
    if (documentId == null && qDoc != null) documentId = qDoc
    if (month == null || isNaN(month)) month = qMonth
    if (year == null || isNaN(year)) year = qYear
    // Header fallback (proxies sometimes strip query/body for POST)
    const h = req.headers || {}
    if (documentId == null && h['x-document-id']) documentId = String(h['x-document-id']).trim()
    if ((month == null || isNaN(month)) && h['x-month'] != null) month = parseInt(String(h['x-month']), 10)
    if ((year == null || isNaN(year)) && h['x-year'] != null) year = parseInt(String(h['x-year']), 10)
    const cell = normalizeDocumentCollectionCell({ projectId, documentId, month, year })
    const hasCellContext = !!cell

    // Log when cell is missing despite having recipients (helps debug activity not persisting)
    if (!cell && body && (body.to?.length || body.subject)) {
      const bodyKeys = typeof body === 'object' ? Object.keys(body) : []
      console.warn('document-collection-send-email: cell missing — activity will not save', {
        projectId,
        documentId,
        month,
        year,
        bodyKeys,
        fromQuery: { documentId: qDoc || query.get('documentId') || q.documentId, month: qMonth ?? query.get('month') ?? q.month, year: qYear ?? query.get('year') ?? q.year },
        fromHeaders: { 'x-document-id': h['x-document-id'], 'x-month': h['x-month'], 'x-year': h['x-year'] }
      })
    }

    if (!subject) {
      return badRequest(res, 'Subject is required')
    }
    if (!html && !text) {
      return badRequest(res, 'Either html or text body is required')
    }
    const validTo = to.filter((e) => isValidEmail(e))
    if (validTo.length === 0) {
      return badRequest(res, 'At least one valid recipient email is required')
    }
    let validCc = cc.filter((e) => isValidEmail(e))

    const user = req.user || {}
    const userName = user.name || user.email || ''
    const userEmail = user.email || ''
    const requesterAddress = requesterEmail && isValidEmail(requesterEmail)
      ? requesterEmail
      : (userEmail && isValidEmail(userEmail) ? userEmail : '')
    const sentByLine = userName && userEmail
      ? `\n\n—\nSent by ${userName} (${userEmail})`
      : userEmail
        ? `\n\n—\nSent by ${userEmail}`
        : ''
    if (sentByLine) {
      if (html) html = html + sentByLine.replace(/\n/g, '<br>')
      if (text) text = text + sentByLine
    }

    // When using inbound (documents@): CC the requester so "Reply All" includes them and they don't miss replies
    const inboundEmail = process.env.DOCUMENT_REQUEST_INBOUND_EMAIL || process.env.INBOUND_EMAIL_FOR_DOCUMENT_REQUESTS || ''
    if (hasCellContext && inboundEmail && isValidEmail(inboundEmail) && requesterAddress) {
      const requesterNorm = requesterAddress.trim().toLowerCase()
      const inTo = validTo.some((e) => e.trim().toLowerCase() === requesterNorm)
      const inCc = validCc.some((e) => e.trim().toLowerCase() === requesterNorm)
      if (!inTo && !inCc) {
        validCc = [...validCc.map((e) => e.trim()), requesterAddress.trim()]
      }
    }

    const replyAllLine = '\n\nPlease use "Reply All" when responding so that both our system and the person who requested these documents receive your response.'
    if (hasCellContext && inboundEmail && isValidEmail(inboundEmail)) {
      if (html) html = html + replyAllLine.replace(/\n/g, '<br>')
      if (text) text = text + replyAllLine
    }

    let resolvedRequestNumber = null
    if (hasCellContext && cell) {
      resolvedRequestNumber =
        requestNumberHint || (await getExistingRequestNumberForCell(cell)) || generateRequestNumber(cell.year)
      if (isReplyPersist) {
        const allowed = await getAllowedRecipientSetForReply({
          projectId: cell.projectId,
          documentId: cell.documentId,
          year: cell.year,
          month: cell.month,
          requestNumber: resolvedRequestNumber
        })
        if (requesterAddress) allowed.add(requesterAddress.trim().toLowerCase())
        if (inboundEmail && isValidEmail(inboundEmail)) allowed.add(inboundEmail.trim().toLowerCase())
        if (userEmail && isValidEmail(userEmail)) allowed.add(userEmail.trim().toLowerCase())
        validTo.forEach((e) => allowed.add(e.trim().toLowerCase()))
        const beforeCc = validCc.length
        validCc = validCc.filter((e) => allowed.has(e.trim().toLowerCase()))
        if (beforeCc !== validCc.length) {
          console.warn('document-collection-send-email: reply CC trimmed to allowed set', {
            before: beforeCc,
            after: validCc.length
          })
        }
      }
      if (resolvedRequestNumber && !subject.includes(resolvedRequestNumber)) {
        subject = `${subject.trim()} [Req ${resolvedRequestNumber}]`
      }
      if (resolvedRequestNumber) {
        const refFooterText = `\n\nRequest ref: ${resolvedRequestNumber}`
        const refFooterHtml = `<p style="margin-top:12px;font-size:12px;color:#64748b;">Request ref: ${resolvedRequestNumber}</p>`
        if (text && !text.includes(resolvedRequestNumber)) text = text + refFooterText
        if (html && !html.includes(resolvedRequestNumber)) html = html + refFooterHtml
      }
    }

    const replyTo = hasCellContext && inboundEmail && isValidEmail(inboundEmail)
      ? inboundEmail
      : (requesterAddress ? requesterAddress : undefined)
    const fromName = userName ? `Abcotronics (via ${userName})` : undefined
    // Prefer a verified From domain to avoid recipient policy rejections (Mimecast, etc.)
    const defaultFrom = process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || ''
    const defaultFromEmail = defaultFrom && defaultFrom.includes('<')
      ? (defaultFrom.match(/<(.+)>/)?.[1] || defaultFrom).trim()
      : String(defaultFrom || '').trim()
    const inboundDomain = inboundEmail && inboundEmail.includes('@') ? inboundEmail.split('@')[1].trim().toLowerCase() : ''
    const defaultFromDomain = defaultFromEmail && defaultFromEmail.includes('@') ? defaultFromEmail.split('@')[1].trim().toLowerCase() : ''
    let fromAddress
    if (inboundEmail && isValidEmail(inboundEmail) && inboundDomain && defaultFromDomain && inboundDomain === defaultFromDomain) {
      // Domains align; safe to send from inbound address
      fromAddress = inboundEmail
    } else if (defaultFromEmail && isValidEmail(defaultFromEmail)) {
      // Use verified From to satisfy SPF/DKIM/DMARC alignment
      fromAddress = defaultFromEmail
      if (inboundEmail && isValidEmail(inboundEmail) && inboundDomain && defaultFromDomain && inboundDomain !== defaultFromDomain) {
        console.warn('document-collection-send-email: inbound domain differs from EMAIL_FROM; using EMAIL_FROM for From to avoid policy rejection', {
          inboundDomain,
          defaultFromDomain
        })
      }
    } else if (inboundEmail && isValidEmail(inboundEmail)) {
      fromAddress = inboundEmail
    }

    const sent = []
    const failed = []
    // For reply routing: use custom Message-ID when inbound is set so reply In-Reply-To can be matched
    let messageIdForReply = null
    if (hasCellContext) {
      const domain = inboundEmail && inboundEmail.includes('@') ? inboundEmail.split('@')[1] : 'local'
      messageIdForReply = `docreq-${crypto.randomUUID()}@${domain}`
    }

    let providerMessageId = null
    let trackingId = null
    try {
      if (hasCellContext && html) {
        const protoHeader = req.headers?.['x-forwarded-proto'] || req.protocol || 'https'
        const hostHeader = req.headers?.['x-forwarded-host'] || req.headers?.host
        const proto = String(protoHeader || 'https').split(',')[0].trim()
        const host = String(hostHeader || '').split(',')[0].trim()
        if (host) {
          trackingId = crypto.randomUUID()
          const pixelUrl = `${proto}://${host}/api/projects/${projectId}/document-collection-email-open?trackingId=${encodeURIComponent(trackingId)}`
          html = `${html}<img src="${pixelUrl}" alt="" width="1" height="1" style="display:block;width:1px;height:1px;opacity:0;" />`
        }
      }
      const archiveBcc = process.env.DOCUMENT_COLLECTION_ARCHIVE_BCC
      const bccList =
        archiveBcc && isValidEmail(archiveBcc.trim())
          ? [archiveBcc.trim()]
          : undefined
      const docHeaders = {}
      if (messageIdForReply) {
        docHeaders['Message-ID'] = messageIdForReply.startsWith('<') ? messageIdForReply : `<${messageIdForReply}>`
      }
      if (resolvedRequestNumber) {
        docHeaders['X-Abcotronics-Doc-Req'] = resolvedRequestNumber
      }
      const result = await sendEmail({
        to: validTo.map((e) => e.trim()),
        cc: validCc.length > 0 ? [...new Set(validCc.map((e) => e.trim()))] : undefined,
        ...(bccList ? { bcc: bccList } : {}),
        subject,
        html: html || undefined,
        text: text || undefined,
        replyTo,
        fromName,
        ...(fromAddress && { from: fromAddress }),
        ...(Object.keys(docHeaders).length > 0 ? { headers: docHeaders } : {})
      })
      providerMessageId = result?.messageId || null
      validTo.forEach((e) => sent.push(e.trim()))
      validCc.forEach((e) => sent.push(e.trim()))
    } catch (err) {
      validTo.forEach((e) => failed.push({ email: e.trim(), error: err.message || 'Send failed' }))
      validCc.forEach((e) => failed.push({ email: e.trim(), error: err.message || 'Send failed' }))
    }

    // Persist: DocumentCollectionEmailLog for all successful sends (requests and replies)
    let activityPersisted = false
    let logId = null
    let warning = null
    let savedCellInfo = null
    const bodyForStorage = typeof text === 'string' && text.trim()
      ? text.trim().slice(0, 50000)
      : typeof html === 'string' && html
        ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50000)
        : ''
    const commentText = `Subject: ${(subject || '').slice(0, 500)}\n\n${bodyForStorage}`
    const toEmailsJson = JSON.stringify(validTo.map((e) => e.trim()))
    const ccEmailsJson = JSON.stringify(validCc.map((e) => e.trim()))
    if (sent.length > 0 && cell) {
      const logData = {
        projectId: cell.projectId,
        documentId: cell.documentId,
        year: cell.year,
        month: cell.month,
        kind: 'sent',
        ...(sectionId ? { sectionId } : {}),
        ...(subject ? { subject: subject.slice(0, 1000) } : {}),
        ...(bodyForStorage ? { bodyText: bodyForStorage } : {}),
        ...(providerMessageId ? { messageId: providerMessageId } : {}),
        ...(trackingId ? { trackingId } : {}),
        ...(resolvedRequestNumber ? { requestNumber: resolvedRequestNumber } : {}),
        toEmails: toEmailsJson,
        ccEmails: ccEmailsJson
      }
      const minimalLogData = {
        projectId: cell.projectId,
        documentId: cell.documentId,
        year: cell.year,
        month: cell.month,
        kind: 'sent'
      }
      try {
        const log = await prisma.documentCollectionEmailLog.create({ data: logData })
        activityPersisted = true
        logId = log.id
        savedCellInfo = { documentId: cell.documentId, month: cell.month, year: cell.year }
        console.log('document-collection-send-email: activity log created', { logId: log.id, projectId: cell.projectId, documentId: cell.documentId, month: cell.month, year: cell.year })
      } catch (logErr) {
        const msg = String(logErr?.message || '')
        const isSchemaMismatch =
          msg.includes('Unknown field') ||
          msg.toLowerCase().includes('unknown column') ||
          msg.toLowerCase().includes('does not exist')
        if (isSchemaMismatch) {
          try {
            const log = await prisma.documentCollectionEmailLog.create({ data: minimalLogData })
            activityPersisted = true
            logId = log.id
            savedCellInfo = { documentId: cell.documentId, month: cell.month, year: cell.year }
            console.log('document-collection-send-email: activity log created (minimal)', { logId: log.id, projectId: cell.projectId, documentId: cell.documentId, month: cell.month, year: cell.year })
          } catch (retryErr) {
            console.error('document-collection-send-email: log create failed (minimal):', retryErr.message, { projectId: cell.projectId, documentId: cell.documentId })
          }
        } else {
          console.error('document-collection-send-email: log create failed:', logErr.message, { projectId: cell.projectId, documentId: cell.documentId })
        }
      }
      if (!activityPersisted) {
        try {
          await prisma.documentItemComment.create({
            data: {
              itemId: cell.documentId,
              year: cell.year,
              month: cell.month,
              text: commentText,
              author: isReplyPersist ? 'Sent reply (platform)' : 'Sent request (platform)'
            }
          })
          activityPersisted = true
          savedCellInfo = { documentId: cell.documentId, month: cell.month, year: cell.year }
          console.log('document-collection-send-email: activity fallback saved as comment', { documentId: cell.documentId, month: cell.month, year: cell.year })
        } catch (commentErr) {
          console.error('document-collection-send-email: fallback comment create failed:', commentErr.message, { documentId: cell.documentId, month: cell.month, year: cell.year })
        }
      }

      if (messageIdForReply) {
        try {
          await prisma.documentRequestEmailSent.create({
            data: {
              messageId: messageIdForReply,
              projectId: cell.projectId,
              ...(sectionId ? { sectionId } : {}),
              documentId: cell.documentId,
              year: cell.year,
              month: cell.month,
              ...(requesterAddress ? { requesterEmail: requesterAddress.trim() } : {}),
              ...(resolvedRequestNumber ? { requestNumber: resolvedRequestNumber } : {}),
              toEmails: toEmailsJson,
              ccEmails: ccEmailsJson
            }
          })
        } catch (dbErr) {
          console.warn('document-collection-send-email: reply routing record failed (non-blocking):', dbErr.message)
        }
      }
    } else if (sent.length > 0 && !cell) {
      let fallbackCell = null
      const monthNum = month != null && !isNaN(Number(month)) ? Number(month) : null
      const yearNum = year != null && !isNaN(Number(year)) ? Number(year) : null
      if (projectId && documentId && monthNum && yearNum) {
        fallbackCell = { projectId: String(projectId).trim(), documentId: String(documentId).trim(), month: monthNum, year: yearNum }
      }
      if (!fallbackCell && projectId && subject) {
        const parsed = parseDocAndPeriodFromSubject(subject)
        if (parsed.month && parsed.year) {
          try {
            let docs = await prisma.documentItem.findMany({
              where: {
                name: { equals: parsed.docName || '', mode: 'insensitive' },
                section: { projectId: String(projectId).trim() }
              },
              select: { id: true }
            })
            if (docs.length === 0 && parsed.docName) {
              docs = await prisma.documentItem.findMany({
                where: {
                  name: { contains: parsed.docName, mode: 'insensitive' },
                  section: { projectId: String(projectId).trim() }
                },
                select: { id: true }
              })
            }
            if (docs.length > 0) {
              fallbackCell = {
                projectId: String(projectId).trim(),
                documentId: String(docs[0].id),
                month: parsed.month,
                year: parsed.year
              }
              // Prefer request month/year when present so we persist to the year the user is viewing (not just subject)
              if (monthNum != null && yearNum != null) {
                fallbackCell = { ...fallbackCell, month: monthNum, year: yearNum }
              }
            } else if (parsed.docName || (monthNum ?? parsed.month) || (yearNum ?? parsed.year)) {
              // Last resort: no doc matched by name but we have period — use first document in project so activity still shows
              const firstDoc = await prisma.documentItem.findFirst({
                where: { section: { projectId: String(projectId).trim() } },
                select: { id: true },
                orderBy: { id: 'asc' }
              }).catch(() => null)
              if (firstDoc) {
                const m = monthNum ?? parsed.month
                const y = yearNum ?? parsed.year
                if (m >= 1 && m <= 12 && y) {
                  fallbackCell = {
                    projectId: String(projectId).trim(),
                    documentId: String(firstDoc.id),
                    month: m,
                    year: y
                  }
                }
              }
            }
          } catch (lookupErr) {
            console.warn('document-collection-send-email: fallback doc lookup failed', lookupErr.message)
          }
        }
      }
      if (fallbackCell) {
        try {
          const log = await prisma.documentCollectionEmailLog.create({
            data: {
              projectId: fallbackCell.projectId,
              documentId: fallbackCell.documentId,
              year: fallbackCell.year,
              month: fallbackCell.month,
              kind: 'sent',
              ...(subject ? { subject: subject.slice(0, 1000) } : {}),
              ...(bodyForStorage ? { bodyText: bodyForStorage } : {})
            }
          })
          activityPersisted = true
          logId = log.id
          savedCellInfo = { documentId: fallbackCell.documentId, month: fallbackCell.month, year: fallbackCell.year }
          warning = 'Email sent, but activity context was reconstructed. Please verify the activity list.'
          console.log('document-collection-send-email: activity log created via fallback', { logId: log.id, projectId: fallbackCell.projectId, documentId: fallbackCell.documentId, month: fallbackCell.month, year: fallbackCell.year })
        } catch (fallbackLogErr) {
          try {
            await prisma.documentItemComment.create({
              data: {
                itemId: fallbackCell.documentId,
                year: fallbackCell.year,
                month: fallbackCell.month,
                text: commentText,
                author: 'Sent request (platform)'
              }
            })
            activityPersisted = true
            savedCellInfo = { documentId: fallbackCell.documentId, month: fallbackCell.month, year: fallbackCell.year }
            warning = 'Email sent, activity saved as comment fallback.'
            console.log('document-collection-send-email: activity fallback comment saved via fallback cell', { documentId: fallbackCell.documentId, month: fallbackCell.month, year: fallbackCell.year })
          } catch (fallbackCommentErr) {
            console.error('document-collection-send-email: fallback comment create failed:', fallbackCommentErr.message, { projectId, documentId })
          }
        }
      } else {
        warning = 'Email sent but activity could not be saved (missing document/month/year).'
        console.warn('document-collection-send-email: missing cell for activity persistence', { projectId, documentId, month, year })
      }
    } else {
      if (sent.length === 0) {
        console.log('document-collection-send-email: skipping activity log (no successful sends)', { hasCell: !!cell, projectId, documentId: body.documentId ?? qDoc ?? q.documentId, month: body.month ?? qMonth ?? q.month, year: body.year ?? qYear ?? q.year })
      } else if (!cell) {
        console.warn('document-collection-send-email: skipping activity log (no cell) — activity will not persist after refresh', {
          projectId,
          fromBody: { documentId: body.documentId, month: body.month, year: body.year },
          fromQuery: { documentId: qDoc || query.get('documentId') || q.documentId, month: qMonth ?? query.get('month') ?? q.month, year: qYear ?? query.get('year') ?? q.year },
          fromHeaders: { 'x-document-id': h['x-document-id'], 'x-month': h['x-month'], 'x-year': h['x-year'] },
          expressQuery: q,
          parsed: { documentId, month, year }
        })
      }
    }

    return ok(res, {
      sent,
      failed,
      activityPersisted,
      logId: logId || undefined,
      messageId: messageIdForReply || undefined,
      ...(savedCellInfo ? { savedCell: savedCellInfo } : {}),
      ...(warning ? { warning } : {})
    })
  } catch (e) {
    console.error('POST /api/projects/:id/document-collection-send-email error:', e)
    return serverError(res, e.message || 'Failed to send document request emails')
  }
}

export default authRequired(handler)
