# Job Cards Offline Support - How It Works

## Overview
The Job Cards feature in the Manufacturing module now supports **full offline functionality**. You can create, edit, and delete job cards even when you're not connected to the internet. All changes are automatically synchronized when you reconnect.

## How Offline Support Works

### 1. **localStorage as Primary Storage**
- When you create, update, or delete a job card, it's **immediately saved to localStorage** (browser storage)
- This means your data persists even if:
  - You close the browser
  - Your internet connection drops
  - The server is unavailable
- Storage key: `manufacturing_jobcards`

### 2. **Automatic API Sync**
- When online: Changes are automatically synced to the database via API
- When offline: Changes are queued in localStorage and synced when connection is restored
- The component monitors online/offline status using browser events

### 3. **Data Loading Strategy**
1. **First Load**: Data is loaded from localStorage instantly (no waiting for network)
2. **Background Sync**: If online, data is refreshed from the API in the background
3. **Fallback**: If API fails, cached data from localStorage is used

### 4. **Visual Indicators**
- **Online Mode**: No indicator (normal operation)
- **Offline Mode**: Orange warning badge "⚠️ Offline" appears in the header
- During save operations: Success message indicates if data was saved offline

## Features

### ✅ Technician Selection
- Technicians are loaded from the users list (`DatabaseAPI.getUsers()`)
- Filtered to show only active users (excludes inactive/suspended)
- Can select main agent and additional technicians
- Falls back to localStorage if users API is unavailable

### ✅ Client Selection
- Clients are loaded from the clients list
- Filtered to show only active clients
- Falls back to localStorage if clients API is unavailable

### ✅ Site Selection
- Sites are dynamically loaded based on selected client
- Sites are parsed from the client's `sites` field (JSON array)
- Only enabled when a client is selected
- Shows "No sites available" if client has no sites

### ✅ Full CRUD Operations
- **Create**: Save to localStorage immediately, sync to API when online
- **Read**: Load from localStorage first, refresh from API if online
- **Update**: Save to localStorage immediately, sync to API when online
- **Delete**: Remove from localStorage immediately, sync to API when online

## Technical Implementation

### Data Flow

```
User Action (Create/Update/Delete)
    ↓
Save to localStorage (instant)
    ↓
Check if online
    ↓
If online: Sync to API via DatabaseAPI
    ↓
If offline: Queue for later sync (handled by next API call)
```

### API Methods (DatabaseAPI)
- `getJobCards()` - Fetch all job cards
- `getJobCard(id)` - Fetch single job card
- `createJobCard(jobCardData)` - Create new job card
- `updateJobCard(id, jobCardData)` - Update existing job card
- `deleteJobCard(id)` - Delete job card

### localStorage Structure
```javascript
{
  "manufacturing_jobcards": [
    {
      "id": "cmhdajkm0001sm8zlvkzm61rd",
      "jobCardNumber": "JC0001",
      "agentName": "John Doe",
      "otherTechnicians": ["Jane Smith"],
      "clientId": "client123",
      "clientName": "ABC Company",
      "siteId": "site456",
      "siteName": "Main Site",
      "location": "Building A, Floor 2",
      "timeOfDeparture": "2025-01-15T08:00:00",
      "timeOfArrival": "2025-01-15T09:30:00",
      "vehicleUsed": "AB12 CD 3456",
      "kmReadingBefore": 1000,
      "kmReadingAfter": 1045,
      "travelKilometers": 45,
      "reasonForVisit": "Equipment maintenance",
      "diagnosis": "Replaced faulty component",
      "otherComments": "Client satisfied",
      "photos": ["data:image/jpeg;base64,..."],
      "status": "completed",
      "createdAt": "2025-01-15T08:00:00Z",
      "updatedAt": "2025-01-15T10:00:00Z"
    }
  ]
}
```

## Testing Offline Mode

### To Test Offline Functionality:

1. **Open Browser DevTools** (F12)
2. **Go to Network tab**
3. **Select "Offline" from the throttling dropdown** (or use Application tab → Service Workers → Offline)
4. **Try creating a job card** - It should save successfully
5. **Refresh the page** - Your job card should still be there (from localStorage)
6. **Go back online** - The job card should sync to the database

## Benefits

1. **No Data Loss**: Your work is never lost, even if the connection drops
2. **Instant UI**: No waiting for API responses - data appears immediately
3. **Seamless Experience**: Users don't need to worry about connection status
4. **Resilient**: Works even if the server is temporarily unavailable

## Notes

- **Storage Limit**: localStorage typically has a 5-10MB limit per domain
- **Manual Sync**: If needed, you can manually refresh by clicking the refresh button (when implemented)
- **Conflict Resolution**: When online, server data takes precedence (server-wins strategy)
- **Browser Compatibility**: Works in all modern browsers that support localStorage

