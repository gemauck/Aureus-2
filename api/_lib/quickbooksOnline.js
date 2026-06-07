/**
 * QuickBooks Online OAuth + API helpers for receipt capture expense push.
 * Env: INTUIT_CLIENT_ID, INTUIT_CLIENT_SECRET, INTUIT_REDIRECT_URI (optional),
 *      INTUIT_ENV=sandbox|production (default production)
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { prisma } from './prisma.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')

const CONNECTION_ID = 'default'
const QBO_SCOPE = 'com.intuit.quickbooks.accounting'
const MINOR_VERSION = 65

function isSandbox() {
  return String(process.env.INTUIT_ENV || '').trim().toLowerCase() === 'sandbox'
}

export function getIntuitCredentials() {
  const clientId = (process.env.INTUIT_CLIENT_ID || '').trim()
  const clientSecret = (process.env.INTUIT_CLIENT_SECRET || '').trim()
  return { clientId, clientSecret }
}

export function isQuickBooksConfigured() {
  const { clientId, clientSecret } = getIntuitCredentials()
  return Boolean(clientId && clientSecret)
}

export function getQuickBooksRedirectUri(req) {
  const fromEnv = process.env.INTUIT_REDIRECT_URI
  if (fromEnv) return String(fromEnv).trim().replace(/\/$/, '')
  const host = req?.headers?.host
  if (!host) return 'http://localhost:3000/api/quickbooks/oauth-callback'
  const proto = host.includes('localhost') ? 'http' : 'https'
  return `${proto}://${host}/api/quickbooks/oauth-callback`
}

export function getStaticQuickBooksRedirectUri() {
  const fromEnv = process.env.INTUIT_REDIRECT_URI
  if (fromEnv) return String(fromEnv).trim().replace(/\/$/, '')
  return 'http://localhost:3000/api/quickbooks/oauth-callback'
}

export function buildQuickBooksAuthUrl(req, state) {
  const { clientId } = getIntuitCredentials()
  const redirectUri = getQuickBooksRedirectUri(req)
  const params = new URLSearchParams({
    client_id: clientId,
    scope: QBO_SCOPE,
    redirect_uri: redirectUri,
    response_type: 'code',
    state
  })
  return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`
}

function qboApiBase() {
  return isSandbox()
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com'
}

function tokenEndpoint() {
  return 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
}

async function exchangeToken(bodyParams) {
  const { clientId, clientSecret } = getIntuitCredentials()
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(tokenEndpoint(), {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: new URLSearchParams(bodyParams).toString()
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = json?.error_description || json?.error || json?.Fault?.Error?.[0]?.Message || 'Token exchange failed'
    throw new Error(msg)
  }
  return json
}

export async function exchangeQuickBooksAuthCode(code, redirectUri) {
  return exchangeToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri
  })
}

async function refreshQuickBooksTokens(refreshToken) {
  return exchangeToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  })
}

export async function getQuickBooksConnection() {
  return prisma.quickBooksConnection.findUnique({ where: { id: CONNECTION_ID } })
}

export async function saveQuickBooksConnection({
  realmId,
  accessToken,
  refreshToken,
  expiresIn,
  companyName,
  connectedByUserId
}) {
  const accessTokenExpiresAt = expiresIn
    ? new Date(Date.now() + Number(expiresIn) * 1000)
    : new Date(Date.now() + 3600 * 1000)
  return prisma.quickBooksConnection.upsert({
    where: { id: CONNECTION_ID },
    create: {
      id: CONNECTION_ID,
      realmId: realmId || '',
      accessToken: accessToken || '',
      refreshToken: refreshToken || '',
      accessTokenExpiresAt,
      companyName: companyName || '',
      connectedByUserId: connectedByUserId || null
    },
    update: {
      realmId: realmId || undefined,
      accessToken: accessToken || undefined,
      ...(refreshToken ? { refreshToken } : {}),
      accessTokenExpiresAt,
      companyName: companyName || undefined,
      connectedByUserId: connectedByUserId || undefined
    }
  })
}

export async function disconnectQuickBooks() {
  await prisma.quickBooksConnection.deleteMany({ where: { id: CONNECTION_ID } })
}

/** Returns connection with a valid access token (refreshes if needed). */
export async function getQuickBooksClient() {
  const conn = await getQuickBooksConnection()
  if (!conn?.realmId || !conn.refreshToken) return null

  let accessToken = conn.accessToken
  const expiresAt = conn.accessTokenExpiresAt ? new Date(conn.accessTokenExpiresAt).getTime() : 0
  const needsRefresh = !accessToken || Date.now() > expiresAt - 60_000

  if (needsRefresh) {
    const tokens = await refreshQuickBooksTokens(conn.refreshToken)
    accessToken = tokens.access_token
    await prisma.quickBooksConnection.update({
      where: { id: CONNECTION_ID },
      data: {
        accessToken: tokens.access_token,
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        accessTokenExpiresAt: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000)
      }
    })
  }

  return { conn, accessToken, realmId: conn.realmId }
}

