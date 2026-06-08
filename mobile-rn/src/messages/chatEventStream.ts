import { apiUrl } from '../config'
import type { ChatEventListener, ChatEventPayload, ChatEventType } from './chatEventTypes'

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30_000

type StreamOptions = {
  accessToken: string
  onEvent: ChatEventListener
  onConnectionChange?: (connected: boolean) => void
}

/** SSE client for /api/chat/events (React Native has no EventSource). */
export class ChatEventStream {
  private xhr: XMLHttpRequest | null = null
  private parseBuffer = ''
  private responseOffset = 0
  private currentEvent: ChatEventType = 'message'
  private dataLines: string[] = []
  private closed = false
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private options: StreamOptions | null = null

  connect(options: StreamOptions) {
    this.close(false)
    this.closed = false
    this.options = options
    this.reconnectAttempt = 0
    this.open()
  }

  close(userInitiated = true) {
    if (userInitiated) {
      this.closed = true
      this.options = null
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.xhr) {
      const xhr = this.xhr
      this.xhr = null
      xhr.onprogress = null
      xhr.onload = null
      xhr.onerror = null
      xhr.onabort = null
      xhr.abort()
    }
    this.parseBuffer = ''
    this.responseOffset = 0
    this.dataLines = []
    this.options?.onConnectionChange?.(false)
  }

  private open() {
    const opts = this.options
    if (!opts || this.closed) return

    const url = `${apiUrl('/api/chat/events')}?access_token=${encodeURIComponent(opts.accessToken)}`
    const xhr = new XMLHttpRequest()
    this.xhr = xhr
    this.parseBuffer = ''
    this.responseOffset = 0
    this.currentEvent = 'message'
    this.dataLines = []

    xhr.open('GET', url)
    xhr.setRequestHeader('Accept', 'text/event-stream')
    xhr.setRequestHeader('Cache-Control', 'no-cache')

    xhr.onprogress = () => {
      const text = xhr.responseText
      const chunk = text.slice(this.responseOffset)
      this.responseOffset = text.length
      if (chunk) this.ingest(chunk)
    }

    const handleDisconnect = () => {
      if (this.closed || this.xhr !== xhr) return
      this.xhr = null
      opts.onConnectionChange?.(false)
      this.scheduleReconnect()
    }

    xhr.onload = handleDisconnect
    xhr.onerror = handleDisconnect
    xhr.onabort = () => {
      if (!this.closed) handleDisconnect()
    }

    xhr.send()

    // First bytes mean the stream is up (": connected" or an event).
    const markConnected = () => {
      if (this.closed || this.xhr !== xhr) return
      if (xhr.readyState >= XMLHttpRequest.LOADING) {
        this.reconnectAttempt = 0
        opts.onConnectionChange?.(true)
      }
    }
    xhr.onreadystatechange = markConnected
    markConnected()
  }

  private scheduleReconnect() {
    if (this.closed || !this.options || this.reconnectTimer) return
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS)
    this.reconnectAttempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.open()
    }, delay)
  }

  private ingest(chunk: string) {
    this.parseBuffer += chunk
    let newlineIndex = this.parseBuffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = this.parseBuffer.slice(0, newlineIndex).replace(/\r$/, '')
      this.parseBuffer = this.parseBuffer.slice(newlineIndex + 1)
      this.consumeLine(line)
      newlineIndex = this.parseBuffer.indexOf('\n')
    }
  }

  private consumeLine(line: string) {
    if (line.startsWith(':')) return

    if (line === '') {
      if (this.dataLines.length && this.options) {
        const raw = this.dataLines.join('\n')
        this.dataLines = []
        try {
          const data = JSON.parse(raw) as ChatEventPayload
          this.options.onEvent(this.currentEvent, data)
        } catch {
          /* malformed payload */
        }
      }
      this.currentEvent = 'message'
      return
    }

    if (line.startsWith('event:')) {
      this.currentEvent = line.slice(6).trim() as ChatEventType
      return
    }

    if (line.startsWith('data:')) {
      this.dataLines.push(line.slice(5).replace(/^\s/, ''))
    }
  }
}
