# Browser Test Script

## Quick Test - Copy & Paste This:

```javascript
(async function test() {
  const t = window.storage?.getToken?.();
  if (!t) { alert('❌ Please log in'); return; }
  const clients = [
    {id:'cmhn2bz09001dqyu935fw3wwb',n:'Client 1'},
    {id:'cmhdajkei000bm8zlnz01j7hb',n:'Chromex Mining'},
    {id:'cmhdajkcd0001m8zlk72lb2bt',n:'AccuFarm'}
  ];
  console.log('🧪 Testing Client Fixes\n');
  const results = [];
  for (const c of clients) {
    console.log(`\n📋 ${c.n} (${c.id}):`);
    try {
      const start = performance.now();
      const r1 = await fetch(`/api/clients/${c.id}`, {headers:{'Authorization':`Bearer ${t}`},credentials:'include'});
      const d1 = r1.ok ? await r1.json() : null;
      const time = Math.round(performance.now() - start);
      console.log(`   ${r1.ok?'✅':'❌'} GET client: ${r1.status} (${time}ms)`);
      if (r1.ok) {
        console.log(`      Name: ${d1.data?.client?.name || 'N/A'}`);
        console.log(`      Groups: ${d1.data?.client?.groupMemberships?.length || 0}`);
        results.push({client:c.n,test:'getClient',success:true});
      } else {
        results.push({client:c.n,test:'getClient',success:false,status:r1.status});
      }
      const r2 = await fetch(`/api/clients/${c.id}/groups`, {headers:{'Authorization':`Bearer ${t}`},credentials:'include'});
      const d2 = r2.ok ? await r2.json() : null;
      console.log(`   ${r2.ok?'✅':'❌'} GET groups: ${r2.status}`);
      if (r2.ok) {
        console.log(`      Groups: ${d2.data?.groupMemberships?.length || 0}`);
        results.push({client:c.n,test:'getGroups',success:true});
      } else {
        results.push({client:c.n,test:'getGroups',success:false,status:r2.status});
      }
    } catch(e) {
      console.error(`   ❌ Error: ${e.message}`);
      results.push({client:c.n,test:'error',success:false,error:e.message});
    }
  }
  const passed = results.filter(r=>r.success).length;
  const total = results.length;
  console.log(`\n📊 Results: ${passed}/${total} tests passed`);
  alert(passed === total ? '✅ All tests passed!' : `⚠️ ${passed}/${total} tests passed`);
})();
```

## Expected Results

✅ **Success**: All endpoints return 200 OK
- GET /api/clients/[id] → 200
- GET /api/clients/[id]/groups → 200

❌ **Failure**: Any endpoint returns 500
- This means the fix didn't work and we need to investigate further

