/**
 * Daily Client News Search — Google News RSS (no API key).
 * Cron: 0 9 * * * node scripts/daily-news-search.js
 * Manual: npm run news:search:daily
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  searchAndSaveNewsForClient,
  getClientsForNewsSearch,
  countClientsForNewsSearch
} from '../api/client-news/search.js';

const prisma = new PrismaClient();
const BATCH_SIZE = 40;
const RSS_DELAY_MS = 400;

async function runDailyNewsSearch() {
  console.log('🔍 Starting daily client news search...');
  const startTime = Date.now();

  try {
    const total = await countClientsForNewsSearch();
    console.log(`📰 ${total} subscribed client(s)/lead(s) to search`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalArticles = 0;
    let newArticles = 0;
    let offset = 0;

    while (offset < total) {
      const clients = await getClientsForNewsSearch({ offset, limit: BATCH_SIZE });
      if (clients.length === 0) break;

      for (const client of clients) {
        try {
          console.log(`\n🔍 Processing: ${client.name}`);
          const result = await searchAndSaveNewsForClient(
            client.id,
            client.name,
            client.website || ''
          );
          if (result.skipped) {
            console.log('   ⏭️ Skipped (unsubscribed)');
            continue;
          }
          if (result.articlesFound > 0) {
            totalArticles += result.articlesFound;
            console.log(`   ✅ Saved ${result.articlesFound} new article(s)`);
          }
          await new Promise((resolve) => setTimeout(resolve, RSS_DELAY_MS));
        } catch (clientError) {
          console.error(`   ❌ Error processing ${client.name}:`, clientError.message);
        }
      }

      offset += clients.length;
    }

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    await prisma.clientNews.updateMany({
      where: {
        publishedAt: { lt: yesterday },
        isNew: true
      },
      data: { isNew: false }
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Daily news search completed in ${duration}s`);
    console.log(`   New articles saved: ${totalArticles}`);

    return {
      success: true,
      clientsProcessed: total,
      articlesFound: totalArticles,
      newArticles,
      duration
    };
  } catch (error) {
    console.error('❌ Fatal error in daily news search:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.includes('daily-news-search.js')) {
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

export { runDailyNewsSearch };
