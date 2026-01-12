// Test Resend API directly
const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_SWSZHjMu_8WVxbKPWc8AVZ1tvkRDYAeiL';
const TEST_EMAIL = process.argv[2] || 'garethm@abcotronics.co.za';

console.log('🧪 Testing Resend API...');
console.log('📧 API Key:', RESEND_API_KEY.substring(0, 10) + '...');
console.log('📧 Test Email:', TEST_EMAIL);
console.log('');

const payload = {
    from: 'Abcotronics <garethm@abcotronics.co.za>',
    to: [TEST_EMAIL],
    subject: 'Test Email from Resend API',
    html: '<h1>Test Email</h1><p>This is a test email from Resend API to verify the configuration.</p>',
    text: 'Test Email\n\nThis is a test email from Resend API to verify the configuration.'
};

console.log('📤 Sending test email...');
console.log('Payload:', JSON.stringify(payload, null, 2));

fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
})
.then(async (response) => {
    const responseText = await response.text();
    console.log('');
    console.log('📥 Response Status:', response.status, response.statusText);
    console.log('📥 Response Body:', responseText);
    
    if (!response.ok) {
        try {
            const error = JSON.parse(responseText);
            console.log('');
            console.log('❌ Error Details:');
            console.log(JSON.stringify(error, null, 2));
            
            if (error.message) {
                if (error.message.includes('domain') || error.message.includes('verify')) {
                    console.log('');
                    console.log('⚠️  DOMAIN VERIFICATION REQUIRED!');
                    console.log('   Your domain "abcotronics.co.za" must be verified in Resend.');
                    console.log('   Go to: https://resend.com/domains');
                    console.log('   Add and verify the domain, then try again.');
                }
            }
        } catch (e) {
            console.log('❌ Could not parse error response');
        }
        process.exit(1);
    } else {
        const result = JSON.parse(responseText);
        console.log('');
        console.log('✅ Email sent successfully!');
        console.log('📧 Message ID:', result.id);
        console.log('');
        console.log('Check your inbox (and spam folder) for the test email.');
    }
})
.catch((error) => {
    console.error('❌ Network error:', error.message);
    process.exit(1);
});







