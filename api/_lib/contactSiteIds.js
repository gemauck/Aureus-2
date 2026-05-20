/** Normalize contact ↔ site links from API/UI payloads (siteIds array or legacy siteId). */

export function normalizeContactSiteIds(contact) {
  if (!contact || typeof contact !== 'object') return []
  if (Array.isArray(contact.siteIds)) {
    return [...new Set(contact.siteIds.map((id) => String(id).trim()).filter(Boolean))]
  }
  const legacy = contact.siteId && String(contact.siteId).trim()
  return legacy ? [legacy] : []
}

export function contactWithSiteIds(contact, siteIds) {
  const ids = siteIds ?? normalizeContactSiteIds(contact)
  return {
    ...contact,
    siteIds: ids,
    siteId: ids[0] || null
  }
}

/** @returns {Promise<Map<string, string[]>>} contactId -> siteIds */
export async function fetchContactSiteIdsByClientId(prisma, clientId) {
  const map = new Map()
  try {
    const rows = await prisma.clientContactSite.findMany({
      where: { contact: { clientId } },
      select: { contactId: true, siteId: true }
    })
    for (const row of rows) {
      const cid = String(row.contactId)
      const sid = String(row.siteId)
      if (!map.has(cid)) map.set(cid, [])
      map.get(cid).push(sid)
    }
  } catch (err) {
    console.warn('⚠️ Could not load ClientContactSite links:', err.message)
  }
  return map
}

export async function syncContactSiteLinks(prisma, contactId, siteIds) {
  const ids = [...new Set((siteIds || []).map((id) => String(id).trim()).filter(Boolean))]
  try {
    await prisma.clientContactSite.deleteMany({ where: { contactId } })
    if (ids.length > 0) {
      await prisma.clientContactSite.createMany({
        data: ids.map((siteId) => ({ contactId, siteId })),
        skipDuplicates: true
      })
    }
    await prisma.clientContact.update({
      where: { id: contactId },
      data: { siteId: ids[0] || null }
    })
  } catch (err) {
    console.error(`❌ Could not sync contact-site links for ${contactId}:`, err.message)
    throw err
  }
}

export function enrichContactsWithSiteIds(contacts, siteIdsByContactId) {
  if (!Array.isArray(contacts)) return []
  return contacts.map((c) => {
    const fromJunction = siteIdsByContactId?.get(String(c.id)) || []
    const ids = fromJunction.length > 0 ? fromJunction : normalizeContactSiteIds(c)
    return contactWithSiteIds(c, ids)
  })
}

/** Attach junction siteIds to client.clientContacts before parseClientJsonFields. */
export async function enrichClientRecordContacts(prisma, clientRecord) {
  if (!clientRecord?.id || !Array.isArray(clientRecord.clientContacts) || clientRecord.clientContacts.length === 0) {
    return clientRecord
  }
  const siteIdsByContactId = await fetchContactSiteIdsByClientId(prisma, clientRecord.id)
  return {
    ...clientRecord,
    clientContacts: enrichContactsWithSiteIds(clientRecord.clientContacts, siteIdsByContactId)
  }
}
