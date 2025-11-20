/**
 * Script to create the Exxaro Grootegeluk document collection checklist template for 2025
 * 
 * Usage: node create-exxaro-grootegeluk-template.js
 */

const sections = [
    {
        id: 'file1',
        name: 'File 1',
        documents: [
            { id: 'file1-doc1', name: 'Mining Right', completed: false },
            { id: 'file1-doc2', name: 'CIPC Documents', completed: false },
            { id: 'file1-doc3', name: 'Diesel Refund Registration', completed: false },
            { id: 'file1-doc4', name: 'VAT Registration', completed: false },
            { id: 'file1-doc5', name: 'Title Deed / Lease Agreement', completed: false },
            { id: 'file1-doc6', name: 'Environmental Authorisations', completed: false },
            { id: 'file1-doc7', name: 'Summary of Operations and Activities', completed: false },
            { id: 'file1-doc8', name: 'Descriptions of Specialised Data Systems', completed: false },
            { id: 'file1-doc9', name: 'File 1 Explanation', completed: false }
        ]
    },
    {
        id: 'file2',
        name: 'File 2',
        documents: [
            { id: 'file2-doc1', name: 'Fuel Supply Contract', completed: false },
            { id: 'file2-doc2', name: 'Mining Contractors Contracts', completed: false },
            { id: 'file2-doc3', name: 'Sale of Product Contracts', completed: false },
            { id: 'file2-doc4', name: 'File 2 Explanation', completed: false }
        ]
    },
    {
        id: 'file3',
        name: 'File 3',
        documents: [
            { id: 'file3-doc1', name: 'Tank and Pump Configuration', completed: false },
            { id: 'file3-doc2', name: 'Diagram of Fuel System', completed: false },
            { id: 'file3-doc3', name: 'Photos of meter', completed: false },
            { id: 'file3-doc4', name: 'Delivery Notes', completed: false },
            { id: 'file3-doc5', name: 'Invoices', completed: false },
            { id: 'file3-doc6', name: 'Remittance Advices', completed: false },
            { id: 'file3-doc7', name: 'Proof of payments', completed: false },
            { id: 'file3-doc8', name: 'Tank Reconcilliations', completed: false },
            { id: 'file3-doc9', name: 'Photos of Meter Readings', completed: false },
            { id: 'file3-doc10', name: 'Meter Readings', completed: false },
            { id: 'file3-doc11', name: 'Calibration Certificates', completed: false },
            { id: 'file3-doc12', name: 'Document', completed: false }
        ]
    },
    {
        id: 'file4',
        name: 'File 4',
        documents: [
            { id: 'file4-doc1', name: 'Asset Register - Combined Assets', completed: false },
            { id: 'file4-doc2', name: 'Asset Register - Mining Assets', completed: false },
            { id: 'file4-doc3', name: 'Asset Register - Non Mining Assets', completed: false },
            { id: 'file4-doc4', name: 'Driver List', completed: false },
            { id: 'file4-doc5', name: 'File 4 Explanation', completed: false }
        ]
    },
    {
        id: 'file5',
        name: 'File 5',
        documents: [
            { id: 'file5-doc1', name: 'Description and Literature of FMS', completed: false },
            { id: 'file5-doc2', name: 'FMS Raw Data', completed: false },
            { id: 'file5-doc3', name: 'Detailed Fuel Refund Report', completed: false },
            { id: 'file5-doc4', name: 'Fuel Refund Logbook Per Asset', completed: false },
            { id: 'file5-doc5', name: 'Claim Comparison [if applicable]', completed: false },
            { id: 'file5-doc6', name: 'File 5 Explanation', completed: false }
        ]
    },
    {
        id: 'file6',
        name: 'File 6',
        documents: [
            { id: 'file6-doc1', name: 'Monthly Survey Reports', completed: false },
            { id: 'file6-doc2', name: 'Production Reports', completed: false },
            { id: 'file6-doc3', name: 'Asset Activity Reports', completed: false },
            { id: 'file6-doc4', name: 'Asset Tagging Reports', completed: false },
            { id: 'file6-doc5', name: 'Diesel Cost Component', completed: false },
            { id: 'file6-doc6', name: 'Sales of Coal', completed: false },
            { id: 'file6-doc7', name: 'Weighbridge Data', completed: false },
            { id: 'file6-doc8', name: 'Contractor Invoices', completed: false },
            { id: 'file6-doc9', name: 'Contractor Remittances', completed: false },
            { id: 'file6-doc10', name: 'Contractor Proof of payment', completed: false },
            { id: 'file6-doc11', name: 'File 6 Explanation', completed: false }
        ]
    },
    {
        id: 'file7',
        name: 'File 7',
        documents: [
            { id: 'file7-doc1', name: 'Annual Financial Statements', completed: false },
            { id: 'file7-doc2', name: 'Management Accounts', completed: false },
            { id: 'file7-doc3', name: 'Any deviations (theft, loss etc)', completed: false },
            { id: 'file7-doc4', name: 'Fuel Caps Exceeded', completed: false },
            { id: 'file7-doc5', name: 'VAT 201 - Monthly', completed: false },
            { id: 'file7-doc6', name: 'File 7 Explanation', completed: false }
        ]
    }
];

// Convert sections to the format expected by MonthlyDocumentCollectionTracker
// The tracker expects documents with collectionStatus and comments objects
const convertToTrackerFormat = (sections) => {
    return sections.map(section => ({
        id: section.id,
        name: section.name,
        documents: section.documents.map(doc => ({
            id: doc.id,
            name: doc.name,
            collectionStatus: {},
            comments: {}
        }))
    }));
};

const templateData = {
    name: 'Exxaro Grootegeluk document collection checklist for 2025',
    description: 'Document collection checklist template for Exxaro Grootegeluk project for the year 2025',
    sections: convertToTrackerFormat(sections),
    isDefault: false
};

console.log('Template data prepared:');
console.log(JSON.stringify(templateData, null, 2));
console.log('\nTotal sections:', templateData.sections.length);
console.log('Total documents:', templateData.sections.reduce((sum, section) => sum + section.documents.length, 0));

// Export for use in API call
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { templateData, sections };
}


