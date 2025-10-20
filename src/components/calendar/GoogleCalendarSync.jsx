/**
 * Google Calendar Sync Component
 * Provides Google Calendar integration for follow-ups and meetings
 */

const { useState, useEffect } = React;

const GoogleCalendarSync = ({ 
  followUp, 
  clientName, 
  clientId, 
  onEventCreated, 
  onEventUpdated, 
  onEventDeleted,
  onError 
}) => {
  const [isLoading, setIsLoading] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [googleEventId, setGoogleEventId] = useState(null)
  const [syncStatus, setSyncStatus] = useState('not_synced') // not_synced, syncing, synced, error

  // Initialize Google Calendar service
  useEffect(() => {
    initializeGoogleCalendar()
  }, [])

  const initializeGoogleCalendar = async () => {
    try {
      if (window.GoogleCalendarService) {
        const authenticated = await window.GoogleCalendarService.checkAuthentication()
        setIsAuthenticated(authenticated)
        
        // Check if this follow-up is already synced
        if (followUp?.googleEventId) {
          setGoogleEventId(followUp.googleEventId)
          setSyncStatus('synced')
        }
      }
    } catch (error) {
      console.error('Failed to initialize Google Calendar:', error)
    }
  }

  const handleAuthenticate = async () => {
    setIsLoading(true)
    try {
      await window.GoogleCalendarService.openAuthPopup()
      setIsAuthenticated(true)
    } catch (error) {
      console.error('Authentication failed:', error)
      if (onError) onError('Failed to authenticate with Google Calendar')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSyncToGoogle = async () => {
    if (!isAuthenticated) {
      await handleAuthenticate()
      return
    }

    setIsLoading(true)
    setSyncStatus('syncing')

    try {
      const eventData = {
        id: followUp.id,
        title: `${followUp.type} - ${clientName}`,
        description: followUp.description,
        date: followUp.date,
        time: followUp.time || '09:00',
        clientName,
        clientId,
        type: followUp.type
      }

      const googleEvent = await window.GoogleCalendarService.createEvent(eventData)
      setGoogleEventId(googleEvent.id)
      setSyncStatus('synced')
      
      if (onEventCreated) {
        onEventCreated({
          ...followUp,
          googleEventId: googleEvent.id,
          googleEventUrl: googleEvent.htmlLink
        })
      }
    } catch (error) {
      console.error('Failed to sync to Google Calendar:', error)
      setSyncStatus('error')
      if (onError) onError('Failed to sync to Google Calendar')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateGoogleEvent = async () => {
    if (!googleEventId || !isAuthenticated) return

    setIsLoading(true)
    try {
      const eventData = {
        summary: `${followUp.type} - ${clientName}`,
        description: followUp.description,
        start: {
          dateTime: window.GoogleCalendarService.formatDateTime(followUp.date, followUp.time || '09:00'),
          timeZone: 'Africa/Johannesburg'
        },
        end: {
          dateTime: window.GoogleCalendarService.formatDateTime(
            followUp.date, 
            window.GoogleCalendarService.getEndTime(followUp.time || '09:00')
          ),
          timeZone: 'Africa/Johannesburg'
        }
      }

      await window.GoogleCalendarService.updateEvent(googleEventId, eventData)
      
      if (onEventUpdated) {
        onEventUpdated({
          ...followUp,
          googleEventId,
          googleEventUrl: followUp.googleEventUrl
        })
      }
    } catch (error) {
      console.error('Failed to update Google Calendar event:', error)
      if (onError) onError('Failed to update Google Calendar event')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteGoogleEvent = async () => {
    if (!googleEventId || !isAuthenticated) return

    setIsLoading(true)
    try {
      await window.GoogleCalendarService.deleteEvent(googleEventId)
      setGoogleEventId(null)
      setSyncStatus('not_synced')
      
      if (onEventDeleted) {
        onEventDeleted({
          ...followUp,
          googleEventId: null,
          googleEventUrl: null
        })
      }
    } catch (error) {
      console.error('Failed to delete Google Calendar event:', error)
      if (onError) onError('Failed to delete Google Calendar event')
    } finally {
      setIsLoading(false)
    }
  }

  const getSyncButtonText = () => {
    if (isLoading) return 'Syncing...'
    if (!isAuthenticated) return 'Connect Google Calendar'
    if (syncStatus === 'synced') return 'Update in Google Calendar'
    return 'Sync to Google Calendar'
  }

  const getSyncButtonIcon = () => {
    if (isLoading) return 'fas fa-spinner fa-spin'
    if (!isAuthenticated) return 'fab fa-google'
    if (syncStatus === 'synced') return 'fas fa-sync-alt'
    return 'fas fa-calendar-plus'
  }

  const getSyncStatusIcon = () => {
    switch (syncStatus) {
      case 'synced':
        return <i className="fas fa-check-circle text-green-500" title="Synced with Google Calendar"></i>
      case 'syncing':
        return <i className="fas fa-spinner fa-spin text-blue-500" title="Syncing..."></i>
      case 'error':
        return <i className="fas fa-exclamation-triangle text-red-500" title="Sync error"></i>
      default:
        return <i className="fas fa-calendar-times text-gray-400" title="Not synced"></i>
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Sync Status Icon */}
      <div className="flex items-center">
        {getSyncStatusIcon()}
      </div>

      {/* Sync Button */}
      <button
        onClick={syncStatus === 'synced' ? handleUpdateGoogleEvent : handleSyncToGoogle}
        disabled={isLoading}
        className={`px-2 py-1 text-xs rounded-lg transition-colors ${
          isAuthenticated 
            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' 
            : 'bg-green-100 text-green-700 hover:bg-green-200'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title={syncStatus === 'synced' ? 'Update event in Google Calendar' : 'Sync to Google Calendar'}
      >
        <i className={`${getSyncButtonIcon()} mr-1`}></i>
        {getSyncButtonText()}
      </button>

      {/* Delete Google Event Button */}
      {syncStatus === 'synced' && googleEventId && (
        <button
          onClick={handleDeleteGoogleEvent}
          disabled={isLoading}
          className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Remove from Google Calendar"
        >
          <i className="fas fa-trash"></i>
        </button>
      )}

      {/* Google Calendar Link */}
      {syncStatus === 'synced' && followUp?.googleEventUrl && (
        <a
          href={followUp.googleEventUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          title="Open in Google Calendar"
        >
          <i className="fas fa-external-link-alt"></i>
        </a>
      )}
    </div>
  )
}

// Make component available globally
window.GoogleCalendarSync = GoogleCalendarSync

export default GoogleCalendarSync
