// SARS Website Monitoring API
// Checks for changes on the SARS website (public notices, legislation, news) and stores them in the database
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { sendSarsSummaryEmail } from './sendSummaryEmail.js'

// All key sections to monitor (public notices, legislation, news)
const SARS_SECTIONS = [
  { url: 'https://www.sars.gov.za/news-and-media/announcements/', label: 'Announcements' },
  { url: 'https://www.sars.gov.za/news-and-media/', label: 'News & Media' },
  { url: 'https://www.sars.gov.za/latest-news/', label: 'Latest News' },
  { url: 'https://www.sars.gov.za/whats-new-at-sars/', label: "What's New" },
  { url: 'https://www.sars.gov.za/legal-counsel/secondary-legislation/public-notices/', label: 'Public Notices' },
  { url: 'https://www.sars.gov.za/legal-counsel/secondary-legislation/', label: 'Secondary Legislation' },
  { url: 'https://www.sars.gov.za/media/media-releases/', label: 'Media Releases' }
]

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

// Function to extract announcements/news from HTML
function extractAnnouncements(html, url) {
  const announcements = []
  
  try {
    // Extract page title
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i)
    const pageTitle = titleMatch ? titleMatch[1].trim().replace(/<[^>]*>/g, '') : 'SARS Website'

    // Look for common announcement patterns
    // Pattern 1: Article/announcement links
    const articlePattern = /<article[^>]*>([\s\S]*?)<\/article>/gi
    const articleMatches = [...html.matchAll(articlePattern)]
    
    for (const match of articleMatches) {
      const articleHtml = match[1]
      
      // Extract title
      const titleMatch = articleHtml.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/i) ||
                        articleHtml.match(/<a[^>]*class="[^"]*title[^"]*"[^>]*>(.*?)<\/a>/i)
      const title = titleMatch ? titleMatch[1].trim().replace(/<[^>]*>/g, '') : 'Untitled'

      // Extract description
      const descMatch = articleHtml.match(/<p[^>]*>(.*?)<\/p>/i)
      const description = descMatch ? descMatch[1].trim().replace(/<[^>]*>/g, '').substring(0, 500) : ''

      // Extract link
      const linkMatch = articleHtml.match(/<a[^>]*href="([^"]*)"[^>]*>/i)
      let link = linkMatch ? linkMatch[1] : ''
      if (link && !link.startsWith('http')) {
        link = new URL(link, url).href
      }

      // Extract date
      const dateMatch = articleHtml.match(/(\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i) ||
                       articleHtml.match(/(\d{4}-\d{2}-\d{2})/)
      let publishedAt = null
      if (dateMatch) {
        try {
          publishedAt = new Date(dateMatch[1])
        } catch (e) {
          // Invalid date, use current date
        }
      }

      if (title && title !== 'Untitled') {
        announcements.push({
          title,
          description,
          url: link || url,
          pageTitle,
          publishedAt: publishedAt || new Date()
        })
      }
    }

    // Pattern 2: List items with links (common in news/announcement pages)
    if (announcements.length === 0) {
      const listItemPattern = /<li[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>[\s\S]*?<\/li>/gi
      const listMatches = [...html.matchAll(listItemPattern)]
      
      for (const match of listMatches.slice(0, 20)) { // Limit to 20 items
        const link = match[1]
        const title = match[2].trim().replace(/<[^>]*>/g, '')
        
        if (title && link) {
          let fullLink = link
          if (!link.startsWith('http')) {
            fullLink = new URL(link, url).href
          }

          announcements.push({
            title,
            description: '',
            url: fullLink,
            pageTitle,
            publishedAt: new Date()
          })
        }
      }
    }

  } catch (error) {
    console.error('Error extracting announcements:', error)
  }

  return announcements
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
async function checkSarsWebsite() {
  const results = {
    checked: [],
    newChanges: [],
    errors: []
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const delayMs = 1500

  for (const section of SARS_SECTIONS) {
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
            else if (section.label === 'Public Notices' || section.label === 'Secondary Legislation') category = 'Compliance'

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
  return checkSarsWebsite()
}

// API Handler
async function handler(req, res) {
  try {
    const { action = 'check' } = req.query

    if (action === 'check') {
      let results
      try {
        results = await checkSarsWebsite()
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

