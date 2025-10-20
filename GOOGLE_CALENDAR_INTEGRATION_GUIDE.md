# Google Calendar Integration Guide

## Overview

The Google Calendar integration allows users to synchronize follow-ups and meetings from the ERP system with their Google Calendar. This feature is available in both Client and Lead detail modals under the Calendar tab.

## Features

- **OAuth2 Authentication**: Secure connection to Google Calendar
- **Event Creation**: Automatically create Google Calendar events from follow-ups
- **Event Updates**: Update existing calendar events when follow-ups are modified
- **Event Deletion**: Remove events from Google Calendar when follow-ups are deleted
- **Real-time Sync**: Immediate synchronization between ERP system and Google Calendar
- **Visual Status Indicators**: Clear indicators showing sync status

## Setup Instructions

### 1. Google Cloud Console Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Calendar API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Calendar API"
   - Click "Enable"

### 2. OAuth2 Credentials Setup

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Configure the OAuth consent screen if prompted
4. Choose "Web application" as the application type
5. Add authorized redirect URIs:
   - `http://localhost:3000/auth/google/callback` (for local development)
   - `https://yourdomain.com/auth/google/callback` (for production)
6. Copy the Client ID and Client Secret

### 3. Environment Variables

Add the following environment variables to your `.env` file:

```env
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

### 4. Install Dependencies

The Google Calendar integration requires the `googleapis` package:

```bash
npm install googleapis
```

## Usage

### For Users

1. **Access Calendar Tab**: Open any Client or Lead detail modal and navigate to the Calendar tab
2. **Connect Google Calendar**: Click "Connect Google Calendar" button on any follow-up
3. **Authenticate**: Complete the Google OAuth flow in the popup window
4. **Sync Events**: Once connected, you can sync individual follow-ups to Google Calendar

### Sync Actions Available

- **Sync to Google Calendar**: Creates a new event in Google Calendar
- **Update in Google Calendar**: Updates an existing synced event
- **Remove from Google Calendar**: Deletes the event from Google Calendar
- **Open in Google Calendar**: Opens the event directly in Google Calendar

### Visual Indicators

- 🟢 **Green checkmark**: Event is synced with Google Calendar
- 🔄 **Blue spinner**: Currently syncing
- ⚠️ **Red warning**: Sync error occurred
- ⚪ **Gray calendar**: Not synced

## Technical Implementation

### Backend API Endpoints

The integration includes the following API endpoints:

- `GET /api/google-calendar/auth-url` - Get OAuth URL
- `GET /api/google-calendar/callback` - Handle OAuth callback
- `POST /api/google-calendar/create-event` - Create calendar event
- `GET /api/google-calendar/events` - List upcoming events
- `PATCH /api/google-calendar/update-event` - Update calendar event
- `DELETE /api/google-calendar/delete-event` - Delete calendar event

### Frontend Components

- `GoogleCalendarService` - Service class for API interactions
- `GoogleCalendarSync` - React component for sync UI
- OAuth callback page for handling authentication

### Data Structure

Follow-ups now include additional fields for Google Calendar integration:

```javascript
{
  id: "follow-up-id",
  type: "Meeting",
  date: "2024-01-15",
  time: "14:00",
  description: "Follow-up description",
  googleEventId: "google-calendar-event-id", // Added for sync
  googleEventUrl: "https://calendar.google.com/..." // Added for sync
}
```

## Testing

### Test Page

A dedicated test page is available at `/google-calendar-test.html` to verify the integration:

1. Open the test page
2. Click "Connect to Google Calendar"
3. Complete authentication
4. Test creating, updating, and deleting events
5. Verify sync component functionality

### Manual Testing Steps

1. **Authentication Test**:
   - Verify OAuth flow works correctly
   - Check that tokens are stored properly
   - Confirm authentication status is maintained

2. **Event Creation Test**:
   - Create a follow-up in the ERP system
   - Sync it to Google Calendar
   - Verify the event appears in Google Calendar

3. **Event Update Test**:
   - Modify a synced follow-up
   - Update the Google Calendar event
   - Verify changes are reflected in Google Calendar

4. **Event Deletion Test**:
   - Delete a synced follow-up
   - Remove from Google Calendar
   - Verify the event is deleted from Google Calendar

## Troubleshooting

### Common Issues

1. **Authentication Failed**:
   - Check Google Cloud Console configuration
   - Verify redirect URI matches exactly
   - Ensure OAuth consent screen is configured

2. **API Errors**:
   - Check Google Calendar API is enabled
   - Verify API quotas and limits
   - Check network connectivity

3. **Sync Issues**:
   - Clear browser cache and localStorage
   - Re-authenticate with Google Calendar
   - Check console for error messages

### Debug Information

Enable debug logging by checking the browser console for detailed error messages and API responses.

## Security Considerations

- OAuth2 tokens are stored in localStorage (consider server-side storage for production)
- All API calls are authenticated with user tokens
- Google Calendar API access is scoped to calendar and events only
- No sensitive data is transmitted to external services

## Future Enhancements

Potential improvements for the Google Calendar integration:

1. **Bulk Operations**: Sync multiple follow-ups at once
2. **Two-way Sync**: Import events from Google Calendar
3. **Recurring Events**: Support for recurring meetings
4. **Attendee Management**: Add attendees to calendar events
5. **Meeting Rooms**: Reserve meeting rooms through Google Calendar
6. **Reminders**: Customizable reminder settings
7. **Calendar Selection**: Choose which Google Calendar to sync to

## Support

For technical support or questions about the Google Calendar integration:

1. Check the browser console for error messages
2. Review the test page for functionality verification
3. Ensure all setup steps are completed correctly
4. Verify Google Cloud Console configuration

## API Reference

### GoogleCalendarService Methods

- `getAuthUrl()` - Get OAuth URL
- `handleCallback(code)` - Handle OAuth callback
- `checkAuthentication()` - Check if user is authenticated
- `createEvent(followUpData)` - Create calendar event
- `updateEvent(eventId, updateData)` - Update calendar event
- `deleteEvent(eventId)` - Delete calendar event
- `getUpcomingEvents()` - Get upcoming events
- `disconnect()` - Disconnect from Google Calendar

### GoogleCalendarSync Props

- `followUp` - Follow-up data object
- `clientName` - Name of the client/lead
- `clientId` - ID of the client/lead
- `onEventCreated` - Callback for event creation
- `onEventUpdated` - Callback for event updates
- `onEventDeleted` - Callback for event deletion
- `onError` - Callback for error handling
