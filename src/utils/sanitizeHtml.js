/**
 * HTML sanitization for user-generated rich text (discussions, meeting notes, etc.).
 */
import createDOMPurify from 'dompurify'

const DEFAULT_CONFIG = {
  ALLOWED_TAGS: [
    'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4',
    'hr', 'i', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'sub', 'sup', 'u', 'ul'
  ],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class', 'data-gm-thread-id'],
  ALLOW_DATA_ATTR: false
}

let purify = null

function getPurify() {
  if (purify) return purify
  if (typeof window !== 'undefined') {
    purify = createDOMPurify(window)
  }
  return purify
}

function escapePlainText(html) {
  return String(html || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Sanitize HTML string; escapes if DOMPurify is unavailable. */
export function sanitizeHtml(html, config = DEFAULT_CONFIG) {
  const raw = html == null ? '' : String(html)
  if (!raw) return ''
  const dp = getPurify()
  if (dp && typeof dp.sanitize === 'function') {
    return dp.sanitize(raw, config)
  }
  return escapePlainText(raw)
}

export default sanitizeHtml
