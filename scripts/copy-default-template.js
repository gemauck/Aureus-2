// Script to copy the default document collection template
// This creates templates exactly like the UI does, ensuring compatibility
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function copyDefaultTemplate() {
    try {
        console.log('📋 Looking for default template...');
        
        // Find the default template
        const defaultTemplate = await prisma.documentCollectionTemplate.findFirst({
            where: { isDefault: true }
        });
        
        if (!defaultTemplate) {
            console.error('❌ No default template found!');
            console.log('💡 Run "node scripts/create-default-template.js" first to create the default template.');
            return;
        }
        
        console.log('✅ Found default template:', defaultTemplate.name);
        console.log('📝 Creating copy...');
        
        // Parse sections - they're stored as JSON string in database
        let sections = defaultTemplate.sections;
        if (typeof sections === 'string') {
            try {
                sections = JSON.parse(sections);
            } catch (e) {
                console.error('❌ Failed to parse sections:', e);
                throw new Error('Invalid template sections format');
            }
        }
        
        // Validate sections structure (must be array)
        if (!Array.isArray(sections)) {
            console.error('❌ Template sections is not an array!');
            throw new Error('Invalid template structure');
        }
        
        // Validate each section has required fields
        for (const section of sections) {
            if (!section.name) {
                console.warn('⚠️ Section missing name:', section);
            }
            if (!Array.isArray(section.documents)) {
                console.warn('⚠️ Section documents is not an array:', section);
                section.documents = [];
            }
        }
        
        // Create a copy with a new name
        const copyName = `Copy of ${defaultTemplate.name}`;
        
        // Check if a copy with this name already exists
        const existingCopy = await prisma.documentCollectionTemplate.findFirst({
            where: { 
                name: copyName,
                isDefault: false
            }
        });
        
        if (existingCopy) {
            console.log('⚠️ A copy with this name already exists:', existingCopy.id);
            console.log('💡 You may want to delete it first or use a different name.');
            return;
        }
        
        // Create the copy - match exactly how the API creates templates
        // Sections must be stringified JSON string (as the API expects)
        const sectionsString = JSON.stringify(sections);
        
        const copiedTemplate = await prisma.documentCollectionTemplate.create({
            data: {
                name: copyName,
                description: defaultTemplate.description || '',
                sections: sectionsString, // Stored as JSON string in DB
                isDefault: false, // This is a copy, not a default
                ownerId: null, // null for system-created (manually created ones get user ID from API)
                createdBy: 'System (Copy)',
                updatedBy: 'System (Copy)'
            }
        });
        
        // Verify the created template
        const verifyTemplate = await prisma.documentCollectionTemplate.findUnique({
            where: { id: copiedTemplate.id }
        });
        
        let parsedSections = [];
        try {
            parsedSections = typeof verifyTemplate.sections === 'string'
                ? JSON.parse(verifyTemplate.sections)
                : verifyTemplate.sections || [];
        } catch (e) {
            console.error('❌ Failed to parse created template sections:', e);
        }
        
        console.log('✅ Template copy created successfully!');
        console.log('📋 Copy details:');
        console.log('   ID:', copiedTemplate.id);
        console.log('   Name:', copiedTemplate.name);
        console.log('   Is Default:', copiedTemplate.isDefault);
        console.log('   Sections:', parsedSections.length);
        console.log('   Total Documents:', parsedSections.reduce((sum, sec) => sum + (sec.documents?.length || 0), 0));
        console.log('\n💡 To see this template in the UI:');
        console.log('   1. Refresh the page (templates reload on mount)');
        console.log('   2. Open the template modal (templates reload automatically)');
        console.log('   3. Or clear localStorage: localStorage.removeItem("documentCollectionTemplates")');
        
    } catch (error) {
        console.error('❌ Error copying default template:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

copyDefaultTemplate();

