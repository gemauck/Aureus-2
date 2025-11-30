// Simple console test for progress tracker persistence
// Run this in the browser console on the Projects page (while logged in)

window.testProgressPersistence = async function() {
    console.log('🧪 Testing Progress Tracker Persistence...\n');
    
    try {
        // Step 1: Get a project
        console.log('📡 Step 1: Loading projects...');
        const projectsResponse = await window.DatabaseAPI.getProjects();
        const projects = projectsResponse?.data?.projects || projectsResponse?.projects || projectsResponse?.data || [];
        
        if (projects.length === 0) {
            console.error('❌ No projects found');
            return;
        }
        
        const project = projects[0];
        console.log(`✅ Found project: ${project.name} (ID: ${project.id})\n`);
        
        // Step 2: Prepare test data
        const testData = {
            'November-2025': {
                compliance: '',
                data: '',
                comments: `Test persistence - ${new Date().toISOString()}`
            }
        };
        
        console.log('📝 Step 2: Test data to save:');
        console.log(JSON.stringify(testData, null, 2));
        console.log('');
        
        // Step 3: Get current monthlyProgress
        let monthlyProgress = project.monthlyProgress || {};
        if (typeof monthlyProgress === 'string' && monthlyProgress.trim()) {
            try {
                monthlyProgress = JSON.parse(monthlyProgress);
            } catch (e) {
                console.warn('⚠️ Failed to parse existing monthlyProgress, starting fresh');
                monthlyProgress = {};
            }
        }
        
        // Step 4: Merge test data
        const updatedProgress = {
            ...monthlyProgress,
            ...testData
        };
        
        console.log('💾 Step 3: Saving to database...');
        const saveResponse = await window.DatabaseAPI.updateProject(project.id, {
            monthlyProgress: JSON.stringify(updatedProgress)
        });
        
        console.log('✅ Save response received');
        console.log('Response structure:', {
            hasData: !!saveResponse?.data,
            hasProject: !!saveResponse?.data?.project,
            responseKeys: Object.keys(saveResponse || {})
        });
        console.log('');
        
        // Step 5: Wait a moment, then verify
        console.log('⏳ Waiting 1 second before verification...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('🔍 Step 4: Verifying persistence...');
        const verifyResponse = await window.DatabaseAPI.getProject(project.id);
        const savedProject = verifyResponse?.data?.project || verifyResponse?.project || verifyResponse?.data;
        
        let savedProgress = {};
        if (savedProject.monthlyProgress) {
            try {
                savedProgress = typeof savedProject.monthlyProgress === 'string'
                    ? JSON.parse(savedProject.monthlyProgress)
                    : savedProject.monthlyProgress;
            } catch (e) {
                console.error('❌ Failed to parse saved monthlyProgress:', e);
            }
        }
        
        console.log('📋 Saved monthlyProgress:');
        console.log(JSON.stringify(savedProgress, null, 2));
        console.log('');
        
        // Step 6: Verify
        const savedComments = savedProgress['November-2025']?.comments;
        const expectedComments = testData['November-2025'].comments;
        
        if (savedComments === expectedComments) {
            console.log('✅✅✅ PERSISTENCE TEST PASSED! ✅✅✅');
            console.log(`   Expected: "${expectedComments}"`);
            console.log(`   Got: "${savedComments}"`);
            console.log('\n🎉 Data is persisting correctly to the database!');
        } else {
            console.log('❌❌❌ PERSISTENCE TEST FAILED! ❌❌❌');
            console.log(`   Expected: "${expectedComments}"`);
            console.log(`   Got: "${savedComments}"`);
            console.log('\n⚠️ Data is NOT persisting. Check API endpoint and database connection.');
        }
        
    } catch (error) {
        console.error('❌ Test failed with error:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack
        });
    }
};

console.log('✅ Test function loaded!');
console.log('📝 Run: window.testProgressPersistence()');
console.log('   (Make sure you are on the Projects page and logged in)');








