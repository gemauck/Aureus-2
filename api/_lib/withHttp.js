const ALLOWED_ORIGIN = process.env.APP_URL || '*'

export function withHttp(handler) {
  return async function(req, res) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
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

