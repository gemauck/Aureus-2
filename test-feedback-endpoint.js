// Test the feedback endpoint directly to see what happens
import dotenv from 'dotenv';
dotenv.config();

async function testFeedbackEndpoint() {
    console.log('🧪 Testing Feedback Endpoint\n');
    console.log('='.repeat(60));
    
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const feedbackUrl = `${baseUrl}/api/feedback`;
    
    console.log('📡 Endpoint:', feedbackUrl);
    console.log('📧 Testing with admin email: garethm@abcotronics.co.za\n');
    
    // Simulate feedback submission
    const feedbackData = {
        message: 'Test feedback from diagnostic script',
        pageUrl: '/test',
        section: 'Testing',
        type: 'feedback',
        severity: 'medium'
    };
    
    try {
        console.log('📤 Sending feedback...');
        console.log('   Data:', JSON.stringify(feedbackData, null, 2));
        
        // Note: This would need authentication in real scenario
        // But we can see if the endpoint exists and what happens
        const response = await fetch(feedbackUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(feedbackData)
        });
        
        const result = await response.json();
        
        console.log('\n📥 Response Status:', response.status);
        console.log('📥 Response:', JSON.stringify(result, null, 2));
        
        if (response.status === 401 || response.status === 403) {
            console.log('\n⚠️  Authentication required - this is expected');
            console.log('   The endpoint exists but needs authentication');
        } else if (response.ok) {
            console.log('\n✅ Feedback submitted successfully!');
            console.log('   Check server logs for email notification attempts');
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.message.includes('ECONNREFUSED')) {
            console.error('   Server is not running or not accessible');
            console.error('   Make sure your server is running on', baseUrl);
        }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 Next Steps:');
    console.log('1. Check your server console/logs when feedback is submitted');
    console.log('2. Look for these log messages:');
    console.log('   - "📧 Starting feedback email notification process..."');
    console.log('   - "📧 Found X admin(s) to notify..."');
    console.log('   - "✅ Feedback email sent successfully..."');
    console.log('3. Check SendGrid Activity: https://app.sendgrid.com/activity');
    console.log('4. Verify admin user in database has:');
    console.log('   - Email: garethm@abcotronics.co.za');
    console.log('   - Role: admin (or ADMIN)');
    console.log('   - Status: active (or ACTIVE)');
}

testFeedbackEndpoint();

