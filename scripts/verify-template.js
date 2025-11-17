// Script to verify document collection templates in the database
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyTemplates() {
    try {
        console.log('📋 Checking all document collection templates...\n');
        
        const templates = await prisma.documentCollectionTemplate.findMany({
            orderBy: [
                { isDefault: 'desc' },
                { createdAt: 'desc' }
            ]
        });
        
        if (templates.length === 0) {
            console.log('❌ No templates found in database!');
            return;
        }
        
        console.log(`✅ Found ${templates.length} template(s):\n`);
        
        templates.forEach((template, index) => {
            console.log(`${index + 1}. ${template.name}`);
            console.log(`   ID: ${template.id}`);
            console.log(`   Default: ${template.isDefault ? 'Yes' : 'No'}`);
            console.log(`   Owner: ${template.ownerId || 'None'}`);
            console.log(`   Created by: ${template.createdBy || 'Unknown'}`);
            console.log(`   Created: ${template.createdAt}`);
            
            // Parse and check sections
            try {
                const sections = typeof template.sections === 'string' 
                    ? JSON.parse(template.sections) 
                    : template.sections;
                
                if (Array.isArray(sections)) {
                    console.log(`   Sections: ${sections.length}`);
                    const totalDocs = sections.reduce((sum, sec) => sum + (sec.documents?.length || 0), 0);
                    console.log(`   Total Documents: ${totalDocs}`);
                } else {
                    console.log(`   ⚠️ Sections is not an array!`);
                }
            } catch (e) {
                console.log(`   ❌ Error parsing sections: ${e.message}`);
            }
            
            console.log('');
        });
        
        console.log('💡 If templates don\'t appear in the UI:');
        console.log('   1. Refresh the page (templates reload on mount)');
        console.log('   2. Open the template modal (templates reload when modal opens)');
        console.log('   3. Clear browser localStorage for documentCollectionTemplates');
        console.log('   4. Check browser console for any errors');
        
    } catch (error) {
        console.error('❌ Error verifying templates:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

verifyTemplates();

