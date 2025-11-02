# Public Job Card Form Link

## Overview
A public, standalone job card form that can be accessed without login. Perfect for technicians in the field who need to submit job cards offline or without accessing the main ERP system.

## Access URL
**Public Link:** `https://abcoafrica.co.za/job-card` or `https://abcoafrica.co.za/jobcard`

Both URLs work - use whichever is easier to remember or share.

## Features
- ✅ **No Login Required** - Accessible directly via link
- ✅ **Offline Support** - Works completely offline, syncs when connection restored
- ✅ **Form Only Access** - Restricts access to just the job card form (no navigation, no other modules)
- ✅ **Full Functionality** - All job card features available:
  - Client selection (required)
  - Site selection (optional)
  - Location details
  - Time tracking
  - Vehicle and kilometer readings
  - Reason for visit, diagnosis, actions taken
  - Stock usage tracking (creates stock movements automatically)
  - Materials bought tracking
  - Photo uploads
  - Comments

## Usage Instructions

### For Technicians
1. Open the link on your mobile device or tablet: `https://abcoafrica.co.za/job-card`
2. Fill in the required fields (only Client is required)
3. Add stock items if used - stock movements will be automatically recorded
4. Submit the form
5. Data is saved locally and will sync to the main system when online

### For Administrators
1. Share the link with technicians via:
   - SMS
   - WhatsApp
   - Email
   - Printed QR code
   - Bookmarked on mobile devices
2. Technicians can bookmark the link for quick access
3. Works on any device with a web browser (mobile, tablet, laptop)

## Offline Mode
- Form works completely offline
- Data is saved to browser's local storage
- When connection is restored, data automatically syncs
- Multiple job cards can be submitted offline and will sync when back online

## Security
- **No Authentication Required** - Public access for convenience
- **Form Only** - Users cannot access other parts of the system
- **Read-Only Data** - Technicians can only submit forms, not view/edit existing data
- **Local Storage** - Data stored locally until sync (browser-specific)

## Technical Details

### Route Configuration
- Path: `/job-card` or `/jobcard`
- Component: `JobCardFormPublic`
- No authentication middleware
- Minimal dependencies (ThemeProvider only)

### Data Persistence
1. **Primary Storage:** localStorage (`manufacturing_jobcards`)
2. **Sync Mechanism:** Attempts API sync when online (non-blocking)
3. **Stock Movements:** Also saved to localStorage and synced separately

### Integration
- Job cards saved via this form appear in the main Manufacturing module
- Stock movements created automatically when stock is used
- Data visible to authenticated users in the main system

## Sharing the Link

### Methods
1. **QR Code** - Generate a QR code with the URL for easy mobile scanning
2. **Short URL** - Consider using a URL shortener for easier sharing
3. **SMS/WhatsApp** - Send the link directly to technicians
4. **Bookmark** - Have technicians bookmark the link on their devices

### Example Messages
```
"Use this link to submit job cards: https://abcoafrica.co.za/job-card
Works offline - submit anytime!"
```

```
"📋 Job Card Form: https://abcoafrica.co.za/job-card
No login needed. Works offline!"
```

## Troubleshooting

### Form Not Loading
- Check internet connection (needed for initial load only)
- Clear browser cache and reload
- Try the alternative URL: `/jobcard`

### Data Not Syncing
- Ensure device is online when submitting
- Check browser console for errors
- Data is saved locally, so it's safe and will sync eventually
- Admin can view pending syncs in localStorage if needed

### Stock Movements Not Recording
- Stock movements are created automatically when stock items are added
- Check browser console for any errors
- Movements are saved to localStorage and will sync when online

## Future Enhancements
Potential improvements for future versions:
- [ ] QR code generation for easy link sharing
- [ ] PWA support for offline app installation
- [ ] Push notifications for sync status
- [ ] Bulk upload for multiple job cards
- [ ] Location/GPS auto-fill
- [ ] Camera integration for photo capture

