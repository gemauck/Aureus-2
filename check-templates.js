// Quick diagnostic script - paste this in browser console
// This will check if templates exist in the database

(async function checkTemplates() {
    console.log('🔍 Checking templates in database...');
    
    try {
        const token = window.storage?.getToken?.();
        if (!token) {
            console.error('❌ No auth token found');
            return;
        }
        
        console.log('📡 Calling API: /api/document-collection-templates');
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
            console.error('❌ API Error:', response.status, errorText);
            return;
        }
        
        const data = await response.json();
        console.log('📦 Full API response:', data);
        
        const templates = data?.data?.templates || data?.templates || [];
        console.log(`\n✅ Found ${templates.length} templates in database:\n`);
        
        if (templates.length === 0) {
            console.warn('⚠️ NO TEMPLATES FOUND!');
            console.warn('   This means either:');
            console.warn('   1. No templates have been created yet');
            console.warn('   2. Templates were not saved to database');
            console.warn('   3. Database query is failing');
        } else {
            templates.forEach((t, i) => {
                console.log(`  ${i + 1}. "${t.name}"`);
                console.log(`     ID: ${t.id}`);
                console.log(`     Created by: ${t.createdBy || 'Unknown'}`);
                console.log(`     Owner ID: ${t.ownerId || 'None'}`);
                console.log(`     Sections: ${t.sections?.length || 0}`);
                console.log(`     Is Default: ${t.isDefault ? 'Yes' : 'No'}`);
                console.log('');
            });
            
            console.log('✅ Templates are available and should be visible to all users');
        }
        
        return templates;
    } catch (error) {
        console.error('❌ Error checking templates:', error);
        console.error('Stack:', error.stack);
    }
})();

