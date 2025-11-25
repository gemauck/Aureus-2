/**
 * Script to delete all document sections for year 2018 from Thungela Isibonelo project
 * 
 * Usage:
 *   node delete-2018-documents.js
 * 
 * This script will:
 * 1. Find the "Thungela Isibonelo Diesel Refunds" project
 * 2. Load its documentSections
 * 3. Remove all sections/data for year 2018
 * 4. Save the updated documentSections back to the database
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function delete2018Documents() {
    try {
        console.log('🔍 Finding "Thungela Isibonelo Diesel Refunds" project...');
        
        // Find the project
        const project = await prisma.project.findFirst({
            where: {
                name: {
                    contains: 'Thungela Isibonelo',
                    mode: 'insensitive'
                }
            }
        });

        if (!project) {
            console.error('❌ Project not found');
            return;
        }

        console.log(`✅ Found project: ${project.name} (ID: ${project.id})`);
        console.log('📖 Current documentSections length:', project.documentSections?.length || 0);

        // Parse documentSections
        let sections = [];
        try {
            if (project.documentSections) {
                sections = typeof project.documentSections === 'string' 
                    ? JSON.parse(project.documentSections)
                    : project.documentSections;
            }
        } catch (e) {
            console.error('❌ Error parsing documentSections:', e);
            return;
        }

        console.log(`📊 Found ${sections.length} sections total`);

        // Filter out sections that belong to 2018
        // Sections for 2018 are identified by checking their documents' collectionStatus
        // which contains month keys like "2018-01", "2018-02", etc.
        const sectionsToKeep = [];
        let sectionsDeleted = 0;
        let documentsDeleted = 0;

        sections.forEach((section, sectionIndex) => {
            // Check for template marker for 2018 - if found, delete entire section
            let has2018TemplateMarker = false;
            section.documents?.forEach(doc => {
                if (doc.collectionStatus) {
                    Object.keys(doc.collectionStatus).forEach(key => {
                        if (key === '_template-2018') {
                            has2018TemplateMarker = true;
                        }
                    });
                }
            });

            if (has2018TemplateMarker) {
                // Section is marked as template for 2018 only - delete entire section
                console.log(`   🗑️  Deleting section with 2018 template marker: ${section.name || section.id}`);
                sectionsDeleted++;
                return;
            }

            // Check if this section has any 2018 data (month keys like 2018-01, 2018-02, etc.)
            const has2018Data = section.documents?.some(doc => {
                // Check collectionStatus
                if (doc.collectionStatus) {
                    if (Object.keys(doc.collectionStatus).some(key => key.startsWith('2018-'))) {
                        return true;
                    }
                }
                // Check comments
                if (doc.comments) {
                    if (Object.keys(doc.comments).some(key => key.startsWith('2018-'))) {
                        return true;
                    }
                }
                // Check cellColors
                if (doc.cellColors) {
                    if (Object.keys(doc.cellColors).some(key => key.startsWith('2018-'))) {
                        return true;
                    }
                }
                return false;
            });

            if (!has2018Data) {
                // Section doesn't have 2018 data, keep it as-is
                sectionsToKeep.push(section);
            } else {
                // Section has 2018 data - remove 2018 data from all documents
                const cleanedSection = {
                    ...section,
                    documents: section.documents?.map(doc => {
                        let had2018Data = false;

                        // Clean collectionStatus
                        const cleanedStatus = doc.collectionStatus ? { ...doc.collectionStatus } : {};
                        Object.keys(cleanedStatus).forEach(key => {
                            if (key.startsWith('2018-') || key === '_template-2018') {
                                delete cleanedStatus[key];
                                had2018Data = true;
                                documentsDeleted++;
                            }
                        });

                        // Clean comments
                        const cleanedComments = doc.comments ? { ...doc.comments } : {};
                        Object.keys(cleanedComments).forEach(key => {
                            if (key.startsWith('2018-')) {
                                delete cleanedComments[key];
                                had2018Data = true;
                            }
                        });

                        // Clean cellColors
                        const cleanedCellColors = doc.cellColors ? { ...doc.cellColors } : {};
                        Object.keys(cleanedCellColors).forEach(key => {
                            if (key.startsWith('2018-')) {
                                delete cleanedCellColors[key];
                                had2018Data = true;
                            }
                        });

                        return {
                            ...doc,
                            collectionStatus: Object.keys(cleanedStatus).length > 0 ? cleanedStatus : (doc.collectionStatus || {}),
                            comments: Object.keys(cleanedComments).length > 0 ? cleanedComments : (doc.comments || {}),
                            cellColors: Object.keys(cleanedCellColors).length > 0 ? cleanedCellColors : (doc.cellColors || {})
                        };
                    })
                };

                // Keep the cleaned section
                sectionsToKeep.push(cleanedSection);
            }
        });

        console.log(`\n📊 Deletion Summary:`);
        console.log(`   - Sections to keep: ${sectionsToKeep.length}`);
        console.log(`   - Sections deleted: ${sectionsDeleted}`);
        console.log(`   - Documents with 2018 data cleaned: ${documentsDeleted}`);

        // Update the project
        const updatedSectionsJson = JSON.stringify(sectionsToKeep);
        
        console.log(`\n💾 Saving updated documentSections...`);
        await prisma.project.update({
            where: { id: project.id },
            data: {
                documentSections: updatedSectionsJson
            }
        });

        console.log('✅ Successfully deleted all 2018 document data!');
        console.log(`📉 New documentSections length: ${updatedSectionsJson.length}`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the script
delete2018Documents();

