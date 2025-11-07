import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

(async () => {
  try {
    const user = await prisma.user.findFirst({ 
      where: { email: { contains: 'gemuack' } }, 
      select: { id: true, email: true, name: true, permissions: true, role: true } 
    });
    
    console.log('User found:', JSON.stringify(user, null, 2));
    
    if (user) {
      console.log('\nCurrent permissions:', user.permissions);
      console.log('Permissions type:', typeof user.permissions);
      
      if (user.permissions) {
        try {
          const parsed = JSON.parse(user.permissions);
          console.log('Parsed permissions:', parsed);
          console.log('Is array:', Array.isArray(parsed));
        } catch(e) {
          console.log('Failed to parse:', e.message);
        }
      }
      
      // Try to update permissions
      console.log('\n🔧 Testing permissions update...');
      const testPermissions = JSON.stringify(['access_crm', 'access_projects']);
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { permissions: testPermissions },
        select: { id: true, email: true, permissions: true }
      });
      
      console.log('✅ Updated user:', updated);
      console.log('Updated permissions:', updated.permissions);
      
      // Read it back
      const readBack = await prisma.user.findUnique({
        where: { id: user.id },
        select: { permissions: true }
      });
      
      console.log('\n📖 Read back from DB:', readBack);
      console.log('Permissions match:', readBack.permissions === testPermissions);
    } else {
      console.log('User not found');
    }
  } catch(e) {
    console.error('Error:', e.message);
    console.error(e.stack);
  } finally {
    await prisma.$disconnect();
  }
})();

