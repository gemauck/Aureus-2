// Check admin user configuration in database
import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAdminUser() {
    console.log('🔍 Checking Admin User Configuration\n');
    console.log('='.repeat(60));
    
    try {
        // Get all users
        const allUsers = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                status: true
            }
        });
        
        console.log(`📊 Total users in database: ${allUsers.length}\n`);
        
        // Check for admin users
        const adminUsers = allUsers.filter(u => {
            const role = (u.role || '').toLowerCase();
            return role === 'admin';
        });
        
        console.log(`👥 Admin users found: ${adminUsers.length}\n`);
        
        if (adminUsers.length === 0) {
            console.log('❌ NO ADMIN USERS FOUND!\n');
            console.log('📋 All users in database:');
            allUsers.forEach((user, index) => {
                console.log(`   ${index + 1}. ${user.name || 'N/A'} (${user.email || 'NO EMAIL'})`);
                console.log(`      Role: ${user.role || 'N/A'} | Status: ${user.status || 'N/A'}`);
            });
            return;
        }
        
        adminUsers.forEach((user, index) => {
            console.log(`Admin ${index + 1}:`);
            console.log(`   Name: ${user.name || 'N/A'}`);
            console.log(`   Email: ${user.email || '❌ NO EMAIL!'}`);
            console.log(`   Role: ${user.role || 'N/A'}`);
            console.log(`   Status: ${user.status || 'N/A'}`);
            
            if (!user.email) {
                console.log('   ⚠️  WARNING: No email address!');
            }
            
            if (user.email && user.email.toLowerCase() === 'garethm@abcotronics.co.za') {
                console.log('   ✅ This is the correct admin email!');
            }
            
            if (user.status && user.status.toLowerCase() !== 'active') {
                console.log('   ⚠️  WARNING: Status is not "active"!');
            }
            
            console.log('');
        });
        
        // Check for the specific admin
        const garethAdmin = adminUsers.find(u => 
            u.email && u.email.toLowerCase() === 'garethm@abcotronics.co.za'
        );
        
        if (garethAdmin) {
            console.log('✅ Found admin user with email: garethm@abcotronics.co.za');
            console.log('   This user should receive feedback notifications');
        } else {
            console.log('❌ Admin user with email garethm@abcotronics.co.za NOT FOUND');
            console.log('   Check if the email is correct in the database');
        }
        
    } catch (error) {
        console.error('❌ Error checking users:', error.message);
        if (error.message.includes('protocol')) {
            console.error('\n⚠️  Database connection issue');
            console.error('   Check your DATABASE_URL in .env file');
        }
    } finally {
        await prisma.$disconnect();
    }
}

checkAdminUser();

