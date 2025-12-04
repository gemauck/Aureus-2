// Simple one-liner to fix a specific client
// Usage: fixClient('cmhdajkcd0001m8zlk72lb2bt')

window.fixClient = async function(clientId) {
  const token = window.storage?.getToken?.();
  if (!token) { alert('❌ Please log in first'); return; }
  
  console.log(`🚀 Fixing client: ${clientId}`);
  
  try {
    const response = await fetch(`/api/clients/${clientId}/fix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      credentials: 'include',
      body: JSON.stringify({ action: 'full-fix' })
    });
    
    const result = await response.json();
    console.log('✅ Fix Results:', result);
    
    const verify = await fetch(`/api/clients/${clientId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      credentials: 'include'
    });
    
    if (verify.ok) {
      console.log('✅ Client fixed!');
      alert('✅ Client fixed! Refresh the page.');
      return true;
    } else {
      console.warn('⚠️ Verification failed');
      alert('⚠️ Fix completed but verification failed.');
      return false;
    }
  } catch (error) {
    console.error('❌ Fix failed:', error);
    alert('❌ Fix failed: ' + error.message);
    return false;
  }
};

console.log('✅ fixClient() function loaded!');
console.log('Usage: fixClient("client-id-here")');
console.log('Example: fixClient("cmhdajkcd0001m8zlk72lb2bt")');

