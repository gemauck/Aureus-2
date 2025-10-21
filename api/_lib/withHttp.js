// Allow multiple origins for development
const allowedOrigins = [
  process.env.APP_URL,
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:8000',
  'https://abco-erp-2-cnlz.vercel.app'
].filter(Boolean)

const ALLOWED_ORIGIN = (req) => {
  const origin = req.headers.origin
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

    return handler(req, res)
  }
}

