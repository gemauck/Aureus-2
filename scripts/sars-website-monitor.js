/**
 * SARS Website Monitoring Script
 *
 * Monitors SARS website (public notices, legislation, news). Run manually or via cron.
 * Sends summary email to Compliance team when new changes are found.
 *
 * Usage:
 *   Cron: 0 7 * * * cd /path/to/repo && node scripts/sars-website-monitor.js
 *   Manual: node scripts/sars-website-monitor.js
 */

import 'dotenv/config'
import { createRequire } from 'module'
import { pathToFileURL } from 'url'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

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

async function checkSarsWebsite() {
  const results = { checked: [], newChanges: [], errors: [] }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const delayMs = 1500

  for (const section of SARS_SECTIONS) {
    try {
      await new Promise((r) => setTimeout(r, delayMs))
      console.log('🔍 Checking', section.label, '...')
      const html = await fetchSarsPage(section.url)
      const announcements = extractAnnouncements(html, section.url)
      results.checked.push({ url: section.url, found: announcements.length })

      for (const announcement of announcements) {
        try {
          const existing = await prisma.sarsWebsiteChange.findFirst({
            where: { url: announcement.url, title: announcement.title }
          })
          if (!existing) {
            const titleLower = (announcement.title || '').toLowerCase()
            const descLower = (announcement.description || '').toLowerCase()
            let priority = 'Normal'
            if (titleLower.includes('urgent') || titleLower.includes('critical') || titleLower.includes('immediate')) priority = 'Critical'
            else if (titleLower.includes('important') || titleLower.includes('deadline')) priority = 'High'
            else if (titleLower.includes('update') || titleLower.includes('change')) priority = 'Medium'
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
                metadata: JSON.stringify({ sourceUrl: section.url, sourceLabel: section.label, checkedAt: new Date().toISOString() })
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
            console.log(`✅ New change: ${announcement.title}`)
          }
        } catch (err) {
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

  try {
    await prisma.sarsMonitoringRun.create({
      data: {
        success: results.errors.length === 0,
        newCount: results.newChanges.length,
        errorMessage: results.errors.length > 0 ? results.errors.map((e) => e.error).join('; ').slice(0, 500) : null
      }
    })
  } catch (_) {}

  return results
}

async function runSarsMonitoring() {
  console.log('🔍 Starting SARS website monitoring...')
  const startTime = Date.now()

  try {
    const bypass =
      process.env.SARS_MONITORING_BYPASS_DAILY_LEASE === 'true' ||
      process.env.SARS_MONITORING_BYPASS_DAILY_LEASE === '1'
    if (!bypass) {
      const { tryAcquireSarsDailyLease } = await import(
        pathToFileURL(join(__dirname, '..', 'api', 'sars-monitoring', 'dailyLease.js')).href
      )
      const { acquired } = await tryAcquireSarsDailyLease()
      if (!acquired) {
        console.log(
          'SARS monitoring: daily lease already taken — skipping (one automated run per day; use SARS_MONITORING_BYPASS_DAILY_LEASE=1 to force)'
        )
        await prisma.$disconnect()
        process.exit(0)
      }
    }

    const results = await checkSarsWebsite()

    if (results.newChanges.length > 0) {
      try {
        const sendModule = await import(pathToFileURL(join(__dirname, '..', 'api', 'sars-monitoring', 'sendSummaryEmail.js')).href)
        await sendModule.sendSarsSummaryEmail(results.newChanges, { skipFirstRun: true })
      } catch (e) {
        console.error('📧 Summary email failed:', e.message)
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`\n✅ SARS monitoring completed in ${duration}s`)
    console.log(`   Pages checked: ${results.checked.length}`)
    console.log(`   New changes found: ${results.newChanges.length}`)
    console.log(`   Errors: ${results.errors.length}`)
    if (results.newChanges.length > 0) {
      console.log('\n📋 New changes:')
      results.newChanges.forEach((change) => console.log(`   - [${change.priority}] ${change.title}`))
    }

    return {
      success: true,
      checked: results.checked.length,
      newChanges: results.newChanges.length,
      errors: results.errors.length,
      duration
    }
  } catch (error) {
    console.error('❌ Fatal error in SARS monitoring:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.includes('sars-website-monitor.js')) {
  runSarsMonitoring()
    .then((result) => {
      console.log('✅ Script completed:', result)
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Script failed:', error)
      process.exit(1)
    })
} else {
  const isMain = process.argv[1] && process.argv[1].endsWith('sars-website-monitor.js')
  if (isMain) {
    runSarsMonitoring()
      .then((result) => {
        console.log('✅ Script completed:', result)
        process.exit(0)
      })
      .catch((error) => {
        console.error('❌ Script failed:', error)
        process.exit(1)
      })
  }
}

export { runSarsMonitoring, checkSarsWebsite }

