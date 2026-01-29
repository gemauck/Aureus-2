// Shared utilities for Client JSON field handling
// Phase 2: Dual-read/write support (JSONB + String fallback)

const DEFAULT_BILLING_TERMS = {
  paymentTerms: 'Net 30',
  billingFrequency: 'Monthly',
  currency: 'ZAR',
  retainerAmount: 0,
  taxExempt: false,
  notes: ''
}

const DEFAULT_KYC = {
  clientType: '',
  legalEntity: {
    registeredLegalName: '',
    tradingName: '',
    registrationNumber: '',
    vatNumber: '',
    incomeTaxNumber: '',
    registeredAddress: '',
    principalPlaceOfBusiness: '',
    countryOfIncorporation: ''
  },
  directors: [],
  beneficialOwners: [],
  businessProfile: {
    industrySector: '',
    coreBusinessActivities: '',
    primaryOperatingLocations: '',
    yearsInOperation: ''
  },
  bankingDetails: {
    bankName: '',
    accountHolderName: '',
    accountNumber: '',
    branchCode: '',
    accountType: ''
  },
  directorsNotes: '',
  ubosNotes: ''
}

// Phase 3: Triple-read - Normalized tables first, then JSONB, then String fallback
export function parseClientJsonFields(client) {
  try {
    // Safety check: return empty object if client is null/undefined
    if (!client || typeof client !== 'object') {
      console.warn('⚠️ parseClientJsonFields: client is null/undefined/invalid:', client)
      return client || {}
    }
    
    const parsed = { ...client }
    
    // Phase 3: Contacts - Use normalized table first, fallback to JSON
    if (client.clientContacts && Array.isArray(client.clientContacts) && client.clientContacts.length > 0) {
      // Convert normalized ClientContact records to array format
      parsed.contacts = client.clientContacts.map(contact => ({
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone || contact.mobile,
        mobile: contact.mobile || contact.phone,
        role: contact.role || contact.title,
        title: contact.title || contact.role,
        isPrimary: contact.isPrimary || false,
        notes: contact.notes || ''
      }))
    } else {
      // Fallback: Try JSONB field (Phase 2)
      let value = client.contactsJsonb
      if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
        // Fallback: Try String field (Phase 1)
        const stringValue = client.contacts
        if (typeof stringValue === 'string' && stringValue && stringValue.trim()) {
          try {
            value = JSON.parse(stringValue)
          } catch (e) {
            value = []
          }
        } else {
          value = []
        }
      }
      parsed.contacts = Array.isArray(value) ? value : []
    }
    
    // Phase 3: Comments - Use normalized table first, fallback to JSON
    if (client.clientComments && Array.isArray(client.clientComments) && client.clientComments.length > 0) {
      // Convert normalized ClientComment records to array format
      parsed.comments = client.clientComments.map(comment => ({
        id: comment.id,
        text: comment.text,
        author: comment.author,
        authorId: comment.authorId,
        userName: comment.userName,
        createdAt: comment.createdAt ? new Date(comment.createdAt).toISOString() : new Date().toISOString()
      }))
    } else {
      // Fallback: Try JSONB field (Phase 2)
      let value = client.commentsJsonb
      if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
        // Fallback: Try String field (Phase 1)
        const stringValue = client.comments
        if (typeof stringValue === 'string' && stringValue && stringValue.trim()) {
          try {
            value = JSON.parse(stringValue)
          } catch (e) {
            value = []
          }
        } else {
          value = []
        }
      }
      parsed.comments = Array.isArray(value) ? value : []
    }
    
    // Phase 4: projectIds - Use projects relation instead of JSON field
    if (client.projects && Array.isArray(client.projects)) {
      // Get project IDs from the projects relation (proper way)
      parsed.projectIds = client.projects.map(project => project.id)
    } else {
      // Fallback: Try JSON field for backward compatibility (deprecated)
      const stringValue = client.projectIds
      if (typeof stringValue === 'string' && stringValue && stringValue.trim()) {
        try {
          parsed.projectIds = JSON.parse(stringValue)
        } catch (e) {
          parsed.projectIds = []
        }
      } else {
        parsed.projectIds = []
      }
    }
    
    // Phase 6: Sites - Use normalized table first, fallback to JSON (defaults for stage/aidaStatus so they persist after refresh)
    if (client.clientSites && Array.isArray(client.clientSites) && client.clientSites.length > 0) {
      parsed.sites = client.clientSites.map(site => ({
        id: site.id,
        name: site.name,
        address: site.address || '',
        contactPerson: site.contactPerson || '',
        contactPhone: site.contactPhone || '',
        contactEmail: site.contactEmail || '',
        notes: site.notes || '',
        siteLead: site.siteLead ?? '',
        stage: (site.stage != null && String(site.stage).trim() !== '') ? String(site.stage) : 'Potential',
        aidaStatus: (site.aidaStatus != null && String(site.aidaStatus).trim() !== '') ? String(site.aidaStatus) : 'Awareness',
        siteType: site.siteType === 'client' ? 'client' : 'lead'
      }))
      // Keep clientSites so Pipeline (and other consumers) can use client.clientSites || client.sites
      parsed.clientSites = parsed.sites
    } else {
      // Fallback: Try JSONB field, then String field
      let value = client.sitesJsonb
      if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
        const stringValue = client.sites
        if (typeof stringValue === 'string' && stringValue && stringValue.trim()) {
          try {
            value = JSON.parse(stringValue)
          } catch (e) {
            value = []
          }
        } else {
          value = []
        }
      }
      parsed.sites = Array.isArray(value) ? value : []
      parsed.clientSites = parsed.sites
    }
    
    // Phase 6: Contracts - Use normalized table first, fallback to JSON
    if (client.clientContracts && Array.isArray(client.clientContracts) && client.clientContracts.length > 0) {
      parsed.contracts = client.clientContracts.map(contract => ({
        id: contract.id,
        name: contract.name,
        size: contract.size || 0,
        type: contract.type || '',
        uploadDate: contract.uploadDate ? new Date(contract.uploadDate).toISOString() : new Date().toISOString(),
        url: contract.url || ''
      }))
    } else {
      // Fallback: Try JSONB field, then String field
      let value = client.contractsJsonb
      if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
        const stringValue = client.contracts
        if (typeof stringValue === 'string' && stringValue && stringValue.trim()) {
          try {
            value = JSON.parse(stringValue)
          } catch (e) {
            value = []
          }
        } else {
          value = []
        }
      }
      parsed.contracts = Array.isArray(value) ? value : []
    }
    
    // Phase 6: Proposals - Use normalized table first, fallback to JSON
    if (client.clientProposals && Array.isArray(client.clientProposals) && client.clientProposals.length > 0) {
      parsed.proposals = client.clientProposals.map(proposal => ({
        id: proposal.id,
        title: proposal.title || '',
        amount: proposal.amount || 0,
        status: proposal.status || 'Pending',
        workingDocumentLink: proposal.workingDocumentLink || '',
        createdDate: proposal.createdDate ? new Date(proposal.createdDate).toISOString() : null,
        expiryDate: proposal.expiryDate ? new Date(proposal.expiryDate).toISOString() : null,
        notes: proposal.notes || ''
      }))
    } else {
      // Fallback: Try JSONB field, then String field
      let value = client.proposalsJsonb
      if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
        const stringValue = client.proposals
        if (typeof stringValue === 'string' && stringValue && stringValue.trim()) {
          try {
            value = JSON.parse(stringValue)
          } catch (e) {
            value = []
          }
        } else {
          value = []
        }
      }
      parsed.proposals = Array.isArray(value) ? value : []
    }
    
    // Phase 6: FollowUps - Use normalized table first, fallback to JSON
    if (client.clientFollowUps && Array.isArray(client.clientFollowUps) && client.clientFollowUps.length > 0) {
      parsed.followUps = client.clientFollowUps.map(followUp => ({
        id: followUp.id,
        date: followUp.date || '',
        time: followUp.time || '',
        type: followUp.type || 'Call',
        description: followUp.description || '',
        completed: followUp.completed || false,
        assignedTo: followUp.assignedTo || null
      }))
    } else {
      // Fallback: Try JSONB field, then String field
      let value = client.followUpsJsonb
      if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
        const stringValue = client.followUps
        if (typeof stringValue === 'string' && stringValue && stringValue.trim()) {
          try {
            value = JSON.parse(stringValue)
          } catch (e) {
            value = []
          }
        } else {
          value = []
        }
      }
      parsed.followUps = Array.isArray(value) ? value : []
    }
    
    // Phase 6: Services - Use normalized table first, but only if services have names
    // If normalized services exist but have empty names, fall back to JSON (which has the actual service strings)
    if (client.clientServices && Array.isArray(client.clientServices) && client.clientServices.length > 0) {
      // Check if normalized services have actual names (not just IDs)
      const hasNamedServices = client.clientServices.some(s => s.name && s.name.trim())
      
      if (hasNamedServices) {
        // Use normalized table - services have full details
      parsed.services = client.clientServices.map(service => ({
        id: service.id,
        name: service.name,
        description: service.description || '',
        price: service.price || 0,
        status: service.status || 'Active',
        startDate: service.startDate ? new Date(service.startDate).toISOString() : null,
        endDate: service.endDate ? new Date(service.endDate).toISOString() : null,
        notes: service.notes || ''
      }))
      } else {
        // Normalized services exist but have no names - these are likely orphaned records
        // Fall back to JSON field which has the actual service strings
        let value = client.servicesJsonb
        if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
          const stringValue = client.services
          if (typeof stringValue === 'string' && stringValue && stringValue.trim()) {
            try {
              value = JSON.parse(stringValue)
            } catch (e) {
              value = []
            }
          } else {
            value = []
          }
        }
        parsed.services = Array.isArray(value) ? value : []
      }
    } else {
      // Fallback: Try JSONB field, then String field
      let value = client.servicesJsonb
      if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
        const stringValue = client.services
        if (typeof stringValue === 'string' && stringValue && stringValue.trim()) {
          try {
            value = JSON.parse(stringValue)
          } catch (e) {
            value = []
          }
        } else {
          value = []
        }
      }
      parsed.services = Array.isArray(value) ? value : []
    }
    
    // Other JSON fields - Phase 2: Read from JSONB first, fallback to String
    // activityLog, billingTerms, kyc remain as JSON (not normalized)
    const jsonFieldMap = {
      'activityLog': 'activityLogJsonb',
      'billingTerms': 'billingTermsJsonb',
      'kyc': 'kycJsonb'
    }
    
    for (const [field, jsonbField] of Object.entries(jsonFieldMap)) {
      // Try JSONB field first (Phase 2)
      let value = parsed[jsonbField]
      
      // Fallback to String field if JSONB is null/undefined/empty (backward compatibility)
      if (value === null || value === undefined) {
        const stringValue = parsed[field]
        if (typeof stringValue === 'string' && stringValue && stringValue.trim()) {
          try {
            value = JSON.parse(stringValue)
          } catch (e) {
            value = field === 'billingTerms' ? DEFAULT_BILLING_TERMS : field === 'kyc' ? DEFAULT_KYC : []
          }
        } else {
          value = field === 'billingTerms' ? DEFAULT_BILLING_TERMS : field === 'kyc' ? DEFAULT_KYC : []
        }
      }
      if (field === 'kyc' && (typeof value !== 'object' || value === null)) {
        value = DEFAULT_KYC
      }
      
      parsed[field] = value
    }
    
    // Remove relation objects from parsed output (frontend doesn't need them)
    // Keep clientSites - Pipeline needs it to show client sites listed as leads
    delete parsed.clientContacts
    delete parsed.clientComments
    delete parsed.clientContracts
    delete parsed.clientProposals
    delete parsed.clientFollowUps
    delete parsed.clientServices
    
    return parsed
  } catch (error) {
    console.error(`❌ Error parsing client ${client?.id}:`, error.message)
    // Return client as-is if parsing fails completely
    return client
  }
}

