/**
 * Daily Client News Search Script
 * 
 * This script searches for news articles related to all active clients
 * using Google News RSS feeds (no API key required).
 * 
 * Usage:
 * - Cron: 0 9 * * * /usr/bin/node /path/to/scripts/daily-news-search.js
 * - Manual: node scripts/daily-news-search.js
 */

require('dotenv').config({ path: '.env.local' });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Parse XML/RSS feed
function parseRSS(xmlText) {
  try {
    const articles = [];
    const itemMatches = xmlText.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi);
    
    for (const match of itemMatches) {
      const itemContent = match[1];
      const titleMatch = itemContent.match(/<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>|<title[^>]*>(.*?)<\/title>/i);
      const descriptionMatch = itemContent.match(/<description[^>]*><!\[CDATA\[(.*?)\]\]><\/description>|<description[^>]*>(.*?)<\/description>/i);
      const linkMatch = itemContent.match(/<link[^>]*>(.*?)<\/link>|guid[^>]*>(.*?)<\/guid>/i);
      const pubDateMatch = itemContent.match(/<pubDate[^>]*>(.*?)<\/pubDate>/i);
      
      const title = (titleMatch && (titleMatch[1] || titleMatch[2]))?.trim() || '';
      const description = (descriptionMatch && (descriptionMatch[1] || descriptionMatch[2]))?.trim() || '';
      const url = (linkMatch && (linkMatch[1] || linkMatch[2]))?.trim() || '';
      const pubDate = pubDateMatch ? pubDateMatch[1].trim() : null;
      
      let source = 'Google News';
      if (url) {
        try {
          const urlObj = new URL(url);
          source = urlObj.hostname.replace('www.', '');
        } catch (e) {
          // Ignore URL parse errors
        }
      }
      
      if (title && url) {
        articles.push({
          title: title.replace(/<[^>]*>/g, ''),
          description: description.replace(/<[^>]*>/g, '').substring(0, 300),
          url: url,
          source: source,
          publishedAt: pubDate || new Date().toISOString()
        });
      }
    }
    
    return articles;
  } catch (error) {
    console.error('Error parsing RSS:', error);
    return [];
  }
}

// Search news for a client using Google News RSS
async function searchNewsForClient(clientName, website) {
  try {
    console.log(`📰 Searching news for: ${clientName}`);
    
    let searchQuery = clientName;
    
    // Clean up company name
    searchQuery = searchQuery
      .replace(/\s+(Pty|Ltd|Inc|LLC|Corp|Corporation)\.?\s*$/i, '')
      .replace(/\s+(Limited|Incorporated)\s*$/i, '');
    
    // Add website domain if available
    if (website) {
      try {
        const url = new URL(website.startsWith('http') ? website : `https://${website}`);
        const domain = url.hostname.replace('www.', '');
        searchQuery = `${searchQuery} OR ${domain}`;
      } catch (e) {
        // Ignore invalid URLs
      }
    }
    
    const encodedQuery = encodeURIComponent(searchQuery);
    const rssUrl = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en&gl=US&ceid=US:en`;
    
    // Use built-in fetch (Node 18+)
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      console.warn(`   ⚠️ RSS feed returned status ${response.status}`);
      return [];
    }
    
    const xmlText = await response.text();
    const articles = parseRSS(xmlText);
    
    console.log(`   ✅ Found ${articles.length} articles`);
    return articles.slice(0, 10); // Limit to top 10
    
  } catch (error) {
    console.error(`   ❌ Error searching news for ${clientName}:`, error.message);
    return [];
  }
}

async function runDailyNewsSearch() {
  console.log('🔍 Starting daily client news search...');
  const startTime = Date.now();

  try {
    const clients = await prisma.client.findMany({
      where: {
        OR: [
          { type: 'client', status: 'active' },
          { type: 'lead', status: { in: ['Potential', 'Active'] } }
        ]
      },
      select: {
        id: true,
        name: true,
        website: true,
        type: true
      }
    });

    console.log(`📰 Found ${clients.length} active clients and leads to search`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalArticles = 0;
    let newArticles = 0;

    for (const client of clients) {
      try {
        console.log(`\n🔍 Processing: ${client.name}`);
        
        const articles = await searchNewsForClient(
          client.name,
          client.website || ''
        );

        for (const article of articles) {
          if (!article.url || !article.title) {
            continue;
          }

          const publishedDate = new Date(article.publishedAt || Date.now());
          const isNew = publishedDate >= today;

          const existing = await prisma.clientNews.findFirst({
            where: {
              clientId: client.id,
              url: article.url
            }
          });

          if (!existing) {
            await prisma.clientNews.create({
              data: {
                clientId: client.id,
                title: article.title,
                description: article.description || '',
                url: article.url,
                source: article.source || 'Google News',
                publishedAt: publishedDate,
                isNew: isNew
              }
            });
            
            totalArticles++;
            if (isNew) {
              newArticles++;
            }
            
            console.log(`   ✅ Saved: ${article.title.substring(0, 50)}...`);
          } else if (isNew && !existing.isNew) {
            await prisma.clientNews.update({
              where: { id: existing.id },
              data: { isNew: true }
            });
          }
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (clientError) {
        console.error(`   ❌ Error processing ${client.name}:`, clientError.message);
      }
    }

    // Mark old articles as not new
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    await prisma.clientNews.updateMany({
      where: {
        publishedAt: { lt: yesterday },
        isNew: true
      },
      data: {
        isNew: false
      }
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Daily news search completed in ${duration}s`);
    console.log(`   Total articles processed: ${totalArticles}`);
    console.log(`   New articles (today): ${newArticles}`);
    
    return {
      success: true,
      clientsProcessed: clients.length,
      articlesFound: totalArticles,
      newArticles: newArticles,
      duration: duration
    };
  } catch (error) {
    console.error('❌ Fatal error in daily news search:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runDailyNewsSearch()
    .then((result) => {
      console.log('✅ Script completed:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { runDailyNewsSearch, searchNewsForClient };
