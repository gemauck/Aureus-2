// Daily Client News Search Service
// This endpoint searches for news articles related to clients using Google News RSS
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { ok, serverError } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'

// Parse XML/RSS feed - simple parser for RSS feeds
function parseRSS(xmlText) {
  try {
    const articles = []
    // Extract items from RSS feed
    const itemMatches = xmlText.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)
    
    for (const match of itemMatches) {
      const itemContent = match[1]
      const titleMatch = itemContent.match(/<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>|<title[^>]*>(.*?)<\/title>/i)
      const descriptionMatch = itemContent.match(/<description[^>]*><!\[CDATA\[(.*?)\]\]><\/description>|<description[^>]*>(.*?)<\/description>/i)
      const linkMatch = itemContent.match(/<link[^>]*>(.*?)<\/link>|guid[^>]*>(.*?)<\/guid>/i)
      const pubDateMatch = itemContent.match(/<pubDate[^>]*>(.*?)<\/pubDate>/i)
      
      const title = (titleMatch && (titleMatch[1] || titleMatch[2]))?.trim() || ''
      const description = (descriptionMatch && (descriptionMatch[1] || descriptionMatch[2]))?.trim() || ''
      const url = (linkMatch && (linkMatch[1] || linkMatch[2]))?.trim() || ''
      const pubDate = pubDateMatch ? pubDateMatch[1].trim() : null
      
      // Extract source from description or URL
      let source = 'Google News'
      if (url) {
        try {
          const urlObj = new URL(url)
          source = urlObj.hostname.replace('www.', '')
        } catch (e) {
          // Ignore URL parse errors
        }
      }
      
      if (title && url) {
        articles.push({
          title: title.replace(/<[^>]*>/g, ''), // Remove HTML tags
          description: description.replace(/<[^>]*>/g, '').substring(0, 300), // Remove HTML, limit length
          url: url,
          source: source,
          publishedAt: pubDate || new Date().toISOString()
        })
      }
    }
    
    return articles
  } catch (error) {
    console.error('Error parsing RSS:', error)
    return []
  }
}

// Fetch one RSS URL and parse
async function fetchRss(rssUrl) {
  const response = await fetch(rssUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    signal: AbortSignal.timeout(15000)
  })
  if (!response.ok) return { articles: [], status: response.status }
  const xmlText = await response.text()
  return { articles: parseRSS(xmlText), status: response.status }
}

// Search news for a client using Google News RSS (no API key required)
export async function searchNewsForClient(clientName, website) {
  try {
    let searchQuery = clientName
      .replace(/\s+(Pty|Ltd|Inc|LLC|Corp|Corporation)\.?\s*$/i, '')
      .replace(/\s+(Limited|Incorporated)\s*$/i, '')
    if (!searchQuery || !searchQuery.trim()) return []

    // Try with client name + optional website first
    let queryToUse = searchQuery
    if (website) {
      try {
        const url = new URL(website.startsWith('http') ? website : `https://${website}`)
        const domain = url.hostname.replace('www.', '')
        queryToUse = `${searchQuery} OR ${domain}`
      } catch (e) { /* ignore */ }
    }

    const encodedQuery = encodeURIComponent(queryToUse)
    const rssUrl = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en&gl=US&ceid=US:en`
    let { articles } = await fetchRss(rssUrl)

    // If 0 results, retry with name only (sometimes "X OR domain" returns nothing)
    if (articles.length === 0 && queryToUse !== searchQuery) {
      const fallbackUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(searchQuery)}&hl=en&gl=US&ceid=US:en`
      const fallback = await fetchRss(fallbackUrl)
      articles = fallback.articles
    }

    if (articles.length === 0) {
      console.warn(`   ⚠️ RSS returned 0 articles for "${clientName}"`)
    }
    return articles.slice(0, 20)
  } catch (error) {
    console.error(`   ❌ Error searching news for ${clientName}:`, error.message)
    return []
  }
}

