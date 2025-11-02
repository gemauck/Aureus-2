// Client News API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, created, ok, serverError, notFound } from './_lib/response.js'
import { parseJsonBody } from './_lib/body.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  try {
    console.log('🔍 Client News API Debug:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      user: req.user
    })

    // GET /api/client-news - Get all news articles
    if (req.method === 'GET') {
      try {
        // First, get all news articles with client info
        const allNewsArticles = await prisma.clientNews.findMany({
          include: {
            client: {
              select: {
                id: true,
                name: true,
                type: true,
                rssSubscribed: true
              }
            }
          },
          orderBy: { publishedAt: 'desc' },
          take: 100 // Limit to recent articles
        })

        // Filter to only include articles from subscribed clients
        // A client is subscribed if rssSubscribed is true or null (default to subscribed)
        // Explicitly exclude articles where rssSubscribed is false
        const newsArticles = allNewsArticles.filter(article => {
          // If client relationship is missing, exclude the article (data integrity issue)
          if (!article.client) {
            console.log(`⚠️ Article ${article.id} has no client relationship - excluding`)
            return false
          }

          // Get the subscription status
          const rssSubscribed = article.client.rssSubscribed
          
          // Client is subscribed if rssSubscribed is true or null (default to subscribed)
          // Only exclude if explicitly false
          const isSubscribed = rssSubscribed !== false

          if (!isSubscribed) {
            console.log(`🚫 FILTERED OUT: Article "${article.title}" for unsubscribed client "${article.client.name}" (rssSubscribed: ${rssSubscribed})`)
          }
          
          return isSubscribed
        })

        console.log(`📰 NEWS FILTER: Total articles: ${allNewsArticles.length}, After filtering (subscribed only): ${newsArticles.length}`)
        
        // Log which clients are unsubscribed
        const unsubscribedClients = new Set()
        allNewsArticles.forEach(article => {
          if (article.client && article.client.rssSubscribed === false) {
            unsubscribedClients.add(`${article.client.name} (${article.client.id})`)
          }
        })
        if (unsubscribedClients.size > 0) {
          console.log(`🚫 Unsubscribed clients found:`, Array.from(unsubscribedClients))
        }

        // Format the response
        const formattedArticles = newsArticles.map(article => ({
          id: article.id,
          clientId: article.clientId,
          clientName: article.client?.name || 'Unknown',
          clientType: article.client?.type || 'client',
          title: article.title,
          description: article.description,
          url: article.url,
          source: article.source,
          publishedAt: article.publishedAt,
          createdAt: article.createdAt,
          isNew: article.isNew
        }))

        console.log('✅ Client news articles retrieved:', formattedArticles.length)
        return ok(res, { newsArticles: formattedArticles })
      } catch (dbError) {
        console.error('❌ Database error getting client news:', dbError)
        return serverError(res, 'Failed to get client news', dbError.message)
      }
    }

    // POST /api/client-news - Create or update news article
    if (req.method === 'POST') {
      try {
        const body = await parseJsonBody(req)
        const { clientId, title, description, url, source, publishedAt } = body

        if (!clientId || !title) {
          return badRequest(res, 'clientId and title are required')
        }

        // Check if article already exists (by URL)
        let article
        if (url) {
          article = await prisma.clientNews.findFirst({
            where: { url, clientId }
          })
        }

        if (article) {
          // Update existing article
          article = await prisma.clientNews.update({
            where: { id: article.id },
            data: {
              title,
              description,
              source,
              publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
              isNew: false // Mark as not new if updating
            },
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                  type: true
                }
              }
            }
          })
        } else {
          // Create new article
          article = await prisma.clientNews.create({
            data: {
              clientId,
              title,
              description: description || '',
              url: url || '',
              source: source || 'Unknown',
              publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
              isNew: true // Mark as new
            },
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                  type: true
                }
              }
            }
          })
        }

        console.log('✅ Client news article saved:', article.id)
        return created(res, { newsArticle: article })
      } catch (dbError) {
        console.error('❌ Database error creating client news:', dbError)
        return serverError(res, 'Failed to create client news', dbError.message)
      }
    }

    return badRequest(res, 'Method not allowed')
  } catch (error) {
    console.error('❌ Client News API error:', error)
    return serverError(res, 'Internal server error', error.message)
  }
}

export default withLogging(withHttp(authRequired(handler)))

