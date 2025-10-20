/**
 * Google Calendar Service
 * Handles Google Calendar integration for follow-ups and meetings
 */

class GoogleCalendarService {
  constructor() {
    this.isAuthenticated = false
    this.userTokens = null
    this.baseUrl = window.location.origin
  }

  /**
   * Get Google OAuth URL for authentication
   */
  async getAuthUrl() {
    try {
      const response = await fetch(`${this.baseUrl}/api/google-calendar/auth-url`, {
        headers: {
          'Authorization': `Bearer ${window.storage?.getToken?.()}`
        }
      })
      
      const data = await response.json()
      return data.authUrl
    } catch (error) {
      console.error('Failed to get Google auth URL:', error)
      throw error
    }
  }

  /**
   * Handle OAuth callback
   */
  async handleCallback(code) {
    try {
      const response = await fetch(`${this.baseUrl}/api/google-calendar/callback?code=${code}`, {
        headers: {
          'Authorization': `Bearer ${window.storage?.getToken?.()}`
        }
      })
      
      const data = await response.json()
      
      if (data.success) {
        this.isAuthenticated = true
        this.userTokens = data.tokens
        // Store tokens in localStorage
        localStorage.setItem('googleCalendarTokens', JSON.stringify(data.tokens))
      }
      
      return data
    } catch (error) {
      console.error('Failed to handle Google callback:', error)
      throw error
    }
  }

  /**
   * Check if user is authenticated with Google Calendar
   */
  async checkAuthentication() {
    try {
      const storedTokens = localStorage.getItem('googleCalendarTokens')
      if (storedTokens) {
        this.userTokens = JSON.parse(storedTokens)
        this.isAuthenticated = true
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to check authentication:', error)
      return false
    }
  }

  /**
   * Create a calendar event for a follow-up
   */
  async createEvent(followUpData) {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated with Google Calendar')
    }

    try {
      const eventData = {
        summary: followUpData.title || `${followUpData.type} - ${followUpData.clientName}`,
        description: followUpData.description,
        startDateTime: this.formatDateTime(followUpData.date, followUpData.time),
        endDateTime: this.formatDateTime(followUpData.date, this.getEndTime(followUpData.time)),
        attendees: followUpData.attendees || [],
        location: followUpData.location || '',
        clientId: followUpData.clientId,
        followUpId: followUpData.id,
        tokens: this.userTokens
      }

      const response = await fetch(`${this.baseUrl}/api/google-calendar/create-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${window.storage?.getToken?.()}`
        },
        body: JSON.stringify(eventData)
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to create calendar event')
      }

      return data.event
    } catch (error) {
      console.error('Failed to create Google Calendar event:', error)
      throw error
    }
  }

  /**
   * Update a calendar event
   */
  async updateEvent(eventId, updateData) {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated with Google Calendar')
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/google-calendar/update-event`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${window.storage?.getToken?.()}`
        },
        body: JSON.stringify({
          eventId,
          ...updateData,
          tokens: this.userTokens
        })
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to update calendar event')
      }

      return data.event
    } catch (error) {
      console.error('Failed to update Google Calendar event:', error)
      throw error
    }
  }

  /**
   * Delete a calendar event
   */
  async deleteEvent(eventId) {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated with Google Calendar')
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/google-calendar/delete-event?eventId=${eventId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${window.storage?.getToken?.()}`,
          'x-google-tokens': JSON.stringify(this.userTokens)
        }
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to delete calendar event')
      }

      return data
    } catch (error) {
      console.error('Failed to delete Google Calendar event:', error)
      throw error
    }
  }

  /**
   * Get upcoming calendar events
   */
  async getUpcomingEvents() {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated with Google Calendar')
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/google-calendar/events`, {
        headers: {
          'Authorization': `Bearer ${window.storage?.getToken?.()}`,
          'x-google-tokens': JSON.stringify(this.userTokens)
        }
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch calendar events')
      }

      return data.events
    } catch (error) {
      console.error('Failed to fetch Google Calendar events:', error)
      throw error
    }
  }

  /**
   * Format date and time for Google Calendar API
   */
  formatDateTime(date, time) {
    const dateTime = new Date(`${date}T${time || '09:00'}:00`)
    return dateTime.toISOString()
  }

  /**
   * Get end time for events (default 1 hour duration)
   */
  getEndTime(startTime) {
    if (!startTime) return '10:00'
    
    const [hours, minutes] = startTime.split(':').map(Number)
    const endHours = hours + 1
    const formattedEndHours = endHours.toString().padStart(2, '0')
    
    return `${formattedEndHours}:${minutes.toString().padStart(2, '0')}`
  }

  /**
   * Disconnect from Google Calendar
   */
  disconnect() {
    this.isAuthenticated = false
    this.userTokens = null
    localStorage.removeItem('googleCalendarTokens')
  }

  /**
   * Open Google Calendar authentication popup
   */
  async openAuthPopup() {
    return new Promise((resolve, reject) => {
      try {
        const authUrl = this.getAuthUrl()
        
        authUrl.then(url => {
          const popup = window.open(
            url,
            'googleAuth',
            'width=500,height=600,scrollbars=yes,resizable=yes'
          )

          const checkClosed = setInterval(() => {
            if (popup.closed) {
              clearInterval(checkClosed)
              reject(new Error('Authentication cancelled'))
            }
          }, 1000)

          // Listen for message from popup
          const messageListener = (event) => {
            if (event.origin !== window.location.origin) return
            
            if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
              clearInterval(checkClosed)
              window.removeEventListener('message', messageListener)
              popup.close()
              
              this.isAuthenticated = true
              this.userTokens = event.data.tokens
              localStorage.setItem('googleCalendarTokens', JSON.stringify(event.data.tokens))
              
              resolve(event.data)
            } else if (event.data.type === 'GOOGLE_AUTH_ERROR') {
              clearInterval(checkClosed)
              window.removeEventListener('message', messageListener)
              popup.close()
              reject(new Error(event.data.error))
            }
          }

          window.addEventListener('message', messageListener)
        }).catch(reject)
      } catch (error) {
        reject(error)
      }
    })
  }
}

// Create singleton instance
window.GoogleCalendarService = new GoogleCalendarService()

export default window.GoogleCalendarService
