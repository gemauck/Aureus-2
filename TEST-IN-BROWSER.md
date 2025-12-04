# Test Client Fixes in Browser

## Quick Test - Copy & Paste This:

```javascript
(async function testClientFixes() {
  const token = window.storage?.getToken?.();
  if (!token) { console.error('❌ Not logged in'); return; }
  const clients = [{id:'cmhdajkei000bm8zlnz01j7hb',n:'Chromex'},{id:'cmhdajkcd0001m8zlk72lb2bt',n:'AccuFarm'}];
  console.log('🧪 Testing Client Fixes\n');
  for (const c of clients) {
    console.log(`\n📋 ${c.n}:`);
    try {
      const r1 = await fetch(`/api/clients/${c.id}`, {headers:{'Authorization':`Bearer ${token}`},credentials:'include'});
      console.log(`   ${r1.ok?'✅':'❌'} GET client: ${r1.status} ${r1.ok?'OK':'FAILED'}`);
      const r2 = await fetch(`/api/clients/${c.id}/groups`, {headers:{'Authorization':`Bearer ${token}`},credentials:'include'});
      console.log(`   ${r2.ok?'✅':'❌'} GET groups: ${r2.status} ${r2.ok?'OK':'FAILED'}`);
    } catch(e) { console.error(`   ❌ Error: ${e.message}`); }
  }
  console.log('\n✅ Test complete!');
})();
```

## Full Test Script

Open browser console and paste the contents of `test-fix-browser.js` for a comprehensive test.

## Expected Results

✅ **Success**: All endpoints return 200 OK
- GET /api/clients/[id] → 200
- GET /api/clients/[id]/groups → 200  
- POST /api/sites/client/[id] → 201

❌ **Failure**: Any endpoint returns 500
- This means the fix didn't work and we need to investigate further

## What the Fix Does

1. **Queries group memberships separately** (avoids join failures)
2. **Filters orphaned memberships** (returns only valid ones)
3. **Auto-cleans orphaned memberships** in background
4. **Handles JSON parsing errors** gracefully

