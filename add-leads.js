// Add bulk leads to the database
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to load .env file if it exists
const envPath = join(__dirname, '.env');
if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log('📝 Loaded .env file from:', envPath);
} else {
    console.log('ℹ️  No .env file found, using environment variables');
    dotenv.config(); // Still try to load from process.env
}

import { PrismaClient } from '@prisma/client';

// Check for DATABASE_URL before initializing Prisma
if (!process.env.DATABASE_URL) {
    console.error('\n❌ DATABASE_URL is not set!');
    console.error('\n📋 To fix this, you can:');
    console.error('   1. Create a .env file in the project root with:');
    console.error('      DATABASE_URL="postgresql://user:password@host:port/database"');
    console.error('\n   2. Or export it before running the script:');
    console.error('      export DATABASE_URL="postgresql://user:password@host:port/database"');
    console.error('      node add-leads.js');
    console.error('\n   3. Or use the connect-db.sh script to set up the connection');
    console.error('\n💡 Your DATABASE_URL should look like:');
    console.error('   postgresql://username:password@hostname:port/database?sslmode=require');
    process.exit(1);
}

const prisma = new PrismaClient();

// List of companies to add as leads
const companies = [
    'Coastal Coal',
    'Petra Diamonds',
    'Anglo American',
    'Implats',
    'Liberty',
    'De Beers',
    'Sibanye Stilwater',
    'Pan African Resources',
    'Africa In Transit AIT',
    'Glencore',
    'Implats MIC',
    'Assmang and Assore',
    'African Rainbow Minerals and Royal Bafokeng',
    'Foscor',
    'Khumba and Khumani',
    'Shumba Energy (Botswana)',
    'Northam Platinum/Palladium Group Metals',
    'Richards Bay Minerals',
    'Afrimat',
    'Northam Platinum',
    'Siyanda Bakgatla Platinum Mine (Pty) Ltd (Union Mine)',
    'Rio Tinto',
    'South 32',
    'Sasol Mining',
    'Harmony Gold',
    'Palaborwa Mining Company',
    'Ndalamo Group',
    'Zivuma Commodities and Mining',
    'T and K Group Emalahleni',
    'Copper 360',
    'Cometa Group',
    'Into Africa Mining and Exploration',
    'Plantcor Mining',
    'Mosobo Coal',
    'Future Coal',
    'Lebano Mining',
    'Benhaus Mining',
    'BBT',
    'Zamera Logistics (PTY) Ltd',
    'Transnet',
    'Total Energies',
    'Engen',
    'Petredec Fuels KZN',
    'Khuthele Forestry',
    'Emseni Farms',
    'Sun City',
    'Sappi',
    'Energy Drive',
    'Smart Vision',
    'Ava',
    'Rocket DNA',
    'Middleburg Mining Services - Sereti',
    'Vedanta Zinc',
    'United Manganese Of Kalahari',
    'Assmang Khumani',
    'Anglo Mogalakwena',
    'Namdeb',
    'Rosh Pina Namibia',
    'Tshipi e Ntele Manganese',
    'Umsimbithi',
    'Andru Mining',
    'Inayo Mining',
    'AEMFC',
    'B and E International',
    'Buffalo Coal',
    'ALS Contractors',
    'Sefateng Chrome - Aubrey Uoane - CFO',
    'Michael Mathabatha - Mining Manager',
    'Gerard Blaauw - CEO',
    'Salaria Contractors',
    'Trollope Group',
    'Zizwe Opencast Mining',
    'Moolmans',
    'Inala Mining - Inmine',
    'Ritluka',
    'Africoal SA',
    'Menar Mining including Canyon Coal',
    'Zululand Antracite',
    'MC Mining',
    'Cobus Bronn',
    'Orion Minerals',
    'Deep Yellow Uranium',
    'African Nickel',
    'MN48',
    'Terracom',
    'Modi Mining',
    'Afrisam',
    'Lubocon'
];

