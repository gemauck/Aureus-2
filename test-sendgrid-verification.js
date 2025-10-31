// Test SendGrid sender verification and email delivery
import dotenv from 'dotenv';
dotenv.config();

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || process.env.SMTP_PASS;
const FROM_EMAIL = process.env.EMAIL_FROM || 'garethm@abcotronics.co.za';

async function testSendGridVerification() {
    console.log('🔍 SendGrid Sender Verification Test\n');
    console.log('='.repeat(60));
    
    // Check if sender is verified
    console.log('\n📧 Checking Sender Verification Status...');
    console.log('   FROM Email:', FROM_EMAIL);
    console.log('   API Key:', SENDGRID_API_KEY ? `${SENDGRID_API_KEY.substring(0, 8)}...` : 'NOT SET');
    
    try {
        // Check verified senders
        const verifyResponse = await fetch('https://api.sendgrid.com/v3/verified_senders', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${SENDGRID_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (verifyResponse.ok) {
            const verified = await verifyResponse.json();
            console.log('\n✅ Verified Senders:');
            if (verified.results && verified.results.length > 0) {
                verified.results.forEach(sender => {
                    console.log(`   - ${sender.from.email} (${sender.verified ? '✅ Verified' : '❌ Not Verified'})`);
                });
                
                const isVerified = verified.results.some(s => 
                    s.from.email === FROM_EMAIL && s.verified
                );
                
                if (isVerified) {
                    console.log(`\n✅ ${FROM_EMAIL} is verified in SendGrid!`);
                } else {
                    console.log(`\n❌ ${FROM_EMAIL} is NOT verified in SendGrid!`);
                    console.log('\n🔧 To verify:');
                    console.log('   1. Go to: https://app.sendgrid.com/settings/sender_auth');
                    console.log('   2. Click "Verify a Single Sender"');
                    console.log('   3. Enter:', FROM_EMAIL);
                    console.log('   4. Complete verification (check your email)');
                }
            } else {
                console.log('   ⚠️  No verified senders found');
                console.log('\n🔧 You need to verify a sender:');
                console.log('   1. Go to: https://app.sendgrid.com/settings/sender_auth');
                console.log('   2. Click "Verify a Single Sender"');
                console.log('   3. Enter:', FROM_EMAIL);
            }
        } else {
            const error = await verifyResponse.text();
            console.log('   ⚠️  Could not check verification status:', error);
        }
    } catch (error) {
        console.log('   ⚠️  Could not check verification:', error.message);
    }
    
    // Test sending
    console.log('\n📨 Testing Email Send...');
    console.log('='.repeat(60));
    
    try {
        const { sendNotificationEmail } = await import('./api/_lib/email.js');
        
        const result = await sendNotificationEmail(
            'gemauck@gmail.com',
            'SendGrid Verification Test - ' + new Date().toISOString(),
            `
                <div style="padding: 20px; font-family: Arial;">
                    <h2>SendGrid Test Email</h2>
                    <p>This is a test email to verify SendGrid configuration.</p>
                    <p><strong>FROM:</strong> ${FROM_EMAIL}</p>
                    <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                    <hr>
                    <p><small>If you receive this, SendGrid is working!</small></p>
                </div>
            `
        );
        
        console.log('\n✅ Email sent to SendGrid successfully!');
        console.log('   Message ID:', result.messageId);
        console.log('\n📊 Next Steps:');
        console.log('   1. Check SendGrid Activity Feed: https://app.sendgrid.com/activity');
        console.log('      Look for the email and check its status');
        console.log('   2. Check your inbox (and spam folder)');
        console.log('   3. If email shows "Delivered" in SendGrid but not received:');
        console.log('      - Check spam/junk folder');
        console.log('      - Check email server logs');
        console.log('      - Verify sender email domain');
        console.log('   4. If email shows "Blocked" or "Bounced":');
        console.log('      - Sender email needs verification');
        console.log('      - Recipient email may be invalid');
        
    } catch (error) {
        console.log('\n❌ Failed to send email:', error.message);
        
        if (error.message.includes('verified')) {
            console.log('\n🔴 ISSUE: Sender email not verified!');
            console.log('\n📝 Solution:');
            console.log('   1. Go to: https://app.sendgrid.com/settings/sender_auth');
            console.log('   2. Click "Verify a Single Sender"');
            console.log('   3. Enter your email:', FROM_EMAIL);
            console.log('   4. Fill in the form and verify via email');
            console.log('   5. Try sending again');
        }
        
        if (error.message.includes('API')) {
            console.log('\n🔴 ISSUE: API key problem');
            console.log('   - Check your API key is correct');
            console.log('   - Ensure it has "Mail Send" permissions');
        }
    }
    
    console.log('\n' + '='.repeat(60));
}

testSendGridVerification().catch(console.error);

