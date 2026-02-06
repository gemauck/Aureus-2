/**
 * GET /api/inbound/document-request-reply-debug?secret=CRON_SECRET
 * Diagnostic: list recent DocumentRequestEmailSent and DocumentItemComment
 * so you can verify webhook is creating comments and messageIds are stored.
 */
import { prisma } from '../_lib/prisma.js'
import { ok, badRequest } from '../_lib/response.js'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).setHeader('Allow', 'GET').json({ error: 'Method not allowed' })
  }
  const secret = process.env.CRON_SECRET || process.env.RESEND_WEBHOOK_SECRET
  const provided = (req.query && req.query.secret) || (req.headers && req.headers['x-cron-secret'])
  if (secret && provided !== secret) {
    return badRequest(res, 'Invalid or missing secret')
  }

  try {
    const [recentSent, recentComments] = await Promise.all([
      prisma.documentRequestEmailSent.findMany({
        take: 15,
        orderBy: { createdAt: 'desc' },
        select: {
          messageId: true,
          projectId: true,
          documentId: true,
          year: true,
          month: true,
          createdAt: true
        }
      }),
      prisma.documentItemComment.findMany({
        take: 25,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          itemId: true,
          year: true,
          month: true,
          author: true,
          text: true,
          createdAt: true
        }
      })
    ])

    const stats = global.__docReqReplyStats || null
    return ok(res, {
      hint: 'If recentComments is empty after replying, webhook may not be called or In-Reply-To/thread match failed. Check pm2 logs for document-request-reply.',
      stats,
      recentSent: recentSent.map((r) => ({
        ...r,
        messageIdPreview: r.messageId.slice(0, 50) + (r.messageId.length > 50 ? '...' : '')
      })),
      recentComments: recentComments.map((c) => ({
        ...c,
        textPreview: (c.text || '').slice(0, 80) + ((c.text || '').length > 80 ? '...' : ''),
        monthKey: `${c.year}-${String(c.month).padStart(2, '0')}`
      }))
    })
  } catch (e) {
    console.error('document-request-reply-debug error:', e)
    return res.status(500).json({ error: e.message || 'Failed' })
  }
}

export default handler
