// SARS Website Monitoring API
// Checks for changes on the SARS website (public notices, legislation, news) and stores them in the database
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { sendSarsSummaryEmail } from './sendSummaryEmail.js'
import { tryAcquireSarsDailyLease } from './dailyLease.js'
import { getSarsSections } from './sarsSections.js'
import { extractAnnouncements } from './parseSarsHtml.js'

// Function to fetch and parse SARS website content
async function fetchSarsPage(url) {
  try {
    // Create AbortController for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-ZA,en;q=0.9'
      },
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const html = await response.text()
    return html
  } catch (error) {
    console.error(`Error fetching ${url}:`, error.message)
    throw error
  }
}

// Function to calculate content hash for change detection
function calculateHash(content) {
  // Simple hash function - in production, use crypto.createHash
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return hash.toString()
}

// Main function to check SARS website for changes (all key sections)
/** @param {{ dailyLease?: boolean }} [opts] — dailyLease: server cron only; skips if another host already ran today */
async function checkSarsWebsite(opts = {}) {
  const results = {
    checked: [],
    newChanges: [],
    errors: []
  }

  if (opts.dailyLease) {
    const { acquired } = await tryAcquireSarsDailyLease()
    if (!acquired) {
      console.log('SARS monitoring: daily lease already taken — skipping (one automated run per day at 7:00 AM)')
      results.skippedDuplicateSchedule = true
      return results
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const crawlAll = opts.crawlAll === true
  const delayMs = Number.isFinite(Number(opts.delayMs))
    ? Number(opts.delayMs)
    : (crawlAll ? 120 : 1500)
  const sections = await getSarsSections({
    crawlAll,
    maxPages: opts.maxPages || 600
  })

  for (const section of sections) {
    try {
      await new Promise((r) => setTimeout(r, delayMs))
      const html = await fetchSarsPage(section.url)
      const announcements = extractAnnouncements(html, section.url)
      results.checked.push({ url: section.url, found: announcements.length })

      for (const announcement of announcements) {
        try {
          const existing = await prisma.sarsWebsiteChange.findFirst({
            where: {
              url: announcement.url,
              title: announcement.title
            }
          })

          if (!existing) {
            const titleLower = (announcement.title || '').toLowerCase()
            const descLower = (announcement.description || '').toLowerCase()

            let priority = 'Normal'
            if (titleLower.includes('urgent') || titleLower.includes('critical') || titleLower.includes('immediate')) {
              priority = 'Critical'
            } else if (titleLower.includes('important') || titleLower.includes('deadline')) {
              priority = 'High'
            } else if (titleLower.includes('update') || titleLower.includes('change')) {
              priority = 'Medium'
            }

            let category = 'General'
            if (titleLower.includes('vat') || descLower.includes('vat')) category = 'VAT'
            else if (titleLower.includes('tax') || descLower.includes('tax')) category = 'Tax'
            else if (titleLower.includes('compliance') || descLower.includes('compliance')) category = 'Compliance'
            else if (
              section.label === 'Public Notices' ||
              section.label === 'Secondary Legislation' ||
              section.label.startsWith('Tariff Amendments')
            )
              category = 'Compliance'

            const publishedDate = new Date(announcement.publishedAt)
            const isNew = publishedDate >= today

            const change = await prisma.sarsWebsiteChange.create({
              data: {
                url: announcement.url,
                pageTitle: announcement.pageTitle,
                changeType: 'new',
                title: announcement.title,
                description: announcement.description,
                publishedAt: publishedDate,
                isNew,
                isRead: false,
                priority,
                category,
                metadata: JSON.stringify({
                  sourceUrl: section.url,
                  sourceLabel: section.label,
                  checkedAt: new Date().toISOString()
                })
              }
            })

            results.newChanges.push({
              id: change.id,
              title: change.title,
              url: change.url,
              priority: change.priority,
              category: change.category,
              publishedAt: change.publishedAt
            })
          }
        } catch (err) {
          console.error(`Error processing item: ${announcement.title}`, err)
          results.errors.push({ title: announcement.title, error: err.message })
        }
      }
    } catch (error) {
      console.error(`Error fetching ${section.url}:`, error.message)
      results.errors.push({ url: section.url, error: error.message })
    }
  }

  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  await prisma.sarsWebsiteChange.updateMany({
    where: { publishedAt: { lt: yesterday }, isNew: true },
    data: { isNew: false }
  })

  if (results.newChanges.length > 0) {
    sendSarsSummaryEmail(results.newChanges, { skipFirstRun: true }).catch((e) =>
      console.error('SARS summary email failed:', e.message)
    )
  }

  try {
    await prisma.sarsMonitoringRun.create({
      data: {
        success: results.errors.length === 0,
        newCount: results.newChanges.length,
        errorMessage: results.errors.length > 0 ? results.errors.map((e) => e.error).join('; ').slice(0, 500) : null
      }
    })
  } catch (_) {
    // Table may not exist yet (migration not run)
  }

  return results
}

/** Run full SARS check (for in-app cron). Exported so server.js can schedule it. */
export async function runSarsMonitoringCheck() {
  const envCrawlAll =
    process.env.SARS_MONITORING_CRAWL_ALL === 'true' || process.env.SARS_MONITORING_CRAWL_ALL === '1'
  const envMaxPages = Number(process.env.SARS_MONITORING_CRAWL_MAX_PAGES || 600)
  return checkSarsWebsite({ dailyLease: true, crawlAll: envCrawlAll, maxPages: envMaxPages })
}

// API Handler
async function handler(req, res) {
  try {
    const { action = 'check' } = req.query

    if (action === 'check') {
      const crawlAll = req.query.crawlAll === 'true' || req.query.crawlAll === '1'
      const maxPages = Math.min(Math.max(parseInt(req.query.maxPages, 10) || 600, 50), 5000)
      const delayMs = Math.min(Math.max(parseInt(req.query.delayMs, 10) || 120, 20), 5000)
      let results
      try {
        results = await checkSarsWebsite({ dailyLease: false, crawlAll, maxPages, delayMs })
      } catch (err) {
        console.error('SARS monitoring check error:', err.message)
        return ok(res, {
          success: true,
          message: 'SARS check temporarily unavailable (database may not be ready).',
          results: { checked: 0, newChanges: 0, errors: 1, changes: [] },
          lastRun: null
        })
      }
      let lastRun = null
      try {
        lastRun = await prisma.sarsMonitoringRun.findFirst({
          orderBy: { ranAt: 'desc' },
          take: 1
        })
      } catch (_) {}
      return ok(res, {
        success: true,
        message: 'SARS website check completed',
        results: {
          checked: results.checked.length,
          newChanges: results.newChanges.length,
          errors: results.errors.length,
          changes: results.newChanges
        },
        lastRun: lastRun ? { ranAt: lastRun.ranAt, success: lastRun.success, newCount: lastRun.newCount, errorMessage: lastRun.errorMessage } : null
      })
    } else if (action === 'last-run') {
      let lastRun = null
      try {
        lastRun = await prisma.sarsMonitoringRun.findFirst({
          orderBy: { ranAt: 'desc' },
          take: 1
        })
      } catch (_) {}
      return ok(res, {
        success: true,
        data: lastRun ? { ranAt: lastRun.ranAt, success: lastRun.success, newCount: lastRun.newCount, errorMessage: lastRun.errorMessage } : null
      })
    } else if (action === 'list') {
      const { limit = 50, isNew, isRead, category, priority } = req.query
      const where = {}
      if (isNew !== undefined) where.isNew = isNew === 'true'
      if (isRead !== undefined) where.isRead = isRead === 'true'
      if (category) where.category = category
      if (priority) where.priority = priority
      const take = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)
      try {
        const changes = await prisma.sarsWebsiteChange.findMany({
          where,
          orderBy: [
            { publishedAt: 'desc' },
            { createdAt: 'desc' }
          ],
          take
        })
        return ok(res, { success: true, data: { changes } })
      } catch (err) {
        console.error('SARS monitoring list error:', err.message)
        return ok(res, { success: true, data: { changes: [] } })
      }
    } else if (action === 'mark-read') {
      const { id } = req.body
      if (!id) return res.status(400).json({ error: 'Change ID is required' })
      try {
        const change = await prisma.sarsWebsiteChange.update({
          where: { id },
          data: { isRead: true }
        })
        return ok(res, { success: true, data: { change } })
      } catch (err) {
        console.error('SARS monitoring mark-read error:', err.message)
        return res.status(503).json({ error: 'SARS monitoring temporarily unavailable' })
      }
    } else if (action === 'stats') {
      try {
        const [total, newCount, unreadCount, byCategory, byPriority] = await Promise.all([
          prisma.sarsWebsiteChange.count(),
          prisma.sarsWebsiteChange.count({ where: { isNew: true } }),
          prisma.sarsWebsiteChange.count({ where: { isRead: false } }),
          prisma.sarsWebsiteChange.groupBy({ by: ['category'], _count: true }),
          prisma.sarsWebsiteChange.groupBy({ by: ['priority'], _count: true })
        ])
        return ok(res, {
          success: true,
          data: { total, new: newCount, unread: unreadCount, byCategory, byPriority }
        })
      } catch (err) {
        console.error('SARS monitoring stats error:', err.message)
        return ok(res, {
          success: true,
          data: { total: 0, new: 0, unread: 0, byCategory: [], byPriority: [] }
        })
      }
    }

    return res.status(400).json({ error: 'Invalid action' })
  } catch (error) {
    console.error('SARS monitoring error:', error)
    return serverError(res, error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

