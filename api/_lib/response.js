export function ok(res, data) {
  res.setHeader('Content-Type', 'application/json')
  res.statusCode = 200
  // Serialize Dates to ISO strings and handle undefined values
  const serialized = JSON.stringify({ data }, (key, value) => {
    if (value instanceof Date) {
      return value.toISOString()
    }
    return value
  })
  console.log('📤 ok() response:', serialized.substring(0, 150))
  res.end(serialized)
}

export function created(res, data) {
  res.setHeader('Content-Type', 'application/json')
  res.statusCode = 201
  // Serialize Dates to ISO strings and handle undefined values
  res.end(JSON.stringify({ data }, (key, value) => {
    if (value instanceof Date) {
      return value.toISOString()
    }
    return value
  }))
}

export function badRequest(res, message, details) {
  res.setHeader('Content-Type', 'application/json')
  res.statusCode = 400
  res.end(JSON.stringify({ error: { code: 'BAD_REQUEST', message, details } }))
}

export function unauthorized(res, message = 'Unauthorized') {
  res.setHeader('Content-Type', 'application/json')
  res.statusCode = 401
  res.end(JSON.stringify({ error: { code: 'UNAUTHORIZED', message } }))
}

export function forbidden(res, message = 'Forbidden') {
  res.setHeader('Content-Type', 'application/json')
  res.statusCode = 403
  res.end(JSON.stringify({ error: { code: 'FORBIDDEN', message } }))
}

export function notFound(res, message = 'Not found') {
  res.setHeader('Content-Type', 'application/json')
  res.statusCode = 404
  res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message } }))
}

export function serverError(res, message = 'Server error', details) {
  res.setHeader('Content-Type', 'application/json')
  res.statusCode = 500
  res.end(JSON.stringify({ error: { code: 'SERVER_ERROR', message, details } }))
}

