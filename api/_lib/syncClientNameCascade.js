/**
 * Propagate Client.name to denormalized clientName on related records
 * (job cards, sales orders, projects, invoices).
 */

export async function cascadeClientNameToRelatedRecords(prisma, clientId, newName) {
  const id = String(clientId ?? '').trim()
  const name = String(newName ?? '').trim()
  if (!id || !name) {
    return { jobCards: 0, salesOrders: 0, projects: 0, invoices: 0 }
  }

  const [jobCards, salesOrders, projects, invoices] = await Promise.all([
    prisma.jobCard.updateMany({ where: { clientId: id }, data: { clientName: name } }),
    prisma.salesOrder.updateMany({ where: { clientId: id }, data: { clientName: name } }),
    prisma.project.updateMany({ where: { clientId: id }, data: { clientName: name } }),
    prisma.invoice.updateMany({ where: { clientId: id }, data: { clientName: name } })
  ])

  return {
    jobCards: jobCards.count,
    salesOrders: salesOrders.count,
    projects: projects.count,
    invoices: invoices.count
  }
}
