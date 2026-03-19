// One-off: Revert "Menar Mining" from client back to lead (undo lead-to-client conversion)
import { prisma } from '../api/_lib/prisma.js'

const NAME_MATCH = 'Menar Mining' // exact or partial match

async function revertToLead() {
  const client = await prisma.client.findFirst({
    where: {
      type: 'client',
      name: { contains: NAME_MATCH, mode: 'insensitive' }
    }
  })

  if (!client) {
    console.log(`No client found with name containing "${NAME_MATCH}" and type='client'.`)
    process.exit(1)
  }

  console.log(`Found: ${client.name} (id: ${client.id}, type: ${client.type})`)
  await prisma.client.update({
    where: { id: client.id },
    data: { type: 'lead' }
  })
  console.log(`Updated type to 'lead'. Menar Mining will appear under Leads again.`)
}

revertToLead()
  .then(() => {
    console.log('Done.')
    process.exit(0)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
