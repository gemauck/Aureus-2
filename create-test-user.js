// Create test admin user for testing
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const prisma = new PrismaClient();

async function createTestUser() {
  try {
    const email = 'test-admin@example.com';
    const password = 'test123';
    
    console.log('🔍 Checking for test user:', email);
    
    const existing = await prisma.user.findUnique({
      where: { email }
    });
    
    if (existing) {
      console.log('✅ User exists, updating password...');
      const passwordHash = await bcrypt.hash(password, 10);
      await prisma.user.update({
        where: { email },
        data: {
          passwordHash,
          role: 'admin',
          status: 'active'
        }
      });
      console.log('✅ Password updated!');
    } else {
      console.log('➕ Creating new test user...');
      const passwordHash = await bcrypt.hash(password, 10);
      await prisma.user.create({
        data: {
          email,
          name: 'Test Admin',
          passwordHash,
          role: 'admin',
          status: 'active',
          provider: 'local'
        }
      });
      console.log('✅ Test user created!');
    }
    
    console.log('\n📋 Test Credentials:');
    console.log('   Email:', email);
    console.log('   Password:', password);
    console.log('   Role: admin');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();

