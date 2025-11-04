// Duplicate validation utility for clients and leads
import { prisma } from './prisma.js'

/**
 * Normalizes a string for comparison (lowercase, trim whitespace)
 */
function normalizeString(str) {
  if (!str || typeof str !== 'string') return ''
  return str.trim().toLowerCase()
}

/**
 * Normalizes email for comparison (lowercase, trim)
 */
function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return ''
  return email.trim().toLowerCase()
}

/**
 * Normalizes phone number for comparison (removes spaces, dashes, parentheses)
 */
function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return ''
  return phone.replace(/[\s\-\(\)]/g, '').trim()
}

/**
 * Extracts emails from contacts array
 */
function extractEmails(contacts) {
  if (!contacts || !Array.isArray(contacts)) return []
  const emails = []
  contacts.forEach(contact => {
    if (contact.email && typeof contact.email === 'string') {
      const normalized = normalizeEmail(contact.email)
      if (normalized) emails.push(normalized)
    }
  })
  return emails
}

/**
 * Extracts phone numbers from contacts array
 */
function extractPhones(contacts) {
  if (!contacts || !Array.isArray(contacts)) return []
  const phones = []
  contacts.forEach(contact => {
    if (contact.phone && typeof contact.phone === 'string') {
      const normalized = normalizePhone(contact.phone)
      if (normalized) phones.push(normalized)
    }
  })
  return phones
}

/**
 * Parses contacts JSON string to array
 */
function parseContacts(contactsStr) {
  if (!contactsStr) return []
  if (Array.isArray(contactsStr)) return contactsStr
  if (typeof contactsStr === 'string') {
    try {
      return JSON.parse(contactsStr)
    } catch (e) {
      return []
    }
  }
  return []
}

/**
 * Checks for duplicate clients or leads
 * Returns an object with duplicate matches or null if no duplicates found
 * 
 * @param {Object} data - The client/lead data to check
 * @param {string} excludeId - Optional ID to exclude from check (for updates)
 * @returns {Promise<Object|null>} - Duplicate matches or null
 */
export async function checkForDuplicates(data, excludeId = null) {
  try {
    const name = normalizeString(data.name)
    const website = normalizeString(data.website)
    const contacts = parseContacts(data.contacts)
    const emails = extractEmails(contacts)
    const phones = extractPhones(contacts)

    // Build query conditions
    const whereConditions = []

    // Check name match (case-insensitive)
    if (name) {
      whereConditions.push({
        name: {
          mode: 'insensitive',
          contains: name
        }
      })
    }

    // Check website match
    if (website) {
      whereConditions.push({
        website: {
          mode: 'insensitive',
          contains: website
        }
      })
    }

    // Exclude current record if updating
    const excludeCondition = excludeId ? { id: { not: excludeId } } : {}

    // If no conditions, return null (no duplicates possible)
    if (whereConditions.length === 0 && emails.length === 0 && phones.length === 0) {
      return null
    }

    // Query all clients and leads (since a lead might duplicate a client and vice versa)
    const allRecords = await prisma.client.findMany({
      where: {
        ...excludeCondition,
        OR: whereConditions.length > 0 ? whereConditions : undefined
      }
    })

    // Check for matches
    const matches = []

    for (const record of allRecords) {
      const recordName = normalizeString(record.name)
      const recordWebsite = normalizeString(record.website)
      const recordContacts = parseContacts(record.contacts)
      const recordEmails = extractEmails(recordContacts)
      const recordPhones = extractPhones(recordContacts)

      const matchReasons = []

      // Check name similarity (exact match or very similar)
      if (name && recordName && recordName === name) {
        matchReasons.push('name')
      }

      // Check website match
      if (website && recordWebsite && recordWebsite === website) {
        matchReasons.push('website')
      }

      // Check email matches
      if (emails.length > 0 && recordEmails.length > 0) {
        const matchingEmails = emails.filter(e => recordEmails.includes(e))
        if (matchingEmails.length > 0) {
          matchReasons.push(`email: ${matchingEmails.join(', ')}`)
        }
      }

      // Check phone matches
      if (phones.length > 0 && recordPhones.length > 0) {
        const matchingPhones = phones.filter(p => recordPhones.includes(p))
        if (matchingPhones.length > 0) {
          matchReasons.push(`phone: ${matchingPhones.join(', ')}`)
        }
      }

      // If any matches found, add to results
      if (matchReasons.length > 0) {
        matches.push({
          id: record.id,
          name: record.name,
          type: record.type || 'client',
          matchReasons
        })
      }
    }

    // Also check for similar names (fuzzy match)
    if (name && matches.length === 0) {
      const similarRecords = await prisma.client.findMany({
        where: excludeCondition
      })

      for (const record of similarRecords) {
        const recordName = normalizeString(record.name)
        
        // Check for very similar names (e.g., "ABC Corp" vs "ABC Corporation")
        if (recordName && recordName !== name) {
          // Calculate similarity (simple check for substring match or high similarity)
          const nameWords = name.split(/\s+/)
          const recordWords = recordName.split(/\s+/)
          
          // If major words match, consider it potentially duplicate
          const matchingWords = nameWords.filter(word => 
            word.length > 3 && recordWords.some(rw => rw.includes(word) || word.includes(rw))
          )
          
          if (matchingWords.length >= Math.min(nameWords.length, recordWords.length) * 0.7) {
            matches.push({
              id: record.id,
              name: record.name,
              type: record.type || 'client',
              matchReasons: ['similar name']
            })
          }
        }
      }
    }

    if (matches.length === 0) {
      return null
    }

    return {
      isDuplicate: true,
      matches,
      message: `Potential duplicate found: ${matches.length} similar ${matches.length === 1 ? 'record' : 'records'} already exist`
    }
  } catch (error) {
    console.error('❌ Error checking for duplicates:', error)
    // Don't fail the request if duplicate check fails, just log it
    return null
  }
}

/**
 * Validates and returns user-friendly duplicate error message
 */
export function formatDuplicateError(duplicateResult) {
  if (!duplicateResult || !duplicateResult.matches) {
    return null
  }

  const matches = duplicateResult.matches
  const matchDetails = matches.map(m => {
    const reasons = m.matchReasons.join(', ')
    return `${m.name} (${m.type}) - ${reasons}`
  }).join('\n')

  return `Duplicate or similar record detected:\n\n${matchDetails}\n\nPlease review and ensure this is not a duplicate before proceeding.`
}

