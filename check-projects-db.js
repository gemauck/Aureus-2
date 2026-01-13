import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkProjects() {
  try {
    const projects = await prisma.project.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        clientName: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    
    console.log(`\n📋 Found ${projects.length} projects in database:\n`);
    
    if (projects.length === 0) {
      console.log('❌ No projects found in database');
    } else {
      projects.forEach((p, i) => {
        console.log(`${i + 1}. ${p.name} (${p.id})`);
        console.log(`   Status: ${p.status}, Client: ${p.clientName || 'N/A'}`);
      });
    }
    
    // Also check total count
    const totalCount = await prisma.project.count();
    console.log(`\n📊 Total projects in database: ${totalCount}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkProjects();