// Determine industry based on company name keywords
function getIndustry(name) {
    const lowerName = name.toLowerCase();
    
    if (lowerName.includes('mining') || lowerName.includes('coal') || 
        lowerName.includes('diamond') || lowerName.includes('platinum') ||
        lowerName.includes('manganese') || lowerName.includes('uranium') ||
        lowerName.includes('nickel') || lowerName.includes('chrome') ||
        lowerName.includes('antracite') || lowerName.includes('minerals') ||
        lowerName.includes('gold') || lowerName.includes('zinc') ||
        lowerName.includes('copper') || lowerName.includes('palladium')) {
        return 'Mining';
    }
    
    if (lowerName.includes('forestry') || lowerName.includes('farms')) {
        return 'Agriculture';
    }
    
    if (lowerName.includes('fuel') || lowerName.includes('energy') || 
        lowerName.includes('energies') || lowerName.includes('engen')) {
        return 'Energy';
    }
    
    if (lowerName.includes('logistics') || lowerName.includes('transit') || 
        lowerName.includes('transport') || lowerName.includes('transnet')) {
        return 'Logistics';
    }
    
    if (lowerName.includes('contractor') || lowerName.includes('services') ||
        lowerName.includes('group') || lowerName.includes('contractors')) {
        return 'Services';
    }
    
    return 'Other';
}

async function addLeads() {
    console.log('🚀 Starting bulk lead addition...\n');
    console.log(`📋 Total companies to add: ${companies.length}\n`);
    console.log('='.repeat(60));
    
    try {
        // Get existing leads to check for duplicates
        const existingLeads = await prisma.client.findMany({
            where: { type: 'lead' },
            select: { name: true }
        });
        
        const existingNames = new Set(existingLeads.map(l => l.name.toLowerCase()));
        console.log(`📊 Existing leads in database: ${existingLeads.length}\n`);
        
        let created = 0;
        let skipped = 0;
        let errors = 0;
        
        for (const companyName of companies) {
            const normalizedName = companyName.trim();
            
            if (!normalizedName) {
                console.log(`⚠️  Skipping empty name`);
                skipped++;
                continue;
            }
            
            // Check if lead already exists
            if (existingNames.has(normalizedName.toLowerCase())) {
                console.log(`⏭️  Skipping "${normalizedName}" - already exists`);
                skipped++;
                continue;
            }
            
            const industry = getIndustry(normalizedName);
            const now = new Date();
            
            // Create lead data matching the API structure
            const leadData = {
                name: normalizedName,
                type: 'lead',
                industry: industry,
                status: 'active',
                stage: 'Awareness',
                revenue: 0,
                value: 0,
                probability: 0,
                lastContact: now,
                address: '',
                website: '',
                notes: `Lead added via bulk import on ${now.toISOString().split('T')[0]}`,
                contacts: JSON.stringify([]),
                followUps: JSON.stringify([]),
                projectIds: JSON.stringify([]),
                comments: JSON.stringify([]),
                sites: JSON.stringify([]),
                contracts: JSON.stringify([]),
                activityLog: JSON.stringify([{
                    id: Date.now(),
                    type: 'Lead Created',
                    description: `Lead created: ${normalizedName}`,
                    timestamp: now.toISOString(),
                    user: 'System',
                    userId: 'system',
                    userEmail: 'system@abcotronics.co.za'
                }]),
                billingTerms: JSON.stringify({
                    paymentTerms: 'Net 30',
                    billingFrequency: 'Monthly',
                    currency: 'ZAR',
                    retainerAmount: 0,
                    taxExempt: false,
                    notes: ''
                }),
                proposals: JSON.stringify([]),
                services: JSON.stringify([])
            };
            
            try {
                const lead = await prisma.client.create({
                    data: leadData
                });
                
                console.log(`✅ Created: "${normalizedName}" (${industry})`);
                created++;
                existingNames.add(normalizedName.toLowerCase()); // Track newly created
            } catch (error) {
                console.error(`❌ Error creating "${normalizedName}":`, error.message);
                errors++;
            }
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 Summary:');
        console.log(`   ✅ Created: ${created}`);
        console.log(`   ⏭️  Skipped: ${skipped}`);
        console.log(`   ❌ Errors: ${errors}`);
        console.log(`   📋 Total processed: ${companies.length}`);
        
        // Verify final count
        const finalCount = await prisma.client.count({
            where: { type: 'lead' }
        });
        console.log(`\n📊 Total leads in database now: ${finalCount}`);
        
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        if (error.message.includes('protocol')) {
            console.error('\n⚠️  Database connection issue');
            console.error('   Check your DATABASE_URL in .env file');
        }
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run the script
addLeads()
    .then(() => {
        console.log('\n✅ Bulk lead addition completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });

