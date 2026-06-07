/**
 * GET /api/quickbooks/oauth-callback — Intuit redirects here (no Bearer auth).
 */
import { prisma } from '../_lib/prisma.js'
import { verifyQuickBooksOAuthState } from '../_lib/jwt.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { getUserForReceiptCapture, isReceiptCaptureAdmin } from '../_lib/receiptCaptureAccess.js'
import {
  exchangeQuickBooksAuthCode,
  fetchQboCompanyInfo,
  getQuickBooksRedirectUri,
  isQuickBooksConfigured,
  saveQuickBooksConnection
} from '../_lib/quickbooksOnline.js'
import { logAuditFromRequest } from '../_lib/manufacturingAuditLog.js'

function htmlResponse(res, ok, message) {
  const type = ok ? 'QBO_OAUTH_OK' : 'QBO_OAUTH_ERR'
  const body = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>QuickBooks</title></head><body>
<p style="font-family:system-ui;padding:1rem">${message}</p>
<script>
(function(){
  var payload = { type: '${type}', message: ${JSON.stringify(message || '')} };
  try {
    if (window.opener && window.opener.postMessage) {
      window.opener.postMessage(payload, window.location.origin);
    }
  } catch (e) {}
  setTimeout(function(){ window.close(); }, 800);
})();
</script>
</body></html>`
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.status(200).send(body)
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return htmlResponse(res, false, 'Invalid method')
  }

  const url = new URL(req.url, `http://${req.headers.host}`)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const realmId = url.searchParams.get('realmId') || ''
  const err = url.searchParams.get('error')

  if (err) {
    return htmlResponse(res, false, `QuickBooks OAuth error: ${err}`)
  }
  if (!code || !state || !realmId) {
    return htmlResponse(res, false, 'Missing code, state, or realmId')
  }
  if (!isQuickBooksConfigured()) {
    return htmlResponse(res, false, 'QuickBooks OAuth is not configured on the server.')
  }

  const payload = verifyQuickBooksOAuthState(state)
  if (!payload?.sub) {
    return htmlResponse(res, false, 'Invalid or expired OAuth state')
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, permissions: true }
  })
  if (!user || !isReceiptCaptureAdmin(user)) {
    return htmlResponse(res, false, 'Only administrators can connect QuickBooks.')
  }

  try {
    const redirectUri = getQuickBooksRedirectUri(req)
    const tokens = await exchangeQuickBooksAuthCode(code, redirectUri)

    let companyName = ''
    try {
      const info = await fetchQboCompanyInfo(tokens.access_token, realmId)
      companyName = info?.CompanyName || info?.LegalName || ''
    } catch (_) {
      /* optional */
    }

    await saveQuickBooksConnection({
      realmId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      companyName,
      connectedByUserId: user.id
    })

    void logAuditFromRequest(prisma, { user: { sub: user.id, role: user.role } }, {
      action: 'connect',
      entity: 'quickbooks',
      entityId: realmId,
      details: { resource: 'receipt_capture', companyName }
    })

    return htmlResponse(res, true, `QuickBooks connected${companyName ? ` (${companyName})` : ''}. You can close this window.`)
  } catch (e) {
    console.error('quickbooks oauth-callback:', e)
    return htmlResponse(res, false, e.message || 'Failed to connect QuickBooks')
  }
}

export default withHttp(withLogging(handler))
