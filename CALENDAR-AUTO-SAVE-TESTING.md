# Calendar Notes Auto-Save Testing Guide

## ✅ Deployment Complete
The calendar/daily notes auto-save improvements have been deployed to production.

## 🧪 How to Test

### Option 1: Quick Browser Console Test (Recommended)

1. **Open your production site**: https://abcoafrica.co.za
2. **Log in** to your account
3. **Open Browser Console** (F12 or Cmd+Option+I / Ctrl+Shift+I)
4. **Copy and paste** the following test code:

```javascript
(async () => {
    console.log('🧪 Testing Calendar Notes Auto-Save\n');
    const token = window.storage?.getToken?.();
    if (!token) { console.error('❌ Please log in first!'); return; }
    const testDate = new Date().toISOString().split('T')[0];
    const testNote = `Auto-save test ${Date.now()}`;
    console.log('📅 Date:', testDate);
    console.log('📝 Note:', testNote);
    console.log('💾 Saving...');
    const saveRes = await fetch('/api/calendar-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ date: testDate, note: testNote })
    });
    if (!saveRes.ok) { console.error('❌ Save failed:', await saveRes.text()); return; }
    const saveData = await saveRes.json();
    console.log('✅ Save successful!', saveData.data?.saved ? '✓' : '✗');
    await new Promise(r => setTimeout(r, 1000));
    console.log('📥 Fetching...');
    const fetchRes = await fetch(`/api/calendar-notes?t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const fetchData = await fetchRes.json();
    const notes = fetchData?.data?.notes || fetchData?.notes || {};
    const saved = notes[testDate];
    if (saved === testNote) {
        console.log('✅ SUCCESS! Note persisted correctly!');
    } else {
        console.log('❌ FAILED!', saved ? 'Found but different' : 'Not found');
    }
    await fetch(`/api/calendar-notes/${testDate}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Test complete!');
})();
```

### Option 2: Manual UI Testing

1. **Open Dashboard** - Go to your dashboard
2. **Open Calendar Widget** - Find the calendar widget
3. **Click Today's Date** - Click on today's date in the calendar
4. **Daily Notes Editor Opens** - The full-page editor should open
5. **Type Something** - Type some text in the editor
6. **Watch for Auto-Save**:
   - After typing stops, wait 500ms
   - You should see "Auto-saving..." message appear briefly
   - Check browser console for save confirmation logs
7. **Test Blur Save**:
   - Type some text
   - Click away from the editor (click outside or switch tabs)
   - Should save immediately
8. **Verify Persistence**:
   - Close the Daily Notes editor
   - Reopen today's date
   - Your note should still be there!

### Option 3: Full Test Suite

If you want to run the full test suite, copy `test-calendar-auto-save.js` content into browser console (after logging in).

## 📊 Expected Behavior

### Auto-Save Triggers:
- ✅ **500ms after typing stops** - Debounced save
- ✅ **Immediately on blur** - When clicking away from editor
- ✅ **Every 3 seconds** - Backup interval check
- ✅ **On state changes** - Additional backup mechanism

### Console Logs to Watch For:
```
💾 Auto-saving note (detected change)...
✅ Auto-save completed successfully
💾 Auto-saving note (editor blur)...
✅ Note saved successfully to server
```

### Performance:
- Save should complete in < 500ms typically
- Fetch should complete in < 300ms typically

## 🔍 Troubleshooting

If auto-save doesn't work:

1. **Check Console for Errors**:
   - Look for red error messages
   - Check network tab for failed API calls

2. **Verify Authentication**:
   - Make sure you're logged in
   - Check that `window.storage?.getToken?.()` returns a token

3. **Check Initialization**:
   - Wait 500ms after opening editor before typing
   - First load might skip saves during initialization

4. **Check Network**:
   - Ensure API calls to `/api/calendar-notes` are succeeding
   - Check response status codes (should be 200)

## ✅ Success Criteria

- [ ] Note saves automatically 500ms after typing stops
- [ ] Note saves immediately when clicking away from editor
- [ ] Note persists after closing and reopening
- [ ] No manual save button needed
- [ ] Console shows save confirmation messages

## 📝 Notes

- Auto-save only activates after the first 500ms of initialization to prevent saving empty initial state
- Empty notes are saved (if user clears content intentionally)
- Multiple save mechanisms ensure reliability even if one fails
- localStorage is used as backup if server save fails

