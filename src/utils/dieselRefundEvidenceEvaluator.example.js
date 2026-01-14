/**
 * Diesel Refund Evidence Evaluator - Usage Examples
 * 
 * This file demonstrates how to use the evaluateDieselRefundEvidence function
 * with various types of data.
 */

// Example 1: Evaluate an invoice document
const invoiceData = {
    invoiceNumber: 'INV-2025-001',
    date: '2025-01-15',
    supplier: 'ABC Fuel Supplies',
    amount: 125000.00,
    items: [
        { description: 'Diesel', quantity: 5000, unitPrice: 25.00 }
    ],
    vatAmount: 18750.00,
    total: 143750.00
};

const invoiceResult = evaluateDieselRefundEvidence(invoiceData);
console.log('Invoice Evaluation:', invoiceResult);
// Expected: {
//   isValid: true,
//   evidenceType: 'Invoices',
//   fileCategory: 'File 3',
//   relevanceScore: 90+,
//   criteria: { hasRequiredFields: true, hasValidDates: true, hasValidAmounts: true, ... }
// }

// Example 2: Evaluate a meter reading
const meterReadingData = {
    meterNumber: 'MTR-001',
    reading: 125000.50,
    date: '2025-01-15',
    readingType: 'fuel_dispensed',
    assetId: 'ASSET-123',
    location: 'Mine Site A'
};

const meterResult = evaluateDieselRefundEvidence(meterReadingData);
console.log('Meter Reading Evaluation:', meterResult);
// Expected: {
//   isValid: true,
//   evidenceType: 'Meter Readings',
//   fileCategory: 'File 3',
//   ...
// }

// Example 3: Evaluate a mining right document
const miningRightData = {
    registrationNumber: 'MR-2024-12345',
    issueDate: '2024-01-01',
    expiryDate: '2029-01-01',
    holderName: 'ABC Mining Company (Pty) Ltd',
    mineralRights: ['Coal'],
    area: '100 hectares'
};

const miningRightResult = evaluateDieselRefundEvidence(miningRightData);
console.log('Mining Right Evaluation:', miningRightResult);
// Expected: {
//   isValid: true,
//   evidenceType: 'Mining Right',
//   fileCategory: 'File 1',
//   ...
// }

// Example 4: Evaluate FMS raw data
const fmsData = {
    date: '2025-01-15',
    assetId: 'ASSET-123',
    fuelQuantity: 500.25,
    location: 'Mine Site A',
    transactionType: 'fuel_dispensed',
    driverId: 'DRV-001',
    odometerReading: 125000
};

const fmsResult = evaluateDieselRefundEvidence(fmsData, { projectId: 'proj-123' });
console.log('FMS Data Evaluation:', fmsResult);
// Expected: {
//   isValid: true,
//   evidenceType: 'FMS Raw Data',
//   fileCategory: 'File 5',
//   ...
// }

// Example 5: Evaluate a file object (simulated)
const fileData = {
    fileName: 'Delivery_Note_2025_01_15.pdf',
    fileType: 'application/pdf',
    fileSize: 245760,
    lastModified: new Date('2025-01-15').getTime(),
    content: {
        deliveryNoteNumber: 'DN-2025-001',
        date: '2025-01-15',
        supplier: 'XYZ Fuel Company',
        quantity: 10000,
        vehicle: 'TRUCK-001'
    }
};

const fileResult = evaluateDieselRefundEvidence(fileData);
console.log('File Evaluation:', fileResult);
// Expected: {
//   isValid: true,
//   evidenceType: 'Delivery Notes',
//   fileCategory: 'File 3',
//   ...
// }

// Example 6: Evaluate incomplete data (should show issues)
const incompleteData = {
    invoiceNumber: 'INV-001'
    // Missing date, supplier, amount, etc.
};

const incompleteResult = evaluateDieselRefundEvidence(incompleteData);
console.log('Incomplete Data Evaluation:', incompleteResult);
// Expected: {
//   isValid: false,
//   issues: ['Missing required fields: date, supplier, amount, items', 'No dates detected...'],
//   recommendations: ['Add the following fields: date, supplier, amount, items', ...]
// }

// Example 7: Evaluate a string (JSON)
const jsonString = JSON.stringify({
    reportPeriod: '2025-01',
    totalRefund: 500000.00,
    assetBreakdown: [
        { assetId: 'ASSET-123', refund: 250000 },
        { assetId: 'ASSET-456', refund: 250000 }
    ],
    calculations: 'Based on FMS data and production reports'
});

const stringResult = evaluateDieselRefundEvidence(jsonString);
console.log('String Evaluation:', stringResult);
// Expected: {
//   isValid: true,
//   evidenceType: 'Detailed Fuel Refund Report',
//   fileCategory: 'File 5',
//   ...
// }

// Example 8: Evaluate with strict mode
const strictResult = evaluateDieselRefundEvidence(invoiceData, { strict: true });
console.log('Strict Mode Evaluation:', strictResult);
// Strict mode applies more rigorous validation rules

// Example 9: Batch evaluation of multiple documents
const documents = [
    invoiceData,
    meterReadingData,
    miningRightData,
    fmsData
];

const batchResults = documents.map(doc => evaluateDieselRefundEvidence(doc));
console.log('Batch Evaluation Results:', batchResults);

// Example 10: Filter valid evidence
const validEvidence = batchResults.filter(result => result.isValid);
console.log('Valid Evidence Count:', validEvidence.length);

// Example 11: Get evidence by file category
const file3Evidence = batchResults.filter(result => result.fileCategory === 'File 3');
console.log('File 3 Evidence:', file3Evidence);

// Example 12: Sort by relevance score
const sortedByRelevance = batchResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
console.log('Sorted by Relevance:', sortedByRelevance);










