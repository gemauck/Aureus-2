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

// Search news for a client using Google News RSS (no API key required)
export async function searchNewsForClient(clientName, website) {
  try {
    console.log(`📰 Searching news for client: ${clientName}`)
    
    // Build search query - use client name and website if available
    let searchQuery = clientName
    
    // Remove common company suffixes that might reduce search quality
    searchQuery = searchQuery
      .replace(/\s+(Pty|Ltd|Inc|LLC|Corp|Corporation)\.?\s*$/i, '')
      .replace(/\s+(Limited|Incorporated)\s*$/i, '')
    
    // Add website domain if available (for better results)
    if (website) {
      try {
        const url = new URL(website.startsWith('http') ? website : `https://${website}`)
        const domain = url.hostname.replace('www.', '')
        searchQuery = `${searchQuery} OR ${domain}`
      } catch (e) {
        // If website is not a valid URL, ignore it
      }
    }
    
    // Google News RSS feed URL
    // Using 'when:7d' to get news from last 7 days only
    const encodedQuery = encodeURIComponent(searchQuery)
    const rssUrl = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en&gl=US&ceid=US:en`
    
    console.log(`   Fetching: ${rssUrl}`)
    
    // Fetch RSS feed
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    if (!response.ok) {
      console.warn(`   ⚠️ RSS feed returned status ${response.status}`)
      return []
    }
    
    const xmlText = await response.text()
    const articles = parseRSS(xmlText)
    
    console.log(`   ✅ Found ${articles.length} articles`)
    return articles.slice(0, 10) // Limit to top 10 results
    
  } catch (error) {
    console.error(`   ❌ Error searching news for ${clientName}:`, error.message)
    return []
  }
}

// Helper function to search and save news for a specific client
export async function searchAndSaveNewsForClient(clientId, clientName, website) {
  try {
    console.log(`📰 Searching and saving news for client: ${clientName} (${clientId})`)
    
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
      console.log(`⏭️ Client ${clientName} is not subscribed to RSS feeds, skipping search`)
      return { success: true, articlesFound: 0, skipped: true }
    }
    
    const articles = await searchNewsForClient(clientName, website || '')
    
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    let articlesSaved = 0
    
    // Process and save articles
    for (const article of articles) {
      if (!article.url || !article.title) {
        continue
      }
      
      const publishedDate = new Date(article.publishedAt || Date.now())
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
        console.log(`   ✅ Saved article: ${article.title}`)
      } else if (existing && isNew && !existing.isNew) {
        // Update isNew flag if article was previously marked as old
        await prisma.clientNews.update({
          where: { id: existing.id },
          data: { isNew: true }
        })
      }
    }
    
    console.log(`✅ News search completed for ${clientName}. Found ${articlesSaved} new articles`)
    return { success: true, articlesFound: articlesSaved }
    
  } catch (error) {
    console.error(`❌ Error searching and saving news for client ${clientName}:`, error)
    return { success: false, articlesFound: 0, error: error.message }
  }
}

async function handler(req, res) {
  try {
    console.log('🔍 Client News Search API:', {
      method: req.method,
      url: req.url
    })

    // POST /api/client-news/search - Trigger news search for all clients
    if (req.method === 'POST') {
      try {
        // Get all active clients and leads that are subscribed to RSS feeds
        const clients = await prisma.client.findMany({
          where: {
            AND: [
              {
                OR: [
                  { type: 'client', status: 'active' },
                  { type: 'lead', status: { in: ['Potential', 'Active'] } }
                ]
              },
              {
                OR: [
                  { rssSubscribed: true },
                  { rssSubscribed: null } // Default to true for null values
                ]
              }
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

        console.log(`📰 Searching news for ${clients.length} clients and leads`)

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

        console.log(`✅ News search completed. Found ${allArticles.length} new articles`)
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
