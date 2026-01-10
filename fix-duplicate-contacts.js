import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fixDuplicates() {
    try {
        console.log('🔍 Finding and fixing duplicate contacts...\n');
        
        // Get AccuFarm client
        const client = await prisma.client.findFirst({
            where: {
                name: { contains: 'AccuFarm', mode: 'insensitive' }
            },
            include: {
                clientContacts: {
                    orderBy: { createdAt: 'asc' } // Keep the oldest one
                }
            }
        });
        
        if (!client) {
            console.log('❌ AccuFarm client not found');
            return;
        }
        
        console.log(`✅ Found client: ${client.name} (ID: ${client.id})`);
        console.log(`📊 Total contacts: ${client.clientContacts.length}\n`);
        
        // Group contacts by name+email
        const groups = new Map();
        client.clientContacts.forEach(contact => {
            const name = String(contact.name || '').toLowerCase().trim();
            const email = String(contact.email || '').toLowerCase().trim();
            const key = `${name}::${email}`;
            
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(contact);
        });
        
        // Find duplicates
        const duplicates = [];
        groups.forEach((contacts, key) => {
            if (contacts.length > 1) {
                duplicates.push({ key, contacts });
            }
        });
        
        if (duplicates.length === 0) {
            console.log('✅ No duplicate contacts found!');
            return;
        }
        
        console.log(`⚠️  Found ${duplicates.length} duplicate group(s):\n`);
        
        for (const { key, contacts } of duplicates) {
            console.log(`📋 Duplicate group: ${key}`);
            console.log(`   Contacts: ${contacts.length}`);
            
            // Keep the first (oldest) one, delete the rest
            const toKeep = contacts[0];
            const toDelete = contacts.slice(1);
            
            console.log(`   ✅ Keeping: ID ${toKeep.id} (created: ${toKeep.createdAt})`);
            console.log(`   ❌ Deleting: ${toDelete.map(c => `ID ${c.id}`).join(', ')}\n`);
            
            // Delete duplicates
            for (const contact of toDelete) {
                await prisma.clientContact.delete({
                    where: { id: contact.id }
                });
                console.log(`   🗑️  Deleted contact: ${contact.id}`);
            }
        }
        
        console.log('\n✅ Duplicate contacts removed!');
        
        // Verify
        const updated = await prisma.client.findUnique({
            where: { id: client.id },
            include: { clientContacts: true }
        });
        console.log(`\n📊 Remaining contacts: ${updated.clientContacts.length}`);
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

fixDuplicates();

