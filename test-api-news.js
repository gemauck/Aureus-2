// Test Client News API
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function test() {
  try {
    console.log('🧪 Testing Client News API...\n');
    
    // Check article count
    const count = await prisma.$queryRaw`SELECT COUNT(*)::int as count FROM "ClientNews"`;
    console.log('📊 Total articles in database:', count[0].count);
    
    // Get sample articles
    const articles = await prisma.clientNews.findMany({
      take: 5,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            type: true
          }
        }
      },
      orderBy: { publishedAt: 'desc' }
    });
    
    console.log('\n📰 Sample articles:');
    articles.forEach((article, i) => {
      console.log(`\n${i + 1}. ${article.title}`);
      console.log(`   Client: ${article.client?.name || 'Unknown'} (${article.client?.type || 'client'})`);
      console.log(`   Source: ${article.source}`);
      console.log(`   Published: ${article.publishedAt}`);
      console.log(`   URL: ${article.url}`);
    });
    
    // Test API response format
    const formatted = articles.map(article => ({
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
    }));
    
    console.log('\n✅ API Response format check:');
    console.log('   Sample formatted article:', JSON.stringify(formatted[0], null, 2));
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

test();

