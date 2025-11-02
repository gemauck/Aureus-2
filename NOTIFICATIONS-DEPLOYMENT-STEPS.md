# Notification System - Deployment Steps

## Quick Deployment Guide

### Step 1: Apply Database Migration

**Production (PostgreSQL):**
```bash
# SSH into your server
ssh root@your-server-ip

# Navigate to app directory
cd /var/www/abcotronics-erp

# Apply schema changes
npx prisma db push
npx prisma generate

# Restart application
pm2 restart abcotronics-erp
```

**Local Development:**
```bash
# If using PostgreSQL locally
npx prisma db push
npx prisma generate

# If using SQLite
npx prisma migrate dev --name add_notifications
npx prisma generate
```

### Step 2: Verify Components Are Loaded

The notification system components are already added to `index.html` and should load automatically:
- `src/utils/mentionHelper.js`
- `src/components/common/CommentInputWithMentions.jsx`
- `src/components/common/NotificationCenter.jsx`
- `src/components/settings/NotificationSettings.jsx`

### Step 3: Test the System

1. **Test @Mentions:**
   - Navigate to any project or task with comments
   - Type `@` followed by a username
   - Verify autocomplete suggestions appear
   - Submit comment
   - Check notification appears for mentioned user

2. **Test Notification Center:**
   - Click bell icon in header
   - Verify unread count badge displays
   - Click notification to navigate
   - Mark as read / delete notifications

3. **Test Email Notifications:**
   - Check mentioned user's email inbox
   - Verify notification email received
   - Verify email includes proper context

4. **Test Settings:**
   - Navigate to Settings → Notifications
   - Toggle email/in-app preferences
   - Save and verify persistence

### Step 4: Rollback Plan (If Needed)

If issues arise, you can temporarily disable:

**Option 1: Remove from Header**
```jsx
// In src/components/layout/MainLayout.jsx
// Comment out or remove:
{window.NotificationCenter ? <window.NotificationCenter /> : null}
```

**Option 2: Keep Backend, Disable Frontend**
The API will continue to create notifications, but users won't see them in the UI.

---

## What Was Added

### Database Changes
- **New tables:** `Notification`, `NotificationSetting`
- **Updated:** `User` model (added relations)

### Backend API
- `POST /api/notifications` - Create notification
- `GET /api/notifications` - Fetch user notifications
- `PATCH /api/notifications` - Mark as read/unread
- `DELETE /api/notifications` - Delete notifications
- `GET /api/notifications/settings` - Get user settings
- `PUT /api/notifications/settings` - Update settings

### Frontend Components
- **CommentInputWithMentions** - Autocomplete @mention support
- **NotificationCenter** - Bell icon with dropdown
- **NotificationSettings** - User preference controls
- **Updated:** CommentsPopup, MonthlyDocumentCollectionTracker, MainLayout, Settings

### Utilities
- **MentionHelper** - Parse and process @mentions

---

## Environment Requirements

### Email Configuration (Already Set Up)
The system uses the existing email service in `api/_lib/email.js`. Verify these environment variables are set:

```env
SMTP_HOST=smtp.gmail.com (or your SMTP server)
SMTP_PORT=587
SMTP_USER=your-email@domain.com
SMTP_PASS=your-app-password
EMAIL_FROM=your-email@domain.com
```

### Database
- PostgreSQL (production) or SQLite (development)
- Prisma configured
- Database URL set in environment variables

---

## Expected Behavior

### On First Load
- Bell icon appears in header (no badge if no unread)
- Clicking bell shows "No notifications yet"
- Settings tab shows default preferences (mentions enabled)

### When User is @Mentioned
1. Notification appears in bell dropdown
2. Email sent (if email mentions enabled in settings)
3. Badge count increases
4. Clicking notification navigates to context

### Polling
- Notifications refresh every 30 seconds
- No user action required
- Works offline (queues until online)

---

## Troubleshooting

### Issue: Bell icon not appearing
**Solution:** Check browser console for errors. Verify components loaded:
```javascript
// In browser console:
console.log(window.NotificationCenter); // Should be a function
console.log(window.MentionHelper); // Should be an object
```

### Issue: Notifications not saving
**Solution:** Check database migration was applied:
```bash
npx prisma db push
npx prisma generate
pm2 restart abcotronics-erp
```

### Issue: Email notifications not sending
**Solution:** Verify email service configuration:
1. Check `.env` file has correct SMTP settings
2. Test with `/api/test-email` endpoint
3. Check server logs for email errors

### Issue: @Mentions not working
**Solution:** Verify `MentionHelper` is loaded and users list is accessible:
```javascript
// In browser console:
window.MentionHelper.parseMentions("@john hello"); // Should return array
```

---

## Support

For issues or questions:
1. Check browser console for errors
2. Check server logs for API errors
3. Verify database schema matches Prisma schema
4. Check environment variables are set correctly
5. Review MENTION-NOTIFICATIONS-COMPLETE.md for full documentation

---

## Success Criteria

✅ Bell icon visible in header
✅ @Mentions autocomplete working
✅ Notifications appear in dropdown
✅ Email notifications sent
✅ Settings save and persist
✅ No console errors
✅ No database errors
✅ Mobile responsive

**System is production-ready when all criteria are met!**

