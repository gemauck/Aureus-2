/**
 * Verify Document Sections are saved to database
 * Run: node scripts/verify-document-sections-db.js [projectId]
 *
 * Which DB? Uses DATABASE_URL from environment. By default that comes from .env / .env.local
 * (local dev = often localhost). Your LIVE site (e.g. abcoafrica.co.za) uses the PRODUCTION
 * DB on the server. To check the same DB the live site uses, run on the server or:
 *   DATABASE_URL="postgresql://...production..." node scripts/verify-document-sections-db.js [projectId]
 */

import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
config({ path: join(root, '.env') });
if (!process.env.USE_PROD && !process.env.PRODUCTION_DB) {
  config({ path: join(root, '.env.local'), override: true });
}

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

function dbHostLabel() {
  const u = process.env.DATABASE_URL || '';
  if (!u) return 'NOT SET';
  const host = u.replace(/^[^@]+@/, '').split(/[/?]/)[0].split(':')[0];
  if (/localhost|127\.0\.0\.1/.test(host)) return 'localhost (local dev)';
  return host.replace(/\./g, '.').substring(0, 50) + (host.length > 50 ? '...' : '');
}

async function verifyDocumentSections() {
  const projectId = process.argv[2] || 'cmhn2drtq001lqyu9bgfzzqx6'; // Default to Barberton Mines project
  
  console.log('🔍 Verifying Document Sections in Database\n');
  console.log('='.repeat(60));
  console.log('📌 Database:', dbHostLabel());
  console.log('   (Live site uses PRODUCTION DB; this script uses DATABASE_URL from .env / .env.local)\n');
  console.log(`Project ID: ${projectId}\n`);
  
  try {
    // Check if DocumentSection table exists
    try {
      await prisma.$queryRaw`SELECT 1 FROM "DocumentSection" LIMIT 1`;
      console.log('✅ DocumentSection table exists\n');
    } catch (e) {
      console.log('❌ DocumentSection table does NOT exist');
      console.log('   This means the migration hasn\'t been run yet.\n');
      return;
    }
    
    // Count sections for this project
    const sectionCount = await prisma.documentSection.count({
      where: { projectId }
    });
    
    console.log(`📊 Total sections in database for this project: ${sectionCount}\n`);
    
    if (sectionCount === 0) {
      console.log('⚠️  No sections found in database!');
      console.log('   This could mean:');
      console.log('   1. No sections have been saved yet');
      console.log('   2. Sections are being saved to JSON field instead');
      console.log('   3. Save operation is failing silently\n');
      
      // Check JSON field as fallback
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          name: true,
          documentSections: true
        }
      });
      
      if (project) {
        const jsonLength = project.documentSections ? String(project.documentSections).length : 0;
        console.log(`📄 JSON field length: ${jsonLength} characters`);
        if (jsonLength > 10) {
          console.log('   ⚠️  Data exists in JSON field but not in table!');
          console.log('   This means saves are going to JSON but not to table.\n');
        }
      }
      return;
    }
    
    // Get all sections with their documents, statuses, and comments
    const sections = await prisma.documentSection.findMany({
      where: { projectId },
      include: {
        documents: {
          include: {
            statuses: true,
            comments: true
          },
          orderBy: { order: 'asc' }
        }
      },
      orderBy: [
        { year: 'desc' },
        { order: 'asc' }
      ]
    });
    
    console.log(`\n📋 Sections in Database:\n`);
    console.log('='.repeat(60));
    
    sections.forEach((section, idx) => {
      console.log(`\n${idx + 1}. Section: "${section.name}"`);
      console.log(`   ID: ${section.id}`);
      console.log(`   Year: ${section.year}`);
      console.log(`   Order: ${section.order}`);
      console.log(`   Description: ${section.description || '(none)'}`);
      console.log(`   Documents: ${section.documents.length}`);
      
      section.documents.forEach((doc, docIdx) => {
        console.log(`\n   Document ${docIdx + 1}: "${doc.name}"`);
        console.log(`      ID: ${doc.id}`);
        console.log(`      Required: ${doc.required}`);
        console.log(`      Statuses: ${doc.statuses.length}`);
        console.log(`      Comments: ${doc.comments.length}`);
        
        if (doc.statuses.length > 0) {
          console.log(`      Status Details:`);
          doc.statuses.forEach(status => {
            console.log(`        - ${status.year}-${String(status.month).padStart(2, '0')}: ${status.status}`);
          });
        }
        
        if (doc.comments.length > 0) {
          console.log(`      Comment Details:`);
          doc.comments.forEach(comment => {
            console.log(`        - ${comment.year}-${String(comment.month).padStart(2, '0')}: "${comment.text.substring(0, 50)}${comment.text.length > 50 ? '...' : ''}" by ${comment.author}`);
          });
        }
      });
    });
    
    // Summary statistics
    const totalDocuments = sections.reduce((sum, s) => sum + s.documents.length, 0);
    const totalStatuses = sections.reduce((sum, s) => 
      sum + s.documents.reduce((docSum, d) => docSum + d.statuses.length, 0), 0
    );
    const totalComments = sections.reduce((sum, s) => 
      sum + s.documents.reduce((docSum, d) => docSum + d.comments.length, 0), 0
    );
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 Summary Statistics:');
    console.log(`   Sections: ${sectionCount}`);
    console.log(`   Documents: ${totalDocuments}`);
    console.log(`   Statuses: ${totalStatuses}`);
    console.log(`   Comments: ${totalComments}`);
    
    // Group by year
    const byYear = {};
    sections.forEach(s => {
      if (!byYear[s.year]) byYear[s.year] = { sections: 0, documents: 0 };
      byYear[s.year].sections++;
      byYear[s.year].documents += s.documents.length;
    });
    
    console.log('\n📅 By Year:');
    Object.keys(byYear).sort().forEach(year => {
      console.log(`   ${year}: ${byYear[year].sections} sections, ${byYear[year].documents} documents`);
    });
    
    console.log('\n✅ Database verification complete!\n');
    
  } catch (error) {
    console.error('❌ Error verifying database:', error);
    console.error('   Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

verifyDocumentSections();


