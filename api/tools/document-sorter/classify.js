/**
 * Maps file path (and name) to category: { fileNum: 1-7, folderName: string }.
 * Based on the 7-file structure: File 1 (regulatory), File 2 (contracts), File 3 (fuel system),
 * File 4 (assets/drivers), File 5 (FMS), File 6 (operational/contractor), File 7 (financial).
 */

const CATEGORIES = [
  // File 1: Mining Right, CIPC, Diesel Refund Registration, VAT Registration, Environmental, Summary, Explanation
  {
    fileNum: 1,
    keywords: [
      'mining right', 'mining rights', 'cipc', 'diesel refund registration', 'vat registration',
      'environmental authorisation', 'environmental authorization', 'summary of operations',
      'summary of activities', 'file 1 explanation', 'company registration', 'registration certificate',
    ],
    folderName: 'File 1 - Regulatory and Operations Summary',
  },
  // File 2: Fuel Supply Contract, Mining Contractors Contracts, Sale of Product Contracts
  {
    fileNum: 2,
    keywords: [
      'fuel supply contract', 'mining contractor', 'mining contractors contract',
      'sale of product', 'sale of product contract', 'supply agreement', 'file 2 explanation',
    ],
    folderName: 'File 2 - Contracts',
  },
  // File 3: Tank/Pump, Diagram, Delivery Notes, Invoices, Remittance, Proof of payment, Tank Reconciliations, Photos, Calibration
  {
    fileNum: 3,
    keywords: [
      'tank and pump', 'pump configuration', 'diagram of fuel', 'fuel system',
      'delivery note', 'delivery notes', 'remittance advice', 'remittance advices',
      'proof of payment', 'proof of payments', 'tank reconcil', 'reconcilation',
      'photos of tanks', 'tank photo', 'calibration certificate', 'file 3 explanation',
      'invoice', 'invoices',
    ],
    folderName: 'File 3 - Fuel System and Transactions',
  },
  // File 4: Asset registers, Driver list
  {
    fileNum: 4,
    keywords: [
      'asset register', 'combined assets', 'mining assets', 'non mining assets',
      'driver list', 'drivers list', 'file 4 explanation',
    ],
    folderName: 'File 4 - Assets and Drivers',
  },
  // File 5: FMS description, FMS Raw Data, Fuel Refund Report, Fuel Refund Logbook
  {
    fileNum: 5,
    keywords: [
      'fms raw data', 'description and literature of fms', 'fuel management system',
      'detailed fuel refund report', 'fuel refund logbook', 'fuel refund report',
      'file 5 explanation', 'fms data', 'fms report',
    ],
    folderName: 'File 5 - FMS Data and Reports',
  },
  // File 6: Monthly Survey, Production, Asset Activity, Contractor Invoices/Remittances/Proof
  {
    fileNum: 6,
    keywords: [
      'monthly survey', 'survey report', 'production report', 'asset activity report',
      'contractor invoice', 'contractor remittance', 'contractor proof of payment',
      'file 6 explanation', 'contractor payment',
    ],
    folderName: 'File 6 - Operational and Contractor',
  },
  // File 7: Annual Financial, Management Accounts, Deviations, Fuel Caps, VAT 201
  {
    fileNum: 7,
    keywords: [
      'annual financial statement', 'management account', 'deviations', 'theft', 'loss',
      'fuel cap exceeded', 'fuel caps exceeded', 'vat 201', 'vat201', 'file 7 explanation',
      'financial statement', 'afs',
    ],
    folderName: 'File 7 - Financial and Compliance',
  },
]

/**
 * @param {string} entryPath - path inside zip (and/or filename)
 * @returns {{ fileNum: number, folderName: string, subFolder: string }}
 */
export function classifyPath(entryPath) {
  const normalized = (entryPath || '').toLowerCase().replace(/\\/g, '/')
  const baseName = normalized.split('/').pop() || ''

  for (const cat of CATEGORIES) {
    for (const kw of cat.keywords) {
      if (normalized.includes(kw) || baseName.includes(kw)) {
        return {
          fileNum: cat.fileNum,
          folderName: cat.folderName,
          subFolder: cat.folderName,
        }
      }
    }
  }

  return {
    fileNum: 0,
    folderName: 'Uncategorized',
    subFolder: 'Uncategorized',
  }
}
