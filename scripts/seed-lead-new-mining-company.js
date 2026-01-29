/**
 * Add full sub-data for the "New Mining Company" lead:
 * contacts, comments, sites, contracts, proposals, follow-ups, services, activity log.
 * Uses .env.local if present.
 */
import { PrismaClient } from '@prisma/client'
import { config } from 'dotenv'
import { join } from 'path'
import { existsSync } from 'fs'

if (existsSync(join(process.cwd(), '.env.local'))) {
  config({ path: join(process.cwd(), '.env.local'), override: true })
}

const prisma = new PrismaClient()

async function main() {
  const lead = await prisma.client.findFirst({
    where: { type: 'lead', name: 'New Mining Company' }
  })
  if (!lead) {
    console.error('❌ Lead "New Mining Company" not found. Run create-dummy-data.js first.')
    process.exit(1)
  }

  const admin = await prisma.user.findFirst({
    where: { role: 'admin' }
  })
  const authorId = admin?.id ?? null
  const authorName = admin?.name ?? 'Admin'
  const leadId = lead.id

  console.log(`🌱 Seeding sub-data for lead: ${lead.name} (${leadId})\n`)

  // Contacts
  const contactData = [
    { name: 'James Khumalo', email: 'james.khumalo@newmining.co.za', phone: '+27 11 555 0201', mobile: '+27 82 123 4567', role: 'Operations Manager', title: 'Operations', isPrimary: true, notes: 'Main point of contact for fuel management inquiry.' },
    { name: 'Sarah van Wyk', email: 'sarah.vanwyk@newmining.co.za', phone: '+27 11 555 0202', mobile: null, role: 'Procurement', title: 'Procurement Manager', isPrimary: false, notes: 'Handles vendor and contract discussions.' },
    { name: 'Peter Nkosi', email: 'peter.nkosi@newmining.co.za', phone: '+27 11 555 0203', mobile: '+27 83 987 6543', role: 'Site Manager', title: 'Mining Site A', isPrimary: false, notes: 'On-site technical contact.' }
  ]
  for (const c of contactData) {
    await prisma.clientContact.create({
      data: {
        clientId: leadId,
        name: c.name,
        email: c.email,
        phone: c.phone ?? undefined,
        mobile: c.mobile ?? undefined,
        role: c.role,
        title: c.title,
        isPrimary: c.isPrimary,
        notes: c.notes ?? ''
      }
    })
  }
  console.log(`   ✅ ${contactData.length} contacts`)

  // Comments
  const commentData = [
    { text: 'Initial inquiry received. Client interested in fuel management solutions for mining fleet.', authorId, author: authorName, userName: admin?.email },
    { text: 'Sent information pack and pricing. Follow-up call scheduled for next week.', authorId, author: authorName, userName: admin?.email },
    { text: 'Client requested site visit to assess current fuel storage and dispensing setup.', authorId, author: authorName, userName: admin?.email }
  ]
  for (const c of commentData) {
    await prisma.clientComment.create({
      data: {
        clientId: leadId,
        text: c.text,
        authorId: c.authorId ?? undefined,
        author: c.author ?? '',
        userName: c.userName ?? undefined
      }
    })
  }
  console.log(`   ✅ ${commentData.length} comments`)

  // Sites
  const siteData = [
    { name: 'Head Office - Johannesburg', address: '111 Prospect Street, Johannesburg, 2000', contactPerson: 'James Khumalo', contactPhone: '+27 11 555 0201', contactEmail: 'james.khumalo@newmining.co.za', notes: 'Main office. Decision makers based here.', siteLead: 'Primary', stage: 'Awareness', aidaStatus: 'Awareness' },
    { name: 'Mining Site A - Rustenburg', address: 'Mining District, Rustenburg, 0300', contactPerson: 'Peter Nkosi', contactPhone: '+27 83 987 6543', contactEmail: 'peter.nkosi@newmining.co.za', notes: 'Active mining site. Fuel consumption high.', siteLead: 'Secondary', stage: 'Interest', aidaStatus: 'Interest' }
  ]
  for (const s of siteData) {
    await prisma.clientSite.create({
      data: {
        clientId: leadId,
        name: s.name,
        address: s.address,
        contactPerson: s.contactPerson ?? undefined,
        contactPhone: s.contactPhone ?? undefined,
        contactEmail: s.contactEmail ?? undefined,
        notes: s.notes ?? '',
        siteLead: s.siteLead ?? undefined,
        stage: s.stage ?? undefined,
        aidaStatus: s.aidaStatus ?? undefined
      }
    })
  }
  console.log(`   ✅ ${siteData.length} sites`)

  // Contracts (one placeholder for future)
  await prisma.clientContract.create({
    data: {
      clientId: leadId,
      name: 'Draft - Fuel Management Service Agreement',
      size: 0,
      type: 'Draft'
    }
  })
  console.log('   ✅ 1 contract (draft)')

  // Proposals
  const proposalData = [
    { title: 'Fuel Management System - Phase 1', amount: 450000, status: 'Sent', notes: 'Initial proposal. Includes hardware and 12-month support.' },
    { title: 'Site Survey & Assessment', amount: 25000, status: 'Pending', notes: 'Optional pre-implementation site survey.' }
  ]
  for (const p of proposalData) {
    await prisma.clientProposal.create({
      data: {
        clientId: leadId,
        title: p.title,
        amount: p.amount,
        status: p.status,
        notes: p.notes ?? '',
        createdDate: new Date(),
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    })
  }
  console.log(`   ✅ ${proposalData.length} proposals`)

  // Follow-ups
  const followUpData = [
    { date: new Date().toISOString().slice(0, 10), time: '14:00', type: 'Call', description: 'Follow-up call to discuss proposal and answer questions.', completed: false, assignedTo: authorId },
    { date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), time: '10:00', type: 'Meeting', description: 'Site visit - Mining Site A to assess fuel storage and dispensing.', completed: false, assignedTo: authorId },
    { date: new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10), time: '11:00', type: 'Email', description: 'Sent information pack and introductory email.', completed: true, assignedTo: authorId }
  ]
  for (const f of followUpData) {
    await prisma.clientFollowUp.create({
      data: {
        clientId: leadId,
        date: f.date,
        time: f.time,
        type: f.type,
        description: f.description,
        completed: f.completed,
        assignedTo: f.assignedTo ?? undefined
      }
    })
  }
  console.log(`   ✅ ${followUpData.length} follow-ups`)

  // Services (proposed services)
  const serviceData = [
    { name: 'Fuel Management System Installation', description: 'Hardware and software for fleet fuel tracking.', price: 350000, status: 'Proposed', notes: 'Phase 1 scope.' },
    { name: 'Annual Support & Maintenance', description: '12-month support, updates, and on-call.', price: 50000, status: 'Proposed', notes: 'Included in proposal.' }
  ]
  for (const s of serviceData) {
    await prisma.clientService.create({
      data: {
        clientId: leadId,
        name: s.name,
        description: s.description,
        price: s.price,
        status: s.status,
        notes: s.notes ?? '',
        startDate: null,
        endDate: null
      }
    })
  }
  console.log(`   ✅ ${serviceData.length} services`)

  // Update lead activityLog (append to JSON)
  const existingActivity = typeof lead.activityLog === 'string' ? (() => { try { return JSON.parse(lead.activityLog || '[]') } catch { return [] } })() : (Array.isArray(lead.activityLog) ? lead.activityLog : [])
  const newEntries = [
    { id: Date.now(), type: 'Sub-data seeded', description: 'Contacts, comments, sites, proposals, follow-ups and services added for demo.', timestamp: new Date().toISOString(), user: authorName, relatedId: null },
    { id: Date.now() + 1, type: 'Comment added', description: 'Initial inquiry logged.', timestamp: new Date().toISOString(), user: authorName, relatedId: null }
  ]
  const activityLog = JSON.stringify([...existingActivity, ...newEntries])
  await prisma.client.update({
    where: { id: leadId },
    data: { activityLog }
  })
  console.log('   ✅ Activity log updated')

  console.log('\n✅ New Mining Company lead: all sub-data added.')
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('❌', e)
    prisma.$disconnect()
    process.exit(1)
  })
