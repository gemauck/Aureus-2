import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function testContactsNoDuplicates() {
    try {
        console.log('🧪 Testing contacts for duplicates...\n');
        
        // Test 1: Check AccuFarm client
        const accuFarm = await prisma.client.findFirst({
            where: {
                name: { contains: 'AccuFarm', mode: 'insensitive' }
            },
            include: {
                clientContacts: {
                    orderBy: { name: 'asc' }
                }
            }
        });
        
        if (!accuFarm) {
            console.log('❌ AccuFarm client not found');
            return;
        }
        
        console.log(`✅ Test 1: AccuFarm Client (${accuFarm.name})`);
        console.log(`   Contacts in database: ${accuFarm.clientContacts.length}`);
        
        // Check for duplicates by name+email
        const contactMap = new Map();
        const duplicates = [];
        
        accuFarm.clientContacts.forEach(contact => {
            const name = String(contact.name || '').toLowerCase().trim();
            const email = String(contact.email || '').toLowerCase().trim();
            const key = `${name}::${email}`;
            
            if (contactMap.has(key)) {
                duplicates.push({
                    key,
                    existing: contactMap.get(key),
                    duplicate: contact
                });
            } else {
                contactMap.set(key, contact);
            }
        });
        
        if (duplicates.length > 0) {
            console.log(`   ❌ FAILED: Found ${duplicates.length} duplicate(s)`);
            duplicates.forEach(({ key, existing, duplicate }) => {
                console.log(`      Duplicate: ${key}`);
                console.log(`        - ID: ${existing.id} (created: ${existing.createdAt})`);
                console.log(`        - ID: ${duplicate.id} (created: ${duplicate.createdAt})`);
            });
        } else {
            console.log(`   ✅ PASSED: No duplicates found`);
            accuFarm.clientContacts.forEach((contact, idx) => {
                console.log(`      ${idx + 1}. ${contact.name} (${contact.email})`);
            });
        }
        
        // Test 2: Check all clients for duplicates
        console.log('\n🧪 Test 2: Checking all clients for duplicate contacts...\n');
        
        const allClients = await prisma.client.findMany({
            include: {
                clientContacts: true
            }
        });
        
        let totalDuplicates = 0;
        const clientsWithDuplicates = [];
        
        for (const client of allClients) {
            const clientMap = new Map();
            const clientDuplicates = [];
            
            client.clientContacts.forEach(contact => {
                const name = String(contact.name || '').toLowerCase().trim();
                const email = String(contact.email || '').toLowerCase().trim();
                const key = `${name}::${email}`;
                
                if (clientMap.has(key)) {
                    clientDuplicates.push({
                        key,
                        existing: clientMap.get(key),
                        duplicate: contact
                    });
                } else {
                    clientMap.set(key, contact);
                }
            });
            
            if (clientDuplicates.length > 0) {
                totalDuplicates += clientDuplicates.length;
                clientsWithDuplicates.push({
                    client: client.name,
                    clientId: client.id,
                    duplicates: clientDuplicates
                });
            }
        }
        
        if (totalDuplicates > 0) {
            console.log(`❌ FAILED: Found ${totalDuplicates} duplicate(s) across ${clientsWithDuplicates.length} client(s)\n`);
            clientsWithDuplicates.forEach(({ client, clientId, duplicates }) => {
                console.log(`   Client: ${client} (${clientId})`);
                duplicates.forEach(({ key, existing, duplicate }) => {
                    console.log(`      Duplicate: ${key}`);
                    console.log(`        - ID: ${existing.id}`);
                    console.log(`        - ID: ${duplicate.id}`);
                });
                console.log('');
            });
        } else {
            console.log(`✅ PASSED: No duplicates found across ${allClients.length} clients`);
        }
        
        // Test 3: Simulate UI deduplication logic
        console.log('\n🧪 Test 3: Simulating UI deduplication logic...\n');
        
        function mergeUniqueById(items = [], extras = []) {
            const mapById = new Map();
            const mapByKey = new Map();
            
            [...(items || []), ...(extras || [])].forEach(item => {
                if (!item) return;
                
                const name = String(item.name || '').toLowerCase().trim();
                const email = String(item.email || '').toLowerCase().trim();
                const key = `${name}::${email}`;
                
                if (item.id) {
                    const id = String(item.id);
                    if (mapById.has(id)) {
                        const existing = mapById.get(id);
                        const existingFieldCount = Object.values(existing).filter(v => v !== null && v !== undefined && v !== '').length;
                        const newFieldCount = Object.values(item).filter(v => v !== null && v !== undefined && v !== '').length;
                        if (newFieldCount > existingFieldCount) {
                            mapById.set(id, item);
                            if (key) mapByKey.set(key, item);
                        }
                    } else {
                        mapById.set(id, item);
                        if (key) mapByKey.set(key, item);
                    }
                } else if (key && !mapByKey.has(key)) {
                    mapByKey.set(key, item);
                } else if (key && mapByKey.has(key)) {
                    const existing = mapByKey.get(key);
                    const existingFieldCount = Object.values(existing).filter(v => v !== null && v !== undefined && v !== '').length;
                    const newFieldCount = Object.values(item).filter(v => v !== null && v !== undefined && v !== '').length;
                    if (newFieldCount > existingFieldCount) {
                        mapByKey.set(key, item);
                    }
                }
            });
            
            const finalMap = new Map();
            mapById.forEach((item, id) => finalMap.set(id, item));
            mapByKey.forEach((item, key) => {
                if (!item.id || !finalMap.has(String(item.id))) {
                    finalMap.set(key, item);
                }
            });
            
            return Array.from(finalMap.values());
        }
        
        // Simulate having duplicate contacts (same name/email, different IDs)
        const testContacts = accuFarm.clientContacts.map(c => ({
            id: c.id,
            name: c.name,
            email: c.email,
            phone: c.phone,
            mobile: c.mobile,
            role: c.role,
            isPrimary: c.isPrimary
        }));
        
        // Add a duplicate (same name/email, different ID)
        if (testContacts.length > 0) {
            const duplicateContact = {
                ...testContacts[0],
                id: 'test-duplicate-id-' + Date.now()
            };
            testContacts.push(duplicateContact);
            
            const deduplicated = mergeUniqueById(testContacts);
            
            console.log(`   Input contacts: ${testContacts.length}`);
            console.log(`   After deduplication: ${deduplicated.length}`);
            
            if (deduplicated.length < testContacts.length) {
                console.log(`   ✅ PASSED: Deduplication worked (removed ${testContacts.length - deduplicated.length} duplicate(s))`);
            } else {
                console.log(`   ❌ FAILED: Deduplication did not work`);
            }
        }
        
        console.log('\n✅ All tests completed!\n');
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testContactsNoDuplicates();



