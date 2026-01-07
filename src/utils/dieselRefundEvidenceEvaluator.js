/**
 * Diesel Refund Evidence Evaluator
 * 
 * This utility function evaluates any piece of data to determine if it qualifies
 * as evidence for diesel refund claims. It analyzes the data structure, content,
 * and metadata to classify it according to the standard diesel refund documentation
 * requirements.
 * 
 * @param {*} data - Any piece of data to evaluate (object, string, file, etc.)
 * @param {Object} options - Optional configuration
 * @param {boolean} options.strict - If true, applies stricter validation rules
 * @param {string} options.projectId - Optional project ID for context
 * @returns {Object} Evaluation result with classification and validation details
 */

const evaluateDieselRefundEvidence = (data, options = {}) => {
    const { strict = false, projectId = null } = options;
    
    // Initialize result structure
    const result = {
        isValid: false,
        evidenceType: null,
        fileCategory: null,
        documentType: null,
        relevanceScore: 0, // 0-100
        criteria: {
            hasRequiredFields: false,
            hasValidDates: false,
            hasValidAmounts: false,
            hasSupportingDocuments: false,
            isComplete: false
        },
        issues: [],
        recommendations: [],
        metadata: {
            detectedFields: [],
            detectedDates: [],
            detectedAmounts: [],
            detectedEntities: []
        }
    };

    // Handle null/undefined
    if (data === null || data === undefined) {
        result.issues.push('Data is null or undefined');
        return result;
    }

    // Normalize data - handle different input types
    let normalizedData = data;
    
    // If it's a string, try to parse as JSON
    if (typeof data === 'string') {
        try {
            normalizedData = JSON.parse(data);
        } catch (e) {
            // If not JSON, treat as plain text
            normalizedData = { content: data, type: 'text' };
        }
    }

    // If it's a File object, extract metadata
    if (data instanceof File || (data && data.name && data.type)) {
        normalizedData = {
            fileName: data.name || data.fileName,
            fileType: data.type || data.fileType,
            fileSize: data.size || data.fileSize,
            lastModified: data.lastModified || data.lastModified,
            ...(data.content ? { content: data.content } : {})
        };
    }

    // Extract all possible fields from the data
    const extractFields = (obj, prefix = '') => {
        const fields = [];
        if (typeof obj !== 'object' || obj === null) return fields;
        
        for (const [key, value] of Object.entries(obj)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            fields.push(fullKey.toLowerCase());
            
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                fields.push(...extractFields(value, fullKey));
            }
        }
        return fields;
    };

    const allFields = extractFields(normalizedData);
    result.metadata.detectedFields = allFields;

    // Detect dates in the data
    const detectDates = (obj) => {
        const dates = [];
        if (typeof obj !== 'object' || obj === null) return dates;
        
        for (const [key, value] of Object.entries(obj)) {
            const keyLower = key.toLowerCase();
            if (keyLower.includes('date') || keyLower.includes('time') || 
                keyLower.includes('created') || keyLower.includes('updated') ||
                keyLower.includes('issued') || keyLower.includes('expir')) {
                if (value) {
                    dates.push({ field: key, value: value });
                }
            }
            if (typeof value === 'object' && value !== null) {
                dates.push(...detectDates(value));
            }
        }
        return dates;
    };

    result.metadata.detectedDates = detectDates(normalizedData);

    // Detect amounts/monetary values
    const detectAmounts = (obj) => {
        const amounts = [];
        if (typeof obj !== 'object' || obj === null) return amounts;
        
        for (const [key, value] of Object.entries(obj)) {
            const keyLower = key.toLowerCase();
            if (keyLower.includes('amount') || keyLower.includes('price') || 
                keyLower.includes('cost') || keyLower.includes('total') ||
                keyLower.includes('value') || keyLower.includes('fee') ||
                keyLower.includes('charge') || keyLower.includes('payment')) {
                if (typeof value === 'number' || (typeof value === 'string' && /[\d.,]+/.test(value))) {
                    amounts.push({ field: key, value: value });
                }
            }
            if (typeof value === 'object' && value !== null) {
                amounts.push(...detectAmounts(value));
            }
        }
        return amounts;
    };

    result.metadata.detectedAmounts = detectAmounts(normalizedData);

    // Detect entities (companies, names, etc.)
    const detectEntities = (obj) => {
        const entities = [];
        if (typeof obj !== 'object' || obj === null) return entities;
        
        const entityFields = ['name', 'company', 'client', 'supplier', 'contractor', 
                              'vendor', 'entity', 'organization', 'business'];
        
        for (const [key, value] of Object.entries(obj)) {
            const keyLower = key.toLowerCase();
            if (entityFields.some(field => keyLower.includes(field)) && value) {
                entities.push({ field: key, value: value });
            }
            if (typeof value === 'object' && value !== null) {
                entities.push(...detectEntities(value));
            }
        }
        return entities;
    };

    result.metadata.detectedEntities = detectEntities(normalizedData);

    // Classification logic based on document checklist structure
    const classifyEvidence = () => {
        const dataStr = JSON.stringify(normalizedData).toLowerCase();
        const fileName = (normalizedData.fileName || normalizedData.name || '').toLowerCase();
        const fileType = (normalizedData.fileType || normalizedData.type || '').toLowerCase();
        
        // FILE 1: Registration and Legal Documents
        if (dataStr.includes('mining right') || fileName.includes('mining right') ||
            dataStr.includes('miningright') || fileName.includes('miningright')) {
            return {
                fileCategory: 'File 1',
                documentType: 'Mining Right',
                requiredFields: ['registrationNumber', 'issueDate', 'expiryDate', 'holderName']
            };
        }
        
        if (dataStr.includes('cipc') || fileName.includes('cipc') ||
            dataStr.includes('company registration') || fileName.includes('company')) {
            return {
                fileCategory: 'File 1',
                documentType: 'CIPC Documents',
                requiredFields: ['registrationNumber', 'companyName', 'registrationDate']
            };
        }
        
        if (dataStr.includes('diesel refund registration') || 
            fileName.includes('diesel') && fileName.includes('registration')) {
            return {
                fileCategory: 'File 1',
                documentType: 'Diesel Refund Registration',
                requiredFields: ['registrationNumber', 'registrationDate', 'status']
            };
        }
        
        if (dataStr.includes('vat registration') || fileName.includes('vat') ||
            dataStr.includes('value added tax')) {
            return {
                fileCategory: 'File 1',
                documentType: 'VAT Registration',
                requiredFields: ['vatNumber', 'registrationDate', 'status']
            };
        }
        
        if (dataStr.includes('title deed') || dataStr.includes('lease agreement') ||
            fileName.includes('title') || fileName.includes('lease')) {
            return {
                fileCategory: 'File 1',
                documentType: 'Title Deed / Lease Agreement',
                requiredFields: ['propertyDescription', 'ownerName', 'date', 'registrationNumber']
            };
        }
        
        if (dataStr.includes('environmental') || fileName.includes('environmental')) {
            return {
                fileCategory: 'File 1',
                documentType: 'Environmental Authorisations',
                requiredFields: ['authorisationNumber', 'issueDate', 'expiryDate']
            };
        }
        
        // FILE 2: Contracts
        if (dataStr.includes('fuel supply contract') || 
            fileName.includes('fuel') && fileName.includes('contract')) {
            return {
                fileCategory: 'File 2',
                documentType: 'Fuel Supply Contract',
                requiredFields: ['contractNumber', 'supplierName', 'startDate', 'endDate', 'terms']
            };
        }
        
        if (dataStr.includes('mining contractor') || fileName.includes('contractor')) {
            return {
                fileCategory: 'File 2',
                documentType: 'Mining Contractors Contracts',
                requiredFields: ['contractNumber', 'contractorName', 'startDate', 'endDate']
            };
        }
        
        if (dataStr.includes('sale of product') || fileName.includes('sale')) {
            return {
                fileCategory: 'File 2',
                documentType: 'Sale of Product Contracts',
                requiredFields: ['contractNumber', 'buyerName', 'productDescription', 'terms']
            };
        }
        
        // FILE 3: Fuel System and Transactions
        if (dataStr.includes('tank') && (dataStr.includes('pump') || dataStr.includes('configuration'))) {
            return {
                fileCategory: 'File 3',
                documentType: 'Tank and Pump Configuration',
                requiredFields: ['tankNumber', 'capacity', 'location', 'pumpDetails']
            };
        }
        
        if (dataStr.includes('fuel system') || dataStr.includes('diagram')) {
            return {
                fileCategory: 'File 3',
                documentType: 'Diagram of Fuel System',
                requiredFields: ['diagramType', 'date', 'approval']
            };
        }
        
        if (dataStr.includes('meter reading') || fileName.includes('meter')) {
            return {
                fileCategory: 'File 3',
                documentType: 'Meter Readings',
                requiredFields: ['meterNumber', 'reading', 'date', 'readingType']
            };
        }
        
        if (dataStr.includes('delivery note') || fileName.includes('delivery')) {
            return {
                fileCategory: 'File 3',
                documentType: 'Delivery Notes',
                requiredFields: ['deliveryNoteNumber', 'date', 'supplier', 'quantity', 'vehicle']
            };
        }
        
        if (dataStr.includes('invoice') && !dataStr.includes('contractor')) {
            return {
                fileCategory: 'File 3',
                documentType: 'Invoices',
                requiredFields: ['invoiceNumber', 'date', 'supplier', 'amount', 'items']
            };
        }
        
        if (dataStr.includes('remittance') || fileName.includes('remittance')) {
            return {
                fileCategory: 'File 3',
                documentType: 'Remittance Advices',
                requiredFields: ['remittanceNumber', 'date', 'amount', 'reference']
            };
        }
        
        if (dataStr.includes('proof of payment') || fileName.includes('payment')) {
            return {
                fileCategory: 'File 3',
                documentType: 'Proof of payments',
                requiredFields: ['paymentDate', 'amount', 'reference', 'method']
            };
        }
        
        if (dataStr.includes('tank reconciliation') || fileName.includes('reconciliation')) {
            return {
                fileCategory: 'File 3',
                documentType: 'Tank Reconciliations',
                requiredFields: ['tankNumber', 'date', 'openingBalance', 'deliveries', 'usage', 'closingBalance']
            };
        }
        
        if (dataStr.includes('calibration') || fileName.includes('calibration')) {
            return {
                fileCategory: 'File 3',
                documentType: 'Calibration Certificates',
                requiredFields: ['certificateNumber', 'date', 'equipment', 'calibrationDate', 'nextCalibration']
            };
        }
        
        // FILE 4: Asset Registers and Lists
        if (dataStr.includes('asset register') || fileName.includes('asset')) {
            const isMining = dataStr.includes('mining');
            const isNonMining = dataStr.includes('non') && dataStr.includes('mining');
            
            return {
                fileCategory: 'File 4',
                documentType: isMining ? 'Asset Register - Mining Assets' : 
                             isNonMining ? 'Asset Register - Non Mining Assets' :
                             'Asset Register - Combined Assets',
                requiredFields: ['assetNumber', 'description', 'category', 'location', 'status']
            };
        }
        
        if (dataStr.includes('driver list') || fileName.includes('driver')) {
            return {
                fileCategory: 'File 4',
                documentType: 'Driver List',
                requiredFields: ['driverName', 'licenseNumber', 'vehicle', 'status']
            };
        }
        
        // FILE 5: FMS and Fuel Refund Reports
        if (dataStr.includes('fms') || dataStr.includes('fuel management system')) {
            if (dataStr.includes('raw data') || fileName.includes('raw')) {
                return {
                    fileCategory: 'File 5',
                    documentType: 'FMS Raw Data',
                    requiredFields: ['date', 'assetId', 'fuelQuantity', 'location', 'transactionType']
                };
            }
            return {
                fileCategory: 'File 5',
                documentType: 'Description and Literature of FMS',
                requiredFields: ['systemName', 'description', 'capabilities', 'version']
            };
        }
        
        if (dataStr.includes('fuel refund report') || fileName.includes('refund report')) {
            return {
                fileCategory: 'File 5',
                documentType: 'Detailed Fuel Refund Report',
                requiredFields: ['reportPeriod', 'totalRefund', 'assetBreakdown', 'calculations']
            };
        }
        
        if (dataStr.includes('logbook') || fileName.includes('logbook')) {
            return {
                fileCategory: 'File 5',
                documentType: 'Fuel Refund Logbook Per Asset',
                requiredFields: ['assetId', 'date', 'fuelQuantity', 'usage', 'refundEligible']
            };
        }
        
        if (dataStr.includes('claim comparison') || fileName.includes('comparison')) {
            return {
                fileCategory: 'File 5',
                documentType: 'Claim Comparison',
                requiredFields: ['period', 'previousClaim', 'currentClaim', 'variance']
            };
        }
        
        // FILE 6: Survey and Production Reports
        if (dataStr.includes('survey report') || fileName.includes('survey')) {
            return {
                fileCategory: 'File 6',
                documentType: 'Monthly Survey Reports',
                requiredFields: ['reportMonth', 'surveyDate', 'surveyor', 'findings']
            };
        }
        
        if (dataStr.includes('production report') || fileName.includes('production')) {
            return {
                fileCategory: 'File 6',
                documentType: 'Production Reports',
                requiredFields: ['reportPeriod', 'productionQuantity', 'units', 'location']
            };
        }
        
        if (dataStr.includes('asset activity') || fileName.includes('activity')) {
            return {
                fileCategory: 'File 6',
                documentType: 'Asset Activity Reports',
                requiredFields: ['assetId', 'period', 'hours', 'activityType']
            };
        }
        
        if (dataStr.includes('asset tagging') || fileName.includes('tagging')) {
            return {
                fileCategory: 'File 6',
                documentType: 'Asset Tagging Reports',
                requiredFields: ['assetId', 'tag', 'location', 'date']
            };
        }
        
        if (dataStr.includes('diesel cost component') || fileName.includes('diesel cost')) {
            return {
                fileCategory: 'File 6',
                documentType: 'Diesel Cost Component',
                requiredFields: ['period', 'totalDieselCost', 'breakdown', 'allocation']
            };
        }
        
        if (dataStr.includes('sales of coal') || fileName.includes('coal')) {
            return {
                fileCategory: 'File 6',
                documentType: 'Sales of Coal',
                requiredFields: ['saleDate', 'quantity', 'buyer', 'price', 'invoiceNumber']
            };
        }
        
        if (dataStr.includes('weighbridge') || fileName.includes('weighbridge')) {
            return {
                fileCategory: 'File 6',
                documentType: 'Weighbridge Data',
                requiredFields: ['date', 'vehicle', 'grossWeight', 'tareWeight', 'netWeight']
            };
        }
        
        if (dataStr.includes('contractor invoice') || 
            (dataStr.includes('contractor') && dataStr.includes('invoice'))) {
            return {
                fileCategory: 'File 6',
                documentType: 'Contractor Invoices',
                requiredFields: ['invoiceNumber', 'date', 'contractor', 'amount', 'services']
            };
        }
        
        if (dataStr.includes('contractor remittance') || fileName.includes('contractor remittance')) {
            return {
                fileCategory: 'File 6',
                documentType: 'Contractor Remittances',
                requiredFields: ['remittanceNumber', 'date', 'contractor', 'amount']
            };
        }
        
        // FILE 7: Financial Statements and VAT
        if (dataStr.includes('financial statement') || fileName.includes('financial')) {
            return {
                fileCategory: 'File 7',
                documentType: 'Annual Financial Statements',
                requiredFields: ['period', 'revenue', 'expenses', 'assets', 'liabilities']
            };
        }
        
        if (dataStr.includes('management account') || fileName.includes('management')) {
            return {
                fileCategory: 'File 7',
                documentType: 'Management Accounts',
                requiredFields: ['period', 'revenue', 'expenses', 'profit']
            };
        }
        
        if (dataStr.includes('deviation') || dataStr.includes('theft') || dataStr.includes('loss')) {
            return {
                fileCategory: 'File 7',
                documentType: 'Any deviations (theft, loss etc)',
                requiredFields: ['incidentDate', 'description', 'quantity', 'value', 'investigation']
            };
        }
        
        if (dataStr.includes('fuel cap') || dataStr.includes('cap exceeded')) {
            return {
                fileCategory: 'File 7',
                documentType: 'Fuel Caps Exceeded',
                requiredFields: ['period', 'assetId', 'capAmount', 'actualAmount', 'excess']
            };
        }
        
        if (dataStr.includes('vat 201') || fileName.includes('vat201') || 
            (dataStr.includes('vat') && dataStr.includes('monthly'))) {
            return {
                fileCategory: 'File 7',
                documentType: 'VAT 201 - Monthly',
                requiredFields: ['period', 'vatNumber', 'outputVat', 'inputVat', 'vatPayable']
            };
        }
        
        // Generic classification if no specific match
        return {
            fileCategory: 'Unclassified',
            documentType: 'Unknown Document Type',
            requiredFields: []
        };
    };

    const classification = classifyEvidence();
    result.evidenceType = classification.documentType;
    result.fileCategory = classification.fileCategory;

    // Validate against required fields
    const checkRequiredFields = () => {
        if (!classification.requiredFields || classification.requiredFields.length === 0) {
            return { hasAll: false, missing: [] };
        }

        const missingFields = [];
        const dataStr = JSON.stringify(normalizedData).toLowerCase();
        
        for (const field of classification.requiredFields) {
            const fieldLower = field.toLowerCase();
            const found = allFields.some(f => f.includes(fieldLower)) ||
                         dataStr.includes(fieldLower) ||
                         normalizedData[field] !== undefined ||
                         normalizedData[fieldLower] !== undefined;
            
            if (!found) {
                missingFields.push(field);
            }
        }

        return {
            hasAll: missingFields.length === 0,
            missing: missingFields
        };
    };

    const fieldValidation = checkRequiredFields();
    result.criteria.hasRequiredFields = fieldValidation.hasAll;
    
    if (fieldValidation.missing.length > 0) {
        result.issues.push(`Missing required fields: ${fieldValidation.missing.join(', ')}`);
        result.recommendations.push(`Add the following fields: ${fieldValidation.missing.join(', ')}`);
    }

    // Validate dates
    result.criteria.hasValidDates = result.metadata.detectedDates.length > 0;
    if (!result.criteria.hasValidDates) {
        result.issues.push('No dates detected in the document');
        result.recommendations.push('Include at least one date field (e.g., date, issueDate, createdDate)');
    }

    // Validate amounts (if applicable)
    const amountFields = ['invoice', 'payment', 'remittance', 'cost', 'price', 'amount', 'total'];
    const needsAmounts = amountFields.some(field => 
        result.evidenceType?.toLowerCase().includes(field) ||
        result.fileCategory === 'File 3' || result.fileCategory === 'File 6' || result.fileCategory === 'File 7'
    );
    
    result.criteria.hasValidAmounts = !needsAmounts || result.metadata.detectedAmounts.length > 0;
    if (needsAmounts && !result.criteria.hasValidAmounts) {
        result.issues.push('No monetary amounts detected');
        result.recommendations.push('Include amount, price, or cost fields');
    }

    // Calculate relevance score
    let score = 0;
    if (result.fileCategory !== 'Unclassified') score += 30;
    if (result.criteria.hasRequiredFields) score += 30;
    if (result.criteria.hasValidDates) score += 20;
    if (result.criteria.hasValidAmounts || !needsAmounts) score += 10;
    if (result.metadata.detectedEntities.length > 0) score += 10;
    
    result.relevanceScore = Math.min(100, score);
    result.criteria.isComplete = result.relevanceScore >= 80 && result.issues.length === 0;
    result.isValid = result.relevanceScore >= 50 && result.fileCategory !== 'Unclassified';

    // Add context-specific recommendations
    if (result.fileCategory === 'File 3' && !result.metadata.detectedDates.length) {
        result.recommendations.push('File 3 documents typically require transaction dates');
    }
    
    if (result.fileCategory === 'File 5' && !dataStr.includes('asset')) {
        result.recommendations.push('FMS documents should include asset identification');
    }
    
    if (result.fileCategory === 'File 6' && !result.metadata.detectedAmounts.length) {
        result.recommendations.push('Production and contractor documents should include cost/amount information');
    }

    // Add project context if provided
    if (projectId) {
        result.metadata.projectId = projectId;
    }

    return result;
};

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
// Make available globally (browser) - execute immediately
(function() {
    if (typeof window !== 'undefined') {
        window.evaluateDieselRefundEvidence = evaluateDieselRefundEvidence;
        window.dieselRefundEvidenceEvaluator = {
            evaluate: evaluateDieselRefundEvidence
        };
        console.log('✅ evaluateDieselRefundEvidence utility function registered');
    }
})();

// CommonJS export (for Node.js if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { evaluateDieselRefundEvidence };
}

