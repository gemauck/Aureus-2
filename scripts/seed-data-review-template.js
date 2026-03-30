/**
 * Seeds the shared "Data Review Template" for Monthly Data Review (template type monthly-data-review).
 * Safe to run multiple times: updates by name + type if already present.
 *
 * Usage: node scripts/seed-data-review-template.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEMPLATE_NAME = 'Data Review Template';
const TEMPLATE_TYPE = 'monthly-data-review';

const d = (id, name) => ({
  templateDocId: id,
  name,
  description: '',
  parentTemplateDocId: null
});

const sections = [
  {
    name: 'Data Review Process',
    description: '',
    documents: [
      d('mdr-drp-1', 'Import Transaction Data'),
      d('mdr-drp-2', 'Update New Assets'),
      d('mdr-drp-3', 'Check All Assets'),
      d('mdr-drp-4', 'Dispense Eligibility Review'),
      d('mdr-drp-5', 'SMR Comments'),
      d('mdr-drp-6', 'Fuel Receipts and Prices'),
      d('mdr-drp-7', 'Fuel Variances and Stock Adjustments'),
      d('mdr-drp-8', 'Meter Review'),
      d('mdr-drp-9', 'Pump Before and After Import'),
      d('mdr-drp-10', 'Tank Before After'),
      d('mdr-drp-11', 'Proof of Activity Review'),
      d('mdr-drp-12', 'SMR Integration'),
      d('mdr-drp-13', 'Detailed Fuel Refund Report Review')
    ]
  },
  {
    name: 'Reporting and Finalisation',
    description: '',
    documents: [
      d('mdr-rf-1', 'Detailed Fuel Refund Report Finalisation'),
      d('mdr-rf-2', 'Compliance Data Pack'),
      d('mdr-rf-3', 'Feedback to Fuel Manager'),
      d('mdr-rf-4', 'Month End Meeting Report')
    ]
  },
  {
    name: 'Post Process',
    description: '',
    documents: []
  }
];

async function main() {
  const description =
    'Standard monthly data review checklist: data review process, reporting and finalisation, post process';

  const existing = await prisma.documentCollectionTemplate.findFirst({
    where: { name: TEMPLATE_NAME, type: TEMPLATE_TYPE }
  });

  if (existing) {
    await prisma.documentCollectionTemplate.update({
      where: { id: existing.id },
      data: {
        description,
        sections: JSON.stringify(sections),
        updatedBy: 'seed-data-review-template.js'
      }
    });
    console.log(`Updated template "${TEMPLATE_NAME}" (${existing.id})`);
  } else {
    const created = await prisma.documentCollectionTemplate.create({
      data: {
        name: TEMPLATE_NAME,
        description,
        sections: JSON.stringify(sections),
        isDefault: false,
        type: TEMPLATE_TYPE,
        createdBy: 'seed-data-review-template.js',
        updatedBy: 'seed-data-review-template.js'
      }
    });
    console.log(`Created template "${TEMPLATE_NAME}" (${created.id})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
