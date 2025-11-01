// Apply JobCard migration directly to the database
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function applyMigration() {
    console.log('🚀 Applying JobCard migration...');
    
    try {
        // Check if JobCard table already exists
        const tableExists = await prisma.$queryRaw`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'JobCard'
            );
        `;
        
        if (tableExists[0].exists) {
            console.log('✅ JobCard table already exists');
            const count = await prisma.jobCard.count();
            console.log(`📊 Current job cards in database: ${count}`);
            return;
        }
        
        console.log('📋 Creating JobCard table...');
        
        // Create JobCard table
        await prisma.$executeRaw`
            CREATE TABLE "JobCard" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "jobCardNumber" TEXT NOT NULL UNIQUE,
                "agentName" TEXT NOT NULL DEFAULT '',
                "otherTechnicians" TEXT NOT NULL DEFAULT '[]',
                "clientId" TEXT,
                "clientName" TEXT NOT NULL DEFAULT '',
                "siteId" TEXT NOT NULL DEFAULT '',
                "siteName" TEXT NOT NULL DEFAULT '',
                "location" TEXT NOT NULL DEFAULT '',
                "timeOfDeparture" TIMESTAMP,
                "timeOfArrival" TIMESTAMP,
                "vehicleUsed" TEXT NOT NULL DEFAULT '',
                "kmReadingBefore" DOUBLE PRECISION NOT NULL DEFAULT 0,
                "kmReadingAfter" DOUBLE PRECISION NOT NULL DEFAULT 0,
                "travelKilometers" DOUBLE PRECISION NOT NULL DEFAULT 0,
                "reasonForVisit" TEXT NOT NULL DEFAULT '',
                "diagnosis" TEXT NOT NULL DEFAULT '',
                "otherComments" TEXT NOT NULL DEFAULT '',
                "photos" TEXT NOT NULL DEFAULT '[]',
                "status" TEXT NOT NULL DEFAULT 'draft',
                "submittedAt" TIMESTAMP,
                "completedAt" TIMESTAMP,
                "ownerId" TEXT,
                "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `;
        
        // Create indexes
        console.log('📇 Creating indexes...');
        await prisma.$executeRaw`CREATE INDEX "JobCard_clientId_idx" ON "JobCard"("clientId");`;
        await prisma.$executeRaw`CREATE INDEX "JobCard_ownerId_idx" ON "JobCard"("ownerId");`;
        await prisma.$executeRaw`CREATE INDEX "JobCard_status_idx" ON "JobCard"("status");`;
        await prisma.$executeRaw`CREATE INDEX "JobCard_createdAt_idx" ON "JobCard"("createdAt");`;
        
        // Create updatedAt trigger
        console.log('🔧 Creating updatedAt trigger...');
        await prisma.$executeRaw`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW."updatedAt" = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `;
        
        await prisma.$executeRaw`
            CREATE TRIGGER update_jobcard_updated_at BEFORE UPDATE ON "JobCard"
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        `;
        
        console.log('✅ JobCard table created successfully!');
        console.log('📊 Ready to accept job cards from field agents');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

applyMigration()
    .then(() => {
        console.log('\n🎉 Migration complete!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Migration failed:', error);
        process.exit(1);
    });

