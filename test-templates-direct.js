// Direct test script to check templates in database
// Run this in browser console to test template API

async function testTemplates() {
    console.log('🧪 Testing template API...');
    
    try {
        const token = window.storage?.getToken?.();
        if (!token) {
            console.error('❌ No auth token found');
            return;
        }
        
        console.log('📡 Fetching templates from API...');
        const cacheBuster = `?t=${Date.now()}`;
        const response = await fetch(`/api/document-collection-templates${cacheBuster}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            },
            cache: 'no-store'
        });
        
        console.log('📥 Response status:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API Error:', errorText);
            return;
        }
        
        const data = await response.json();
        console.log('📦 Response data:', data);
        
        const templates = data?.data?.templates || data?.templates || [];
        console.log(`✅ Found ${templates.length} templates:`);
        
        templates.forEach((t, i) => {
            console.log(`  ${i + 1}. ${t.name} (ID: ${t.id})`);
            console.log(`     - Created by: ${t.createdBy}`);
            console.log(`     - Owner ID: ${t.ownerId || 'none'}`);
            console.log(`     - Sections: ${t.sections?.length || 0}`);
            console.log(`     - Is Default: ${t.isDefault}`);
        });
        
        if (templates.length === 0) {
            console.warn('⚠️ No templates found in database');
        }
        
        return templates;
    } catch (error) {
        console.error('❌ Error testing templates:', error);
    }
}

// Auto-run if in browser
if (typeof window !== 'undefined') {
    console.log('💡 Run testTemplates() in console to test template API');
    window.testTemplates = testTemplates;
}