// Phase 2: Helper to prepare data for dual-write (both String and JSONB)
// Phase 4: Removed projectIds - use Project.clientId relation instead
// Phase 5: Removed contacts and comments - use normalized tables (ClientContact, ClientComment) only
// Phase 6: Removed sites, contracts, proposals, followUps, services - use normalized tables only
export function prepareJsonFieldsForDualWrite(body) {
  const jsonFields = ['activityLog'] // Only activityLog remains as JSON (log data, not normalized)
  // Note: 'contacts', 'comments', 'sites', 'contracts', 'proposals', 'followUps', 'services' removed
  // These should ONLY be written to normalized tables
  
  const result = {}
  
  // Process each JSON field
  for (const field of jsonFields) {
    let arrayValue = []
    
    if (body[field] !== undefined) {
      if (Array.isArray(body[field])) {
        arrayValue = body[field]
      } else if (typeof body[field] === 'string' && body[field].trim()) {
        try {
          arrayValue = JSON.parse(body[field])
        } catch (e) {
          arrayValue = []
        }
      }
    }
    
    // Write to both String (backward compatibility) and JSONB (new)
    result[field] = JSON.stringify(arrayValue)
    result[`${field}Jsonb`] = arrayValue
  }
  
  // Phase 4: projectIds is deprecated - projects are managed via Project.clientId relation
  // But we still handle it for backward compatibility if provided
  if (body.projectIds !== undefined) {
    let projectIdsArray = []
    if (Array.isArray(body.projectIds)) {
      projectIdsArray = body.projectIds
    } else if (typeof body.projectIds === 'string' && body.projectIds.trim()) {
      try {
        projectIdsArray = JSON.parse(body.projectIds)
      } catch (e) {
        projectIdsArray = []
      }
    }
    // Only write to String field (no JSONB, and will be deprecated)
    result.projectIds = JSON.stringify(projectIdsArray)
  }
  
  // Handle billingTerms (object, not array)
  if (body.billingTerms !== undefined) {
    let billingTermsObj = DEFAULT_BILLING_TERMS
    
    if (typeof body.billingTerms === 'object' && body.billingTerms !== null) {
      billingTermsObj = { ...DEFAULT_BILLING_TERMS, ...body.billingTerms }
    } else if (typeof body.billingTerms === 'string' && body.billingTerms.trim()) {
      try {
        billingTermsObj = { ...DEFAULT_BILLING_TERMS, ...JSON.parse(body.billingTerms) }
      } catch (e) {
        billingTermsObj = DEFAULT_BILLING_TERMS
      }
    }
    
    result.billingTerms = JSON.stringify(billingTermsObj)
    result.billingTermsJsonb = billingTermsObj
  }

  // Handle kyc (object: clientType, legalEntity, directors, beneficialOwners, businessProfile, bankingDetails, directorsNotes, ubosNotes)
  if (body.kyc !== undefined) {
    let kycObj = DEFAULT_KYC
    if (typeof body.kyc === 'object' && body.kyc !== null) {
      const deepMerge = (defaultVal, from) => {
        if (from === null || typeof from !== 'object') return defaultVal
        const out = { ...defaultVal }
        for (const k of Object.keys(from)) {
          if (typeof from[k] === 'object' && from[k] !== null && !Array.isArray(from[k]) && typeof defaultVal[k] === 'object' && defaultVal[k] !== null) {
            out[k] = deepMerge(defaultVal[k] || {}, from[k])
          } else {
            out[k] = from[k]
          }
        }
        return out
      }
      kycObj = deepMerge(DEFAULT_KYC, body.kyc)
    } else if (typeof body.kyc === 'string' && body.kyc.trim()) {
      try {
        const parsed = JSON.parse(body.kyc)
        kycObj = typeof parsed === 'object' && parsed !== null ? { ...DEFAULT_KYC, ...parsed, legalEntity: { ...DEFAULT_KYC.legalEntity, ...(parsed.legalEntity || {}) }, businessProfile: { ...DEFAULT_KYC.businessProfile, ...(parsed.businessProfile || {}) }, bankingDetails: { ...DEFAULT_KYC.bankingDetails, ...(parsed.bankingDetails || {}) } } : DEFAULT_KYC
      } catch (e) {
        kycObj = DEFAULT_KYC
      }
    }
    result.kyc = JSON.stringify(kycObj)
    result.kycJsonb = kycObj
  }
  
  return result
}

export { DEFAULT_BILLING_TERMS, DEFAULT_KYC }

