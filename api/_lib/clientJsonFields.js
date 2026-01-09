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

// Phase 3: Triple-read - Normalized tables first, then JSONB, then String fallback
export function parseClientJsonFields(client) {
  try {
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
    
    // Other JSON fields - Phase 2: Read from JSONB first, fallback to String
    const jsonFieldMap = {
      'followUps': 'followUpsJsonb',
      'sites': 'sitesJsonb',
      'contracts': 'contractsJsonb',
      'activityLog': 'activityLogJsonb',
      'billingTerms': 'billingTermsJsonb',
      'proposals': 'proposalsJsonb',
      'services': 'servicesJsonb'
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
            // Set safe defaults on parse error
            value = field === 'billingTerms' ? DEFAULT_BILLING_TERMS : []
          }
        } else {
          // Set defaults for missing/null fields
          value = field === 'billingTerms' ? DEFAULT_BILLING_TERMS : []
        }
      }
      
      parsed[field] = value
    }
    
    // Remove relation objects from parsed output (frontend doesn't need them)
    delete parsed.clientContacts
    delete parsed.clientComments
    
    return parsed
  } catch (error) {
    console.error(`❌ Error parsing client ${client?.id}:`, error.message)
    // Return client as-is if parsing fails completely
    return client
  }
}

// Phase 2: Helper to prepare data for dual-write (both String and JSONB)
// Phase 4: Removed projectIds - use Project.clientId relation instead
export function prepareJsonFieldsForDualWrite(body) {
  const jsonFields = ['contacts', 'followUps', 'comments', 'sites', 'contracts', 'activityLog', 'proposals', 'services']
  
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
  
  return result
}

export { DEFAULT_BILLING_TERMS }

