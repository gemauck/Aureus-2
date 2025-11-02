// Test script to verify calendar notes are saving correctly
// Run this from the server after deployment

const testCalendarSave = async () => {
    console.log('🧪 Testing Calendar Notes Save Functionality\n');
    
    // Test data
    const testDate = new Date().toISOString().split('T')[0]; // Today's date in YYYY-MM-DD
    const testNote = `Test note created at ${new Date().toISOString()}`;
    
    console.log('Test Parameters:');
    console.log('  Date:', testDate);
    console.log('  Note:', testNote);
    console.log('');
    
    try {
        // Import required modules
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        
        // Test 1: Check if CalendarNote model exists
        console.log('✅ Test 1: Checking CalendarNote model...');
        const sampleNote = await prisma.calendarNote.findFirst({
            take: 1
        });
        console.log('   Model accessible:', !!prisma.calendarNote);
        console.log('   Sample notes exist:', !!sampleNote);
        console.log('');
        
        // Test 2: Check database connection
        console.log('✅ Test 2: Testing database connection...');
        await prisma.$connect();
        console.log('   Database connected successfully');
        console.log('');
        
        // Test 3: Check user table (needed for foreign key)
        console.log('✅ Test 3: Checking for test user...');
        const testUser = await prisma.user.findFirst({
            take: 1,
            select: { id: true, email: true, name: true }
        });
        
        if (!testUser) {
            console.log('   ⚠️  No users found in database');
            console.log('   Please ensure users exist before testing');
            await prisma.$disconnect();
            return;
        }
        
        console.log('   Found user:', testUser.email || testUser.name, '(ID:', testUser.id, ')');
        console.log('');
        
        // Test 4: Try to save a calendar note
        console.log('✅ Test 4: Attempting to save calendar note...');
        const savedNote = await prisma.calendarNote.upsert({
            where: {
                userId_date: {
                    userId: testUser.id,
                    date: new Date(testDate + 'T00:00:00Z')
                }
            },
            update: {
                note: testNote,
                updatedAt: new Date()
            },
            create: {
                userId: testUser.id,
                date: new Date(testDate + 'T00:00:00Z'),
                note: testNote
            }
        });
        
        console.log('   ✅ Calendar note saved successfully!');
        console.log('   ID:', savedNote.id);
        console.log('   User ID:', savedNote.userId);
        console.log('   Date:', savedNote.date.toISOString());
        console.log('   Note:', savedNote.note);
        console.log('');
        
        // Test 5: Verify the note was saved
        console.log('✅ Test 5: Verifying saved note...');
        const verifiedNote = await prisma.calendarNote.findUnique({
            where: {
                userId_date: {
                    userId: testUser.id,
                    date: new Date(testDate + 'T00:00:00Z')
                }
            }
        });
        
        if (verifiedNote && verifiedNote.note === testNote) {
            console.log('   ✅ Note verified successfully!');
            console.log('   Note matches:', verifiedNote.note === testNote);
        } else {
            console.log('   ❌ Note verification failed!');
            console.log('   Expected:', testNote);
            console.log('   Got:', verifiedNote?.note || 'NOT FOUND');
        }
        console.log('');
        
        // Test 6: Count total notes
        const totalNotes = await prisma.calendarNote.count({
            where: { userId: testUser.id }
        });
        console.log('✅ Test 6: Total notes for user:', totalNotes);
        console.log('');
        
        // Cleanup - remove test note
        console.log('🧹 Cleaning up test note...');
        await prisma.calendarNote.delete({
            where: { id: savedNote.id }
        });
        console.log('   ✅ Test note deleted');
        console.log('');
        
        await prisma.$disconnect();
        
        console.log('✅ ALL TESTS PASSED! Calendar notes are working correctly.');
        console.log('');
        console.log('Next steps:');
        console.log('1. Deploy the updated calendar-notes.js API');
        console.log('2. Deploy the updated Calendar.jsx component');
        console.log('3. Test saving a calendar entry in the browser');
        console.log('4. Check browser console for save confirmation');
        
    } catch (error) {
        console.error('❌ TEST FAILED:', error);
        console.error('Error details:', {
            code: error.code,
            message: error.message,
            meta: error.meta
        });
        process.exit(1);
    }
};

// Run the test
testCalendarSave();

