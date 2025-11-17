// Script to create the default document collection template in the database
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const defaultTemplate = {
    name: 'Document Collection Checklist (Default)',
    description: 'Standard document collection checklist with 7 files and all required documents',
    isDefault: true,
    sections: [
        {
            name: 'File 1',
            description: '',
            documents: [
                { name: 'Mining Right', description: '' },
                { name: 'CIPC Documents', description: '' },
                { name: 'Diesel Refund Registration', description: '' },
                { name: 'VAT Registration', description: '' },
                { name: 'Title Deed / Lease Agreement', description: '' },
                { name: 'Environmental Authorisations', description: '' },
                { name: 'Summary of Operations and Activities', description: '' },
                { name: 'Descriptions of Specialised Data Systems', description: '' },
                { name: 'File 1 Explanation', description: '' }
            ]
        },
        {
            name: 'File 2',
            description: '',
            documents: [
                { name: 'Fuel Supply Contract', description: '' },
                { name: 'Mining Contractors Contracts', description: '' },
                { name: 'Sale of Product Contracts', description: '' },
                { name: 'File 2 Explanation', description: '' }
            ]
        },
        {
            name: 'File 3',
            description: '',
            documents: [
                { name: 'Tank and Pump Configuration', description: '' },
                { name: 'Diagram of Fuel System', description: '' },
                { name: 'Photos of meter', description: '' },
                { name: 'Delivery Notes', description: '' },
                { name: 'Invoices', description: '' },
                { name: 'Remittance Advices', description: '' },
                { name: 'Proof of payments', description: '' },
                { name: 'Tank Reconcilliations', description: '' },
                { name: 'Photos of Meter Readings', description: '' },
                { name: 'Meter Readings', description: '' },
                { name: 'Calibration Certificates', description: '' },
                { name: 'Document', description: '' }
            ]
        },
        {
            name: 'File 4',
            description: '',
            documents: [
                { name: 'Asset Register - Combined Assets', description: '' },
                { name: 'Asset Register - Mining Assets', description: '' },
                { name: 'Asset Register - Non Mining Assets', description: '' },
                { name: 'Driver List', description: '' },
                { name: 'File 4 Explanation', description: '' }
            ]
        },
        {
            name: 'File 5',
            description: '',
            documents: [
                { name: 'Description and Literature of FMS', description: '' },
                { name: 'FMS Raw Data', description: '' },
                { name: 'Detailed Fuel Refund Report', description: '' },
                { name: 'Fuel Refund Logbook Per Asset', description: '' },
                { name: 'Claim Comparison [if applicable]', description: '' },
                { name: 'File 5 Explanation', description: '' }
            ]
        },
        {
            name: 'File 6',
            description: '',
            documents: [
                { name: 'Monthly Survey Reports', description: '' },
                { name: 'Production Reports', description: '' },
                { name: 'Asset Activity Reports', description: '' },
                { name: 'Asset Tagging Reports', description: '' },
                { name: 'Diesel Cost Component', description: '' },
                { name: 'Sales of Coal', description: '' },
                { name: 'Weighbridge Data', description: '' },
                { name: 'Contractor Invoices', description: '' },
                { name: 'Contractor Remittances', description: '' },
                { name: 'Contractor Proof of payment', description: '' },
                { name: 'File 6 Explanation', description: '' }
            ]
        },
        {
            name: 'File 7',
            description: '',
            documents: [
                { name: 'Annual Financial Statements', description: '' },
                { name: 'Management Accounts', description: '' },
                { name: 'Any deviations (theft, loss etc)', description: '' },
                { name: 'Fuel Caps Exceeded', description: '' },
                { name: 'VAT 201 - Monthly', description: '' },
                { name: 'File 7 Explanation', description: '' }
            ]
        }
    ],
    createdBy: 'System',
    updatedBy: 'System'
};

async function createDefaultTemplate() {
    try {
        console.log('📋 Checking for existing default template...');
        
        // Check if default template already exists
        const existing = await prisma.documentCollectionTemplate.findFirst({
            where: { isDefault: true }
        });
        
        if (existing) {
            console.log('✅ Default template already exists:', existing.id);
            console.log('📝 Updating existing template...');
            
            // Update existing template
            const updated = await prisma.documentCollectionTemplate.update({
                where: { id: existing.id },
                data: {
                    name: defaultTemplate.name,
                    description: defaultTemplate.description,
                    sections: JSON.stringify(defaultTemplate.sections),
                    updatedBy: 'System'
                }
            });
            
            console.log('✅ Default template updated successfully:', updated.id);
        } else {
            console.log('📝 Creating new default template...');
            
            // Create new template
            const created = await prisma.documentCollectionTemplate.create({
                data: {
                    name: defaultTemplate.name,
                    description: defaultTemplate.description,
                    sections: JSON.stringify(defaultTemplate.sections),
                    isDefault: true,
                    createdBy: defaultTemplate.createdBy,
                    updatedBy: defaultTemplate.updatedBy
                }
            });
            
            console.log('✅ Default template created successfully:', created.id);
        }
        
        console.log('🎉 Template setup complete!');
    } catch (error) {
        console.error('❌ Error creating default template:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

createDefaultTemplate();

