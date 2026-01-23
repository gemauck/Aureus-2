import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fixAllDuplicates() {
    try {
        console.log('🔍 Finding and fixing ALL duplicate contacts...\n');
        
        const allClients = await prisma.client.findMany({
            include: {
                clientContacts: {
                    orderBy: { createdAt: 'asc' } // Keep the oldest one
                }
            }
        });
        
        let totalFixed = 0;
        const results = [];
        
        for (const client of allClients) {
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
                continue; // Skip clients with no duplicates
            }
            
            let clientFixed = 0;
            for (const { key, contacts } of duplicates) {
                // Keep the first (oldest) one, delete the rest
                const toKeep = contacts[0];
                const toDelete = contacts.slice(1);
                
                // Delete duplicates
                for (const contact of toDelete) {
                    await prisma.clientContact.delete({
                        where: { id: contact.id }
                    });
                    clientFixed++;
                    totalFixed++;
                }
            }
            
            if (clientFixed > 0) {
                results.push({
                    client: client.name,
                    clientId: client.id,
                    fixed: clientFixed
                });
            }
        }
        
        if (totalFixed === 0) {
            console.log('✅ No duplicate contacts found!');
            return;
        }
        
        console.log(`✅ Fixed ${totalFixed} duplicate contact(s) across ${results.length} client(s):\n`);
        
        results.forEach(({ client, fixed }) => {
            console.log(`   ${client}: Removed ${fixed} duplicate(s)`);
        });
        
        console.log('\n✅ All duplicates removed!');
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

fixAllDuplicates();
















