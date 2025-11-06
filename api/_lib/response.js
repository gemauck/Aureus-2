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
  
  // Detect database connection errors and provide better error messages
  let errorCode = 'SERVER_ERROR'
  let errorMessage = message
  let errorDetails = details
  
  // Check both message and details for connection errors
  const messageStr = typeof message === 'string' ? message.toLowerCase() : ''
  const detailsStr = typeof details === 'string' ? details.toLowerCase() : ''
  const combinedText = `${messageStr} ${detailsStr}`
  
  if (combinedText.includes("can't reach database server") ||
      combinedText.includes("can't reach database") ||
      combinedText.includes("econnrefused") ||
      combinedText.includes("etimedout") ||
      combinedText.includes("enotfound") ||
      combinedText.includes("connection timeout") ||
      combinedText.includes("connection refused") ||
      (combinedText.includes("connection") && (combinedText.includes("unreachable") || combinedText.includes("failed")))) {
    errorCode = 'DATABASE_CONNECTION_ERROR'
    errorMessage = 'Database connection failed'
    errorDetails = 'The database server is unreachable. Please check your network connection and ensure the database server is running.'
  }
  
  // In development, include more details
  const isDevelopment = process.env.NODE_ENV === 'development'
  const response = {
    error: {
      code: errorCode,
      message: errorMessage,
      details: errorDetails
    }
  }
  
  // Include full error details in development
  if (isDevelopment && details) {
    response.error.fullDetails = details
  }
  
  res.end(JSON.stringify(response))
}

