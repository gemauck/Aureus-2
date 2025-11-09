// Test script to verify user permissions persistence
// This tests the fix for permissions not persisting

import 'dotenv/config';

async function testPermissionsPersistence() {
    console.log('🧪 Testing User Permissions Persistence\n');
    console.log('='.repeat(60));
    
    // First, we need to get an auth token
    // Try to login first
    const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            email: 'admin@example.com',
            password: 'password123'
        })
    });
    
    if (!loginResponse.ok) {
        console.log('❌ Cannot login. Trying with admin123...');
        const loginResponse2 = await fetch('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: 'admin@example.com',
                password: 'admin123'
            })
        });
        
        if (!loginResponse2.ok) {
            const errorText = await loginResponse2.text();
            console.error('❌ Login failed:', errorText);
            console.log('\n💡 Please ensure:');
            console.log('   1. Server is running on port 3000');
            console.log('   2. Database is connected');
            console.log('   3. A user exists with email admin@example.com');
            return;
        }
        
        var loginData = await loginResponse2.json();
    } else {
        var loginData = await loginResponse.json();
    }
    
    // Extract token from response (handle nested structure)
    const token = loginData?.data?.accessToken || loginData?.accessToken;
    const currentUser = loginData?.data?.user || loginData?.user;
    
    if (!token) {
        console.error('❌ No access token received');
        console.log('Response:', JSON.stringify(loginData, null, 2));
        return;
    }
    
    console.log('✅ Login successful');
    console.log('   User:', currentUser?.email);
    console.log('   Role:', currentUser?.role);
    console.log('');
    
    // Get all users
    console.log('📋 Fetching users list...');
    const usersResponse = await fetch('http://localhost:3000/api/users', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    
    if (!usersResponse.ok) {
        const errorText = await usersResponse.text();
        console.error('❌ Failed to fetch users:', errorText);
        return;
    }
    
    const usersData = await usersResponse.json();
    const users = usersData?.data?.users || usersData?.users || [];
    
    if (users.length === 0) {
        console.log('⚠️  No users found in database');
        return;
    }
    
    console.log(`✅ Found ${users.length} user(s)`);
    
    // Find a non-admin user to test with, or use the first user
    const testUser = users.find(u => u.role?.toLowerCase() !== 'admin') || users[0];
    
    console.log('\n🎯 Testing permissions update for user:');
    console.log('   ID:', testUser.id);
    console.log('   Email:', testUser.email);
    console.log('   Current Role:', testUser.role);
    console.log('   Current Permissions:', testUser.permissions || '[]');
    console.log('');
    
    // Parse current permissions
    let currentPermissions = [];
    if (testUser.permissions) {
        try {
            if (typeof testUser.permissions === 'string') {
                currentPermissions = JSON.parse(testUser.permissions);
            } else if (Array.isArray(testUser.permissions)) {
                currentPermissions = testUser.permissions;
            }
        } catch (e) {
            console.warn('⚠️  Could not parse current permissions:', e.message);
        }
    }
    
    console.log('   Parsed Permissions:', currentPermissions);
    console.log('');
    
    // Test permissions to set (add a test permission if not present)
    const testPermissions = currentPermissions.includes('access_crm') 
        ? currentPermissions.filter(p => p !== 'access_crm')  // Remove if present
        : [...currentPermissions, 'access_crm'];  // Add if not present
    
    console.log('📝 Updating permissions to:', testPermissions);
    console.log('   (Sending as array, not stringified)');
    console.log('');
    
    // Update permissions - THIS IS THE KEY TEST
    // We're sending permissions as an array (the fix)
    const updateResponse = await fetch('http://localhost:3000/api/users', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            userId: testUser.id,
            permissions: testPermissions  // Array, not JSON.stringify()!
        })
    });
    
    if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error('❌ Failed to update permissions:', errorText);
        return;
    }
    
    const updateData = await updateResponse.json();
    const updatedUser = updateData?.data?.user || updateData?.user;
    
    console.log('✅ Update request successful');
    console.log('   Response permissions:', updatedUser?.permissions);
    console.log('   Type:', typeof updatedUser?.permissions);
    console.log('');
    
    // Parse response permissions
    let responsePermissions = [];
    if (updatedUser?.permissions) {
        try {
            if (typeof updatedUser.permissions === 'string') {
                responsePermissions = JSON.parse(updatedUser.permissions);
            } else if (Array.isArray(updatedUser.permissions)) {
                responsePermissions = updatedUser.permissions;
            }
        } catch (e) {
            console.warn('⚠️  Could not parse response permissions:', e.message);
        }
    }
    
    console.log('   Parsed Response Permissions:', responsePermissions);
    console.log('');
    
    // Verify persistence - fetch user again
    console.log('🔄 Verifying persistence - fetching user again...');
    const verifyResponse = await fetch('http://localhost:3000/api/users', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    
    const verifyData = await verifyResponse.json();
    const verifyUsers = verifyData?.data?.users || verifyData?.users || [];
    const verifyUser = verifyUsers.find(u => u.id === testUser.id);
    
    if (!verifyUser) {
        console.error('❌ User not found in verification fetch');
        return;
    }
    
    console.log('✅ User fetched again');
    console.log('   Permissions in database:', verifyUser.permissions);
    console.log('   Type:', typeof verifyUser.permissions);
    console.log('');
    
    // Parse verification permissions
    let verifyPermissions = [];
    if (verifyUser.permissions) {
        try {
            if (typeof verifyUser.permissions === 'string') {
                verifyPermissions = JSON.parse(verifyUser.permissions);
            } else if (Array.isArray(verifyUser.permissions)) {
                verifyPermissions = verifyUser.permissions;
            }
        } catch (e) {
            console.warn('⚠️  Could not parse verification permissions:', e.message);
        }
    }
    
    console.log('   Parsed Verification Permissions:', verifyPermissions);
    console.log('');
    
    // Compare
    const permissionsMatch = JSON.stringify(responsePermissions.sort()) === JSON.stringify(verifyPermissions.sort());
    const expectedMatch = JSON.stringify(testPermissions.sort()) === JSON.stringify(verifyPermissions.sort());
    
    console.log('📊 Test Results:');
    console.log('='.repeat(60));
    console.log('   Expected Permissions:', testPermissions);
    console.log('   Response Permissions:', responsePermissions);
    console.log('   Verification Permissions:', verifyPermissions);
    console.log('');
    console.log('   Response matches verification:', permissionsMatch ? '✅ YES' : '❌ NO');
    console.log('   Verification matches expected:', expectedMatch ? '✅ YES' : '❌ NO');
    console.log('');
    
    if (permissionsMatch && expectedMatch) {
        console.log('🎉 SUCCESS: Permissions are persisting correctly!');
        console.log('   The fix is working - permissions are saved and retrieved properly.');
    } else {
        console.log('❌ FAILURE: Permissions are not persisting correctly.');
        console.log('   There may still be an issue with the permissions update.');
    }
    
    console.log('');
}

// Run the test
testPermissionsPersistence().catch(error => {
    console.error('❌ Test failed with error:', error);
    console.error(error.stack);
    process.exit(1);
});


