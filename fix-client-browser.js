// Paste this entire script into your browser console while on the application
// It will automatically diagnose and fix the client data issue

(async function fixClientData() {
  const clientId = 'cmhdajkei000bm8zlnz01j7hb'; // Chromex Mining Company
  const token = window.storage?.getToken?.();
  
  if (!token) {
    console.error('❌ Not logged in. Please log in first.');
    return;
  }

  console.log('🚀 Starting client data fix for:', clientId);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    // Step 1: Diagnose
    console.log('\n📋 Step 1: Diagnosing issue...');
    const diagnoseResponse = await fetch(`/api/clients/${clientId}/fix`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      credentials: 'include',
      body: JSON.stringify({ action: 'diagnose' })
    });

    if (!diagnoseResponse.ok) {
      throw new Error(`Diagnosis failed: ${diagnoseResponse.status} ${diagnoseResponse.statusText}`);
    }

    const diagnosis = await diagnoseResponse.json();
    console.log('✅ Diagnosis complete:', diagnosis);

    // Step 2: Run full fix
    console.log('\n🔧 Step 2: Running full fix...');
    const fixResponse = await fetch(`/api/clients/${clientId}/fix`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      credentials: 'include',
      body: JSON.stringify({ action: 'full-fix' })
    });

    if (!fixResponse.ok) {
      const errorText = await fixResponse.text();
      throw new Error(`Fix failed: ${fixResponse.status} ${fixResponse.statusText}\n${errorText}`);
    }

    const fixResults = await fixResponse.json();
    console.log('✅ Fix complete:', fixResults);

    // Step 3: Verify by trying to load the client
    console.log('\n✅ Step 3: Verifying fix...');
    const verifyResponse = await fetch(`/api/clients/${clientId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      credentials: 'include'
    });

    if (verifyResponse.ok) {
      console.log('✅ Verification successful! Client can now be loaded.');
      console.log('\n🎉 Fix completed successfully!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('\n📝 Summary:');
      fixResults.operations?.forEach(op => {
        console.log(`   ${op.success ? '✅' : '❌'} ${op.step}: ${op.message || op.error || 'completed'}`);
      });
      alert('✅ Client data fixed successfully! Please refresh the page.');
    } else {
      console.warn('⚠️ Verification failed. Client may still have issues.');
      console.log('Fix results:', fixResults);
      alert('⚠️ Fix completed but verification failed. Check console for details.');
    }

  } catch (error) {
    console.error('❌ Fix failed:', error);
    console.error('Error details:', error.message);
    alert('❌ Fix failed: ' + error.message);
  }
})();