function parseQboError(json, status) {
  const fault = json?.Fault?.Error?.[0]
  if (fault) {
    return `${fault.Message || 'QBO error'}${fault.Detail ? ` — ${fault.Detail}` : ''}`
  }
  return json?.message || `QuickBooks API error (${status})`
}

export async function qboRequest(accessToken, realmId, method, path, body) {
  const base = `${qboApiBase()}/v3/company/${realmId}${path}`
  const sep = path.includes('?') ? '&' : '?'
  const url = `${base}${sep}minorversion=${MINOR_VERSION}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  let json = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = { raw: text }
  }
  if (!res.ok) {
    throw new Error(parseQboError(json, res.status))
  }
  return json
}

export async function qboQuery(accessToken, realmId, sql) {
  const encoded = encodeURIComponent(sql)
  const json = await qboRequest(accessToken, realmId, 'GET', `/query?query=${encoded}`)
  const key = Object.keys(json?.QueryResponse || {}).find((k) => k !== 'maxResults' && k !== 'startPosition')
  const rows = key ? json.QueryResponse[key] : []
  return Array.isArray(rows) ? rows : rows ? [rows] : []
}

export async function fetchQboCompanyInfo(accessToken, realmId) {
  const json = await qboRequest(accessToken, realmId, 'GET', '/companyinfo/1')
  return json?.CompanyInfo || null
}

export async function fetchQboExpenseAccounts(accessToken, realmId) {
  return qboQuery(
    accessToken,
    realmId,
    "SELECT Id, Name, AccountType, AcctNum, Active FROM Account WHERE Active = true AND AccountType IN ('Expense', 'Other Expense', 'Cost of Goods Sold') MAXRESULTS 1000"
  )
}

export async function fetchQboPaymentAccounts(accessToken, realmId) {
  return qboQuery(
    accessToken,
    realmId,
    "SELECT Id, Name, AccountType, AcctNum, Active FROM Account WHERE Active = true AND AccountType IN ('Bank', 'Credit Card') MAXRESULTS 200"
  )
}

export async function fetchQboClasses(accessToken, realmId) {
  return qboQuery(accessToken, realmId, 'SELECT Id, Name, Active FROM Class WHERE Active = true MAXRESULTS 500')
}

function resolveUploadPath(publicPath) {
  if (!publicPath?.startsWith('/uploads/')) return null
  const rel = publicPath.replace(/^\/uploads\//, '').split('?')[0]
  const segments = rel.split('/').filter(Boolean)
  if (segments.includes('..')) return null
  const full = path.join(rootDir, 'uploads', ...segments)
  const resolved = path.resolve(full)
  if (!resolved.startsWith(path.resolve(rootDir, 'uploads') + path.sep)) return null
  return fs.existsSync(resolved) ? resolved : null
}

async function attachReceiptFile(accessToken, realmId, purchaseId, fileUrl) {
  const filePath = resolveUploadPath(fileUrl)
  if (!filePath) return null

  const fileName = path.basename(filePath)
  const ext = path.extname(filePath).toLowerCase()
  const contentType =
    ext === '.pdf'
      ? 'application/pdf'
      : ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/jpeg'
  const fileBuf = fs.readFileSync(filePath)
  const boundary = `----qbo${Date.now()}`
  const meta = JSON.stringify({
    AttachableRef: [{ EntityRef: { type: 'Purchase', value: String(purchaseId) } }],
    FileName: fileName,
    ContentType: contentType
  })

  const preamble =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file_metadata_01"\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${meta}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file_content_01"; filename="${fileName}"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`
  const closing = `\r\n--${boundary}--\r\n`
  const body = Buffer.concat([Buffer.from(preamble, 'utf8'), fileBuf, Buffer.from(closing, 'utf8')])

  const url = `${qboApiBase()}/v3/company/${realmId}/upload?minorversion=${MINOR_VERSION}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(errText || `Attachable upload failed (${res.status})`)
  }
  return res.json().catch(() => ({}))
}

export function buildPurchasePayload(doc, account, costCenter, paymentAccountId) {
  const amount = Number(doc.total) || 0
  if (amount <= 0) {
    throw new Error('Expense total must be greater than zero')
  }
  if (!account?.qboAccountId) {
    throw new Error(`Account "${account?.name || 'unknown'}" is not mapped to QuickBooks`)
  }
  if (!paymentAccountId) {
    throw new Error('Default QuickBooks payment account is not configured')
  }

  const txnDate = (doc.documentDate || '').slice(0, 10) || new Date().toISOString().slice(0, 10)
  const lineDetail = {
    AccountRef: { value: String(account.qboAccountId) }
  }
  if (costCenter?.qboClassId) {
    lineDetail.ClassRef = { value: String(costCenter.qboClassId) }
  }

  const noteParts = [doc.notes, doc.vendor ? `Vendor: ${doc.vendor}` : ''].filter(Boolean)

  return {
    PaymentType: 'Cash',
    AccountRef: { value: String(paymentAccountId) },
    TxnDate: txnDate,
    PrivateNote: noteParts.join(' · ').slice(0, 4000),
    Line: [
      {
        Amount: amount,
        Description: (doc.vendor || 'Expense').slice(0, 4000),
        DetailType: 'AccountBasedExpenseLineDetail',
        AccountBasedExpenseLineDetail: lineDetail
      }
    ]
  }
}

export async function pushReceiptDocumentToQbo(doc, { force = false } = {}) {
  if (doc.qboPurchaseId && !force) {
    return { skipped: true, qboPurchaseId: doc.qboPurchaseId, reason: 'already_synced' }
  }

  const client = await getQuickBooksClient()
  if (!client) {
    throw new Error('QuickBooks is not connected')
  }

  const { accessToken, realmId, conn } = client
  const account = doc.account
  const costCenter = doc.costCenter
  const paymentAccountId = conn.defaultPaymentAccountId

  const payload = buildPurchasePayload(doc, account, costCenter, paymentAccountId)
  const created = await qboRequest(accessToken, realmId, 'POST', '/purchase', payload)
  const purchase = created?.Purchase
  const purchaseId = purchase?.Id
  if (!purchaseId) {
    throw new Error('QuickBooks did not return a Purchase Id')
  }

  let attachWarning = ''
  try {
    await attachReceiptFile(accessToken, realmId, purchaseId, doc.fileUrl)
  } catch (e) {
    attachWarning = e?.message || 'Attachment upload failed'
    console.warn('QBO attachable:', attachWarning)
  }

  await prisma.receiptDocument.update({
    where: { id: doc.id },
    data: {
      qboPurchaseId: String(purchaseId),
      qboSyncedAt: new Date(),
      qboSyncError: attachWarning,
      status: 'exported'
    }
  })

  return {
    qboPurchaseId: String(purchaseId),
    attachWarning: attachWarning || undefined,
    purchase
  }
}

export function serializeQuickBooksConnection(conn) {
  if (!conn) {
    return { connected: false, realmId: null, companyName: null, defaultPaymentAccountId: null }
  }
  return {
    connected: Boolean(conn.realmId && conn.refreshToken),
    realmId: conn.realmId || null,
    companyName: conn.companyName || null,
    defaultPaymentAccountId: conn.defaultPaymentAccountId || null,
    connectedAt: conn.createdAt,
    updatedAt: conn.updatedAt,
    environment: isSandbox() ? 'sandbox' : 'production'
  }
}
