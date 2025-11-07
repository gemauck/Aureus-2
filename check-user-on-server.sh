#!/bin/bash
# Script to check user status on production server
# Run this on the server: ssh root@abcoafrica.co.za "bash -s" < check-user-on-server.sh

set -e

echo "🔍 Checking user status on server..."
echo ""

cd /var/www/abcotronics-erp

# Check if user exists and their status
node -e "
import('@prisma/client').then(({ PrismaClient }) => {
  const prisma = new PrismaClient();
  const email = 'garethm@abcotronics.co.za';
  
  prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      passwordHash: true,
      role: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true
    }
  }).then(user => {
    if (!user) {
      console.log('❌ User not found in database');
      console.log('');
      console.log('💡 The user needs to be created');
      process.exit(1);
    }
    
    console.log('✅ User found:');
    console.log('  ID:', user.id);
    console.log('  Name:', user.name || 'Not set');
    console.log('  Email:', user.email);
    console.log('  Role:', user.role);
    console.log('  Status:', user.status);
    console.log('  Has password hash:', !!user.passwordHash);
    console.log('  Password hash length:', user.passwordHash?.length || 0);
    console.log('  Must change password:', user.mustChangePassword);
    console.log('  Created:', user.createdAt);
    console.log('  Last login:', user.lastLoginAt || 'Never');
    console.log('');
    
    const issues = [];
    if (!user.passwordHash) {
      issues.push('❌ No password hash - user cannot login');
    }
    if (user.status !== 'active') {
      issues.push(\`❌ Account status is \"\${user.status}\" - must be \"active\"\`);
    }
    
    if (issues.length > 0) {
      console.log('🚨 Issues found:');
      issues.forEach(issue => console.log('  ' + issue));
      process.exit(1);
    } else {
      console.log('✅ User account looks good');
      console.log('💡 If login still fails, the password might be incorrect');
    }
    
    prisma.\$disconnect();
  }).catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
});
"

echo ""
echo "✅ Check complete"

