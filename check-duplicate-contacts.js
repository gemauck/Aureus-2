import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkDuplicates() {
    try {
        console.log('🔍 Checking for duplicate contacts...\n');
        
        // Get a specific client (AccuFarm) to test
        const client = await prisma.client.findFirst({
            where: {
                name: { contains: 'AccuFarm', mode: 'insensitive' }
            },
            include: {
                clientContacts: true
            }
        });
        
        if (!client) {
            console.log('❌ AccuFarm client not found');
            return;
        }
        
        console.log(`✅ Found client: ${client.name} (ID: ${client.id})`);
        console.log(`\n📊 Normalized Contacts (ClientContact table): ${client.clientContacts.length}`);
        client.clientContacts.forEach((contact, idx) => {
            console.log(`  ${idx + 1}. ID: ${contact.id}, Name: ${contact.name}, Email: ${contact.email}`);
        });
        
        // Check JSON fields
        let jsonContacts = [];
        if (client.contactsJsonb && Array.isArray(client.contactsJsonb)) {
            jsonContacts = client.contactsJsonb;
        } else if (client.contacts) {
            try {
                jsonContacts = JSON.parse(client.contacts);
            } catch (e) {
                jsonContacts = [];
            }
        }
        
        console.log(`\n📋 JSON Field Contacts: ${jsonContacts.length}`);
        jsonContacts.forEach((contact, idx) => {
            console.log(`  ${idx + 1}. ID: ${contact?.id}, Name: ${contact?.name}, Email: ${contact?.email}`);
        });
        
        // Check for duplicates by ID
        const normalizedIds = new Set(client.clientContacts.map(c => String(c.id)));
        const jsonIds = jsonContacts.map(c => String(c?.id)).filter(Boolean);
        
        console.log(`\n🔍 Duplicate Check:`);
        console.log(`  Normalized contact IDs: ${Array.from(normalizedIds).join(', ')}`);
        console.log(`  JSON contact IDs: ${jsonIds.join(', ')}`);
        
        const duplicatesInNormalized = [];
        const seen = new Set();
        client.clientContacts.forEach(contact => {
            const id = String(contact.id);
            if (seen.has(id)) {
                duplicatesInNormalized.push(contact);
            }
            seen.add(id);
        });
        
        if (duplicatesInNormalized.length > 0) {
            console.log(`\n⚠️  WARNING: Found ${duplicatesInNormalized.length} duplicate contacts in normalized table!`);
            duplicatesInNormalized.forEach(dup => {
                console.log(`  - ID: ${dup.id}, Name: ${dup.name}`);
            });
        }
        
        // Check if same contacts exist in both normalized and JSON
        const inBoth = [];
        jsonContacts.forEach(jsonContact => {
            if (jsonContact?.id && normalizedIds.has(String(jsonContact.id))) {
                inBoth.push({
                    id: jsonContact.id,
                    name: jsonContact.name,
                    normalized: client.clientContacts.find(c => String(c.id) === String(jsonContact.id)),
                    json: jsonContact
                });
            }
        });
        
        if (inBoth.length > 0) {
            console.log(`\n⚠️  WARNING: ${inBoth.length} contacts exist in BOTH normalized table AND JSON fields:`);
            inBoth.forEach(item => {
                console.log(`  - ID: ${item.id}, Name: ${item.name}`);
                console.log(`    Normalized: ${JSON.stringify(item.normalized, null, 2)}`);
                console.log(`    JSON: ${JSON.stringify(item.json, null, 2)}`);
            });
            console.log(`\n💡 This could cause duplicates in the UI! The API's parseClientJsonFields should prioritize normalized tables.`);
        } else {
            console.log(`\n✅ No contacts found in both normalized and JSON fields.`);
        }
        
        // Check for contacts with same name but different IDs
        const nameMap = new Map();
        client.clientContacts.forEach(contact => {
            const name = contact.name?.toLowerCase();
            if (!nameMap.has(name)) {
                nameMap.set(name, []);
            }
            nameMap.get(name).push(contact);
        });
        
        const sameNameDiffId = [];
        nameMap.forEach((contacts, name) => {
            if (contacts.length > 1) {
                const ids = contacts.map(c => c.id);
                if (new Set(ids).size > 1) {
                    sameNameDiffId.push({ name, contacts });
                }
            }
        });
        
        if (sameNameDiffId.length > 0) {
            console.log(`\n⚠️  WARNING: Found contacts with same name but different IDs:`);
            sameNameDiffId.forEach(({ name, contacts }) => {
                console.log(`  - Name: "${name}"`);
                contacts.forEach(c => {
                    console.log(`    ID: ${c.id}, Email: ${c.email}`);
                });
            });
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkDuplicates();

