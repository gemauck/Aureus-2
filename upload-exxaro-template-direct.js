/**
 * Direct script to upload Exxaro Grootegeluk document collection checklist template
 * This script inserts the template directly into the database using Prisma
 * 
 * Usage: node upload-exxaro-template-direct.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Template data
const templateData = {
    name: 'Exxaro Grootegeluk document collection checklist for 2025',
    description: 'Document collection checklist template for Exxaro Grootegeluk project for the year 2025',
    sections: [
        {
            id: 'file1',
            name: 'File 1',
            documents: [
                { id: 'file1-doc1', name: 'Mining Right', collectionStatus: {}, comments: {} },
                { id: 'file1-doc2', name: 'CIPC Documents', collectionStatus: {}, comments: {} },
                { id: 'file1-doc3', name: 'Diesel Refund Registration', collectionStatus: {}, comments: {} },
                { id: 'file1-doc4', name: 'VAT Registration', collectionStatus: {}, comments: {} },
                { id: 'file1-doc5', name: 'Title Deed / Lease Agreement', collectionStatus: {}, comments: {} },
                { id: 'file1-doc6', name: 'Environmental Authorisations', collectionStatus: {}, comments: {} },
                { id: 'file1-doc7', name: 'Summary of Operations and Activities', collectionStatus: {}, comments: {} },
                { id: 'file1-doc8', name: 'Descriptions of Specialised Data Systems', collectionStatus: {}, comments: {} },
                { id: 'file1-doc9', name: 'File 1 Explanation', collectionStatus: {}, comments: {} }
            ]
        },
        {
            id: 'file2',
            name: 'File 2',
            documents: [
                { id: 'file2-doc1', name: 'Fuel Supply Contract', collectionStatus: {}, comments: {} },
                { id: 'file2-doc2', name: 'Mining Contractors Contracts', collectionStatus: {}, comments: {} },
                { id: 'file2-doc3', name: 'Sale of Product Contracts', collectionStatus: {}, comments: {} },
                { id: 'file2-doc4', name: 'File 2 Explanation', collectionStatus: {}, comments: {} }
            ]
        },
        {
            id: 'file3',
            name: 'File 3',
            documents: [
                { id: 'file3-doc1', name: 'Tank and Pump Configuration', collectionStatus: {}, comments: {} },
                { id: 'file3-doc2', name: 'Diagram of Fuel System', collectionStatus: {}, comments: {} },
                { id: 'file3-doc3', name: 'Photos of meter', collectionStatus: {}, comments: {} },
                { id: 'file3-doc4', name: 'Delivery Notes', collectionStatus: {}, comments: {} },
                { id: 'file3-doc5', name: 'Invoices', collectionStatus: {}, comments: {} },
                { id: 'file3-doc6', name: 'Remittance Advices', collectionStatus: {}, comments: {} },
                { id: 'file3-doc7', name: 'Proof of payments', collectionStatus: {}, comments: {} },
                { id: 'file3-doc8', name: 'Tank Reconcilliations', collectionStatus: {}, comments: {} },
                { id: 'file3-doc9', name: 'Photos of Meter Readings', collectionStatus: {}, comments: {} },
                { id: 'file3-doc10', name: 'Meter Readings', collectionStatus: {}, comments: {} },
                { id: 'file3-doc11', name: 'Calibration Certificates', collectionStatus: {}, comments: {} },
                { id: 'file3-doc12', name: 'Document', collectionStatus: {}, comments: {} }
            ]
        },
        {
            id: 'file4',
            name: 'File 4',
            documents: [
                { id: 'file4-doc1', name: 'Asset Register - Combined Assets', collectionStatus: {}, comments: {} },
                { id: 'file4-doc2', name: 'Asset Register - Mining Assets', collectionStatus: {}, comments: {} },
                { id: 'file4-doc3', name: 'Asset Register - Non Mining Assets', collectionStatus: {}, comments: {} },
                { id: 'file4-doc4', name: 'Driver List', collectionStatus: {}, comments: {} },
                { id: 'file4-doc5', name: 'File 4 Explanation', collectionStatus: {}, comments: {} }
            ]
        },
        {
            id: 'file5',
            name: 'File 5',
            documents: [
                { id: 'file5-doc1', name: 'Description and Literature of FMS', collectionStatus: {}, comments: {} },
                { id: 'file5-doc2', name: 'FMS Raw Data', collectionStatus: {}, comments: {} },
                { id: 'file5-doc3', name: 'Detailed Fuel Refund Report', collectionStatus: {}, comments: {} },
                { id: 'file5-doc4', name: 'Fuel Refund Logbook Per Asset', collectionStatus: {}, comments: {} },
                { id: 'file5-doc5', name: 'Claim Comparison [if applicable]', collectionStatus: {}, comments: {} },
                { id: 'file5-doc6', name: 'File 5 Explanation', collectionStatus: {}, comments: {} }
            ]
        },
        {
            id: 'file6',
            name: 'File 6',
            documents: [
                { id: 'file6-doc1', name: 'Monthly Survey Reports', collectionStatus: {}, comments: {} },
                { id: 'file6-doc2', name: 'Production Reports', collectionStatus: {}, comments: {} },
                { id: 'file6-doc3', name: 'Asset Activity Reports', collectionStatus: {}, comments: {} },
                { id: 'file6-doc4', name: 'Asset Tagging Reports', collectionStatus: {}, comments: {} },
                { id: 'file6-doc5', name: 'Diesel Cost Component', collectionStatus: {}, comments: {} },
                { id: 'file6-doc6', name: 'Sales of Coal', collectionStatus: {}, comments: {} },
                { id: 'file6-doc7', name: 'Weighbridge Data', collectionStatus: {}, comments: {} },
                { id: 'file6-doc8', name: 'Contractor Invoices', collectionStatus: {}, comments: {} },
                { id: 'file6-doc9', name: 'Contractor Remittances', collectionStatus: {}, comments: {} },
                { id: 'file6-doc10', name: 'Contractor Proof of payment', collectionStatus: {}, comments: {} },
                { id: 'file6-doc11', name: 'File 6 Explanation', collectionStatus: {}, comments: {} }
            ]
        },
        {
            id: 'file7',
            name: 'File 7',
            documents: [
                { id: 'file7-doc1', name: 'Annual Financial Statements', collectionStatus: {}, comments: {} },
                { id: 'file7-doc2', name: 'Management Accounts', collectionStatus: {}, comments: {} },
                { id: 'file7-doc3', name: 'Any deviations (theft, loss etc)', collectionStatus: {}, comments: {} },
                { id: 'file7-doc4', name: 'Fuel Caps Exceeded', collectionStatus: {}, comments: {} },
                { id: 'file7-doc5', name: 'VAT 201 - Monthly', collectionStatus: {}, comments: {} },
                { id: 'file7-doc6', name: 'File 7 Explanation', collectionStatus: {}, comments: {} }
            ]
        }
    ],
    // Mark this as a default template so it shows first and can be used as a base
    isDefault: true
};

async function uploadTemplate() {
    try {
        console.log('📤 Uploading Exxaro Grootegeluk template...');
        console.log('Template name:', templateData.name);
        console.log('Total sections:', templateData.sections.length);
        console.log('Total documents:', templateData.sections.reduce((sum, s) => sum + s.documents.length, 0));
        console.log('');

        // Check if template already exists
        const existingTemplate = await prisma.documentCollectionTemplate.findFirst({
            where: {
                name: templateData.name
            }
        });

        if (existingTemplate) {
            console.log('⚠️  Template with this name already exists!');
            console.log('Existing template ID:', existingTemplate.id);
            console.log('');
            console.log('Updating existing template...');
            
            // Update existing template
            const updated = await prisma.documentCollectionTemplate.update({
                where: {
                    id: existingTemplate.id
                },
                data: {
                    description: templateData.description,
                    sections: JSON.stringify(templateData.sections),
                    isDefault: templateData.isDefault,
                    updatedBy: 'System Script'
                }
            });

            console.log('✅ Template updated successfully!');
            console.log('Template ID:', updated.id);
            return updated;
        } else {
            // Create new template
            const created = await prisma.documentCollectionTemplate.create({
                data: {
                    name: templateData.name,
                    description: templateData.description,
                    sections: JSON.stringify(templateData.sections),
                    isDefault: templateData.isDefault,
                    createdBy: 'System Script',
                    updatedBy: 'System Script'
                }
            });

            console.log('✅ Template created successfully!');
            console.log('Template ID:', created.id);
            console.log('');
            console.log('📋 Template Summary:');
            console.log('   Name:', created.name);
            console.log('   Sections:', templateData.sections.length);
            console.log('   Documents:', templateData.sections.reduce((sum, s) => sum + s.documents.length, 0));
            return created;
        }
    } catch (error) {
        console.error('❌ Error uploading template:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run the upload
uploadTemplate()
    .then(() => {
        console.log('');
        console.log('🎉 Upload completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Upload failed:', error);
        process.exit(1);
    });