// Helper function to search and save news for a specific client
export async function searchAndSaveNewsForClient(clientId, clientName, website) {
  try {
    
    // Check if client is subscribed to RSS feeds
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { rssSubscribed: true }
    })
    
    if (!client) {
      console.warn(`⚠️ Client not found: ${clientId}`)
      return { success: false, articlesFound: 0 }
    }
    
    // Only search if subscribed
    if (client.rssSubscribed === false) {
      return { success: true, articlesFound: 0, skipped: true }
    }
    
    const articles = await searchNewsForClient(clientName, website || '')
    
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const cutoff90d = new Date(today)
    cutoff90d.setDate(cutoff90d.getDate() - 90)

    let articlesSaved = 0

    // Save articles from the last 90 days so the feed has content (Google often returns recent-ish items)
    for (const article of articles) {
      if (!article.url || !article.title) continue

      let publishedDate = new Date(article.publishedAt || Date.now())
      if (Number.isNaN(publishedDate.getTime())) publishedDate = new Date()
      if (publishedDate < cutoff90d) continue
      const isNew = publishedDate >= today
      
      // Check if article already exists
      const existing = await prisma.clientNews.findFirst({
        where: {
          clientId: clientId,
          url: article.url
        }
      })
      
      if (!existing && article.url) {
        await prisma.clientNews.create({
          data: {
            clientId: clientId,
            title: article.title,
            description: article.description || '',
            url: article.url,
            source: article.source || 'Google News',
            publishedAt: publishedDate,
            isNew: isNew
          }
        })
        articlesSaved++
      } else if (existing && isNew && !existing.isNew) {
        // Update isNew flag if article was previously marked as old
        await prisma.clientNews.update({
          where: { id: existing.id },
          data: { isNew: true }
        })
      }
    }
    
    return { success: true, articlesFound: articlesSaved }
    
  } catch (error) {
    console.error(`❌ Error searching and saving news for client ${clientName}:`, error)
    return { success: false, articlesFound: 0, error: error.message }
  }
}

async function handler(req, res) {
  try {

    // POST /api/client-news/search - Trigger news search for all clients
    if (req.method === 'POST') {
      try {
        // Get ALL clients and leads subscribed to RSS (Client model has no status field)
        const clients = await prisma.client.findMany({
          where: {
            OR: [
              { rssSubscribed: true },
              { rssSubscribed: null }
            ]
          },
          select: {
            id: true,
            name: true,
            website: true,
            type: true,
            rssSubscribed: true
          }
        })

        if (clients.length === 0) {
          console.warn('   ⚠️ No clients/leads found with rssSubscribed true or null. Check DB.')
        } else {
          console.log(`   📰 News search: ${clients.length} client(s)/lead(s) to search`)
        }

        const allArticles = []
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        // Search news for each client using the helper function
        for (const client of clients) {
          try {
            const result = await searchAndSaveNewsForClient(
              client.id,
              client.name,
              client.website || ''
            )
            
            // Track articles for response (we don't have individual articles from the helper,
            // but we can note that articles were processed)
            if (result.articlesFound > 0) {
              allArticles.push({
                clientName: client.name,
                title: `${result.articlesFound} new article(s) found`,
                source: 'Google News'
              })
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000))
          } catch (clientError) {
            console.error(`Error searching news for ${client.name}:`, clientError)
            // Continue with other clients
          }
        }

        // Mark old articles as not new (older than 24 hours)
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        
        await prisma.clientNews.updateMany({
          where: {
            publishedAt: { lt: yesterday },
            isNew: true
          },
          data: {
            isNew: false
          }
        })

        return ok(res, {
          success: true,
          articlesFound: allArticles.length,
          clientsProcessed: clients.length,
          articles: allArticles
        })
      } catch (dbError) {
        console.error('❌ Database error during news search:', dbError)
        return serverError(res, 'Failed to search news', dbError.message)
      }
    }

    return serverError(res, 'Method not allowed')
  } catch (error) {
    console.error('❌ Client News Search API error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withLogging(withHttp(authRequired(handler)))
