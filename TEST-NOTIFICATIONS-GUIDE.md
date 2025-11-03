# How to Test Notifications

## 🎯 Quick Test Methods

### Method 1: Via UI (Easiest)

1. **Open Settings**
   - Click the Settings icon in the header
   - Go to the "Notifications" tab

2. **Click Test Button**
   - Scroll to the "Test Notifications" section
   - Click "Create Test Notification" button
   - You should see: `✅ Test notification created! Check the notification bell icon in the header.`

3. **Check Notification Bell**
   - Look at the bell icon in the header (top right)
   - You should see a red badge with "1" (or more if you have unread notifications)
   - Click the bell to see the notification dropdown

4. **Verify Notification**
   - Notification should appear in the dropdown
   - Should show as unread (blue background)
   - Click it to mark as read and navigate

### Method 2: Via Browser Console

1. **Open Browser Console** (F12)

2. **Get Your Token**
   ```javascript
   const token = window.storage.getToken();
   console.log('Token:', token);
   ```

3. **Create Test Notification**
   ```javascript
   const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
   const response = await fetch(`${apiBase}/api/notifications/test`, {
       method: 'POST',
       headers: {
           'Content-Type': 'application/json',
           'Authorization': `Bearer ${token}`
       },
       credentials: 'include',
       body: JSON.stringify({
           type: 'system',
           title: 'Console Test',
           message: 'This notification was created from the browser console!'
       })
   });
   
   const data = await response.json();
   console.log('Test notification:', data);
   ```

4. **Check Notifications**
   ```javascript
   const response = await fetch(`${apiBase}/api/notifications`, {
       headers: {
           'Authorization': `Bearer ${token}`
       }
   });
   const data = await response.json();
   console.log('Notifications:', data);
   ```

### Method 3: Via Test Script

1. **Get Your JWT Token**
   - Open browser console (F12)
   - Run: `window.storage.getToken()`
   - Copy the token

2. **Run Test Script**
   ```bash
   node test-notifications.js YOUR_JWT_TOKEN
   ```

3. **Expected Output**
   ```
   🧪 Testing Notification System
   ============================================================
   
   📋 Test 1: Getting notifications...
   ✅ Found 0 notifications (0 unread)
   
   📋 Test 2: Creating test notification...
   ✅ Test notification created: clxxxxx
   
   📋 Test 3: Getting notification settings...
   ✅ Notification settings loaded
   
   📋 Test 4: Creating mention notification...
   ✅ Mention notification created: clxxxxx
   
   📋 Test 5: Verifying notifications...
   ✅ Verification: 2 total notifications, 2 unread
   ```

## 🧪 Test Scenarios

### Test 1: Basic Notification
**Goal**: Verify notifications can be created and displayed

**Steps**:
1. Use UI test button or API to create notification
2. Check bell icon shows unread count
3. Click bell to see notification
4. Click notification to mark as read
5. Verify count decreases

**Expected**: ✅ Notification appears, can be read, count updates

### Test 2: Mention Notification
**Goal**: Verify @mentions create notifications

**Steps**:
1. Go to a Client or Lead detail page
2. Add a comment with @mention (e.g., "@john")
3. Submit comment
4. Check notification bell for mention notification
5. Verify notification shows correct context

**Expected**: ✅ Mention notification created with correct details

### Test 3: Notification Settings
**Goal**: Verify settings save and control notifications

**Steps**:
1. Go to Settings → Notifications
2. Toggle "Email Mentions" off
3. Save settings
4. Create a mention notification
5. Check if email was sent (should not send if disabled)

**Expected**: ✅ Settings save, preferences are respected

### Test 4: Email Notifications
**Goal**: Verify email notifications work (if SendGrid configured)

**Steps**:
1. Ensure email notifications are enabled in settings
2. Ensure SendGrid is configured
3. Create a mention notification
4. Check email inbox for notification
5. Check server logs for email sending confirmation

**Expected**: ✅ Email sent if configured and enabled

### Test 5: Notification Types
**Goal**: Test different notification types

**Test each type**:
- `mention` - @mentions in comments
- `comment` - Comments on items
- `task` - Task assignments (if implemented)
- `invoice` - Invoice due dates (if implemented)
- `system` - System notifications

**Expected**: ✅ Each type creates appropriate notification

## 🔍 Debugging

### Check Notification Center
```javascript
// In browser console
const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
const token = window.storage.getToken();

const response = await fetch(`${apiBase}/api/notifications`, {
    headers: { 'Authorization': `Bearer ${token}` }
});
const data = await response.json();
console.log('Notifications:', data);
```

### Check Notification Settings
```javascript
const response = await fetch(`${apiBase}/api/notifications/settings`, {
    headers: { 'Authorization': `Bearer ${token}` }
});
const data = await response.json();
console.log('Settings:', data);
```

### Check Server Logs
Look for:
- `✅ In-app notification created for user...`
- `✅ Email notification sent to...`
- `📧 Using SendGrid HTTP API...`
- `❌ Failed to send email notification...`

### Common Issues

**Issue**: Notifications not appearing
- Check browser console for errors
- Verify JWT token is valid
- Check server logs for API errors
- Verify NotificationCenter component is loaded

**Issue**: Email not sending
- Check SendGrid API key is configured
- Verify sender email is verified in SendGrid
- Check user email preferences are enabled
- Check server logs for email errors

**Issue**: Mention notifications not working
- Verify MentionHelper is loaded
- Check comment text contains @mention
- Verify user exists in system
- Check server logs for mention processing

## ✅ Success Criteria

All tests pass if:
- [x] Test notification appears in bell icon
- [x] Unread count badge shows correct number
- [x] Notification dropdown displays notifications
- [x] Clicking notification marks as read
- [x] Settings save correctly
- [x] Mentions create notifications
- [x] Email notifications work (if configured)

## 📋 Test Checklist

- [ ] Basic notification creation
- [ ] Notification display in dropdown
- [ ] Mark as read/unread
- [ ] Delete notification
- [ ] Mention notifications
- [ ] Notification settings save/load
- [ ] Email notifications (if configured)
- [ ] Different notification types
- [ ] Notification polling (auto-refresh)
- [ ] Navigation to notification link

