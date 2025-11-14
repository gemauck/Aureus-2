// SARS Website Monitoring API
// Checks for changes on the SARS website and stores them in the database
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

// SARS website URLs to monitor
const SARS_URLS = {
  main: 'https://www.sars.gov.za',
  news: 'https://www.sars.gov.za/news-and-media/',
  announcements: 'https://www.sars.gov.za/news-and-media/announcements/',
  taxUpdates: 'https://www.sars.gov.za/tax-types/',
  vatUpdates: 'https://www.sars.gov.za/tax-types/value-added-tax/'
}

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

// Main function to check SARS website for changes
async function checkSarsWebsite() {
  const results = {
    checked: [],
    newChanges: [],
    errors: []
  }

  try {
    // Check announcements page (most likely to have updates)
    console.log('🔍 Checking SARS announcements page...')
    const announcementsHtml = await fetchSarsPage(SARS_URLS.announcements)
    const announcements = extractAnnouncements(announcementsHtml, SARS_URLS.announcements)
    
    results.checked.push({
      url: SARS_URLS.announcements,
      found: announcements.length
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Process each announcement
    for (const announcement of announcements) {
      try {
        // Check if this change already exists
        const existing = await prisma.sarsWebsiteChange.findFirst({
          where: {
            url: announcement.url,
            title: announcement.title
          }
        })

        if (!existing) {
          // Determine priority based on keywords
          let priority = 'Normal'
          const titleLower = announcement.title.toLowerCase()
          if (titleLower.includes('urgent') || titleLower.includes('critical') || titleLower.includes('immediate')) {
            priority = 'Critical'
          } else if (titleLower.includes('important') || titleLower.includes('deadline')) {
            priority = 'High'
          } else if (titleLower.includes('update') || titleLower.includes('change')) {
            priority = 'Medium'
          }

          // Determine category
          let category = 'General'
          const descLower = (announcement.description || '').toLowerCase()
          if (titleLower.includes('vat') || descLower.includes('vat')) {
            category = 'VAT'
          } else if (titleLower.includes('tax') || descLower.includes('tax')) {
            category = 'Tax'
          } else if (titleLower.includes('compliance') || descLower.includes('compliance')) {
            category = 'Compliance'
          }

          // Check if it's new (published today or recently)
          const publishedDate = new Date(announcement.publishedAt)
          const isNew = publishedDate >= today

          // Create new change record
          const change = await prisma.sarsWebsiteChange.create({
            data: {
              url: announcement.url,
              pageTitle: announcement.pageTitle,
              changeType: 'new',
              title: announcement.title,
              description: announcement.description,
              publishedAt: publishedDate,
              isNew: isNew,
              isRead: false,
              priority: priority,
              category: category,
              metadata: JSON.stringify({
                sourceUrl: SARS_URLS.announcements,
                checkedAt: new Date().toISOString()
              })
            }
          })

          results.newChanges.push({
            id: change.id,
            title: change.title,
            url: change.url,
            priority: change.priority
          })

          console.log(`✅ New change detected: ${announcement.title}`)
        }
      } catch (error) {
        console.error(`Error processing announcement: ${announcement.title}`, error)
        results.errors.push({
          title: announcement.title,
          error: error.message
        })
      }
    }

    // Mark old changes as not new
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    await prisma.sarsWebsiteChange.updateMany({
      where: {
        publishedAt: { lt: yesterday },
        isNew: true
      },
      data: {
        isNew: false
      }
    })

  } catch (error) {
    console.error('Error checking SARS website:', error)
    results.errors.push({
      url: 'general',
      error: error.message
    })
  }

  return results
}

// API Handler
async function handler(req, res) {
  try {
    const { action = 'check' } = req.query

    if (action === 'check') {
      // Manual check trigger
      const results = await checkSarsWebsite()
      
      return ok(res, {
        success: true,
        message: 'SARS website check completed',
        results: {
          checked: results.checked.length,
          newChanges: results.newChanges.length,
          errors: results.errors.length,
          changes: results.newChanges
        }
      })
    } else if (action === 'list') {
      // Get list of changes
      const { limit = 50, isNew, isRead, category, priority } = req.query
      
      const where = {}
      if (isNew !== undefined) where.isNew = isNew === 'true'
      if (isRead !== undefined) where.isRead = isRead === 'true'
      if (category) where.category = category
      if (priority) where.priority = priority

      const changes = await prisma.sarsWebsiteChange.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        take: parseInt(limit)
      })

      return ok(res, {
        success: true,
        data: { changes }
      })
    } else if (action === 'mark-read') {
      // Mark change as read
      const { id } = req.body
      
      if (!id) {
        return res.status(400).json({ error: 'Change ID is required' })
      }

      const change = await prisma.sarsWebsiteChange.update({
        where: { id },
        data: { isRead: true }
      })

      return ok(res, {
        success: true,
        data: { change }
      })
    } else if (action === 'stats') {
      // Get statistics
      const [total, newCount, unreadCount, byCategory, byPriority] = await Promise.all([
        prisma.sarsWebsiteChange.count(),
        prisma.sarsWebsiteChange.count({ where: { isNew: true } }),
        prisma.sarsWebsiteChange.count({ where: { isRead: false } }),
        prisma.sarsWebsiteChange.groupBy({
          by: ['category'],
          _count: true
        }),
        prisma.sarsWebsiteChange.groupBy({
          by: ['priority'],
          _count: true
        })
      ])

      return ok(res, {
        success: true,
        data: {
          total,
          new: newCount,
          unread: unreadCount,
          byCategory,
          byPriority
        }
      })
    }

    return res.status(400).json({ error: 'Invalid action' })
  } catch (error) {
    console.error('SARS monitoring error:', error)
    return serverError(res, error.message)
  }
}

export default withHttp(withLogging(authRequired(handler)))

