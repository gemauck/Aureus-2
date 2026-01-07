// Allow multiple origins for development
const allowedOrigins = [
  process.env.APP_URL,
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:8000',
  'https://abco-erp-2-cnlz.vercel.app',
  'https://abcoafrica.co.za',
  'http://abcoafrica.co.za',
  'https://www.abcoafrica.co.za',
  'http://www.abcoafrica.co.za',
  // Also include versions with trailing dots (some browsers add these)
  'https://abcoafrica.co.za.',
  'http://abcoafrica.co.za.',
  'https://www.abcoafrica.co.za.',
  'http://www.abcoafrica.co.za.'
].filter(Boolean)

const ALLOWED_ORIGIN = (req) => {
  let origin = req.headers.origin
  
  // Normalize origin by removing trailing dots
  if (origin && origin.endsWith('.')) {
    origin = origin.slice(0, -1)
  }
  
  if (allowedOrigins.includes(origin)) {
    return origin
  }
  
  // For localhost development, allow localhost origins
  if (origin && origin.startsWith('http://localhost:')) {
    return origin
  }
  
  return allowedOrigins[0] || '*'
}

export function withHttp(handler) {
  return async function(req, res) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN(req))
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('X-XSS-Protection', '0')

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      return res.end()
    }

    // Await the handler to properly catch async errors
    return await handler(req, res)
  }
}

