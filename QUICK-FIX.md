# Quick Fix - Copy & Paste This

## Step 1: Open Browser Console
Press `F12` or `Cmd+Option+I` (Mac) or `Ctrl+Shift+I` (Windows)

## Step 2: Paste This Code

```javascript
(async()=>{const t=window.storage?.getToken?.();if(!t){alert('❌ Please log in');return}const c=[{id:'cmhdajkei000bm8zlnz01j7hb',n:'Chromex Mining'},{id:'cmhdajkcd0001m8zlk72lb2bt',n:'AccuFarm'}];console.log('🚀 Fixing',c.length,'clients...');for(const client of c){try{const r=await fetch(`/api/clients/${client.id}/fix`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${t}`},credentials:'include',body:JSON.stringify({action:'full-fix'})});const d=await r.json();console.log(`✅ ${client.n}:`,d.operations?.map(o=>o.message).join(', ')||'Fixed');await new Promise(r=>setTimeout(r,500))}catch(e){console.error(`❌ ${client.n}:`,e.message)}}alert('✅ Fix complete! Refreshing...');location.reload()})()
```

## Step 3: Press Enter

That's it! The script will:
- Fix both corrupted clients
- Show progress in console
- Refresh the page automatically

---

## Alternative: Fix One Client at a Time

```javascript
// Fix Chromex Mining Company
fetch('/api/clients/cmhdajkei000bm8zlnz01j7hb/fix',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${window.storage?.getToken?.()}`},credentials:'include',body:JSON.stringify({action:'full-fix'})}).then(r=>r.json()).then(d=>{console.log('✅ Fix Results:',d);alert('✅ Fixed! Refreshing...');location.reload()})
```

```javascript
// Fix AccuFarm
fetch('/api/clients/cmhdajkcd0001m8zlk72lb2bt/fix',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${window.storage?.getToken?.()}`},credentials:'include',body:JSON.stringify({action:'full-fix'})}).then(r=>r.json()).then(d=>{console.log('✅ Fix Results:',d);alert('✅ Fixed! Refreshing...');location.reload()})
```

