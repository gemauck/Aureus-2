export function ok(res, data) {
  // Prevent sending response if already sent
  if (res.headersSent || res.writableEnded) {
    console.warn('⚠️ ok: Response already sent, skipping response')
    return
  }
  
  // Serialize Dates to ISO strings and handle undefined values
  const serialized = JSON.stringify({ data }, (key, value) => {
    if (value instanceof Date) {
      return value.toISOString()
    }
    return value
  })
  console.log('📤 ok() response:', serialized.substring(0, 150))
  
  // Set status code first, then headers, then send response (HTTP/2 compatible)
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Length', Buffer.byteLength(serialized, 'utf8'))
  res.end(serialized)
}

export function created(res, data) {
  // Prevent sending response if already sent
  if (res.headersSent || res.writableEnded) {
    console.warn('⚠️ created: Response already sent, skipping response')
    return
  }
  
  // Serialize Dates to ISO strings and handle undefined values
  const serialized = JSON.stringify({ data }, (key, value) => {
    if (value instanceof Date) {
      return value.toISOString()
    }
    return value
  })
  
  // Set status code first, then headers, then send response (HTTP/2 compatible)
  res.statusCode = 201
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Length', Buffer.byteLength(serialized, 'utf8'))
  res.end(serialized)
}

export function badRequest(res, message, details) {
  // Prevent sending response if already sent
  if (res.headersSent || res.writableEnded) {
    console.warn('⚠️ badRequest: Response already sent, skipping response')
    return
  }
  
  const serialized = JSON.stringify({ error: { code: 'BAD_REQUEST', message, details } })
  
  // Set status code first, then headers, then send response (HTTP/2 compatible)
  res.statusCode = 400
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Length', Buffer.byteLength(serialized, 'utf8'))
  res.end(serialized)
}

export function unauthorized(res, message = 'Unauthorized') {
  // Prevent sending response if already sent
  if (res.headersSent || res.writableEnded) {
    console.warn('⚠️ unauthorized: Response already sent, skipping response')
    return
  }
  
  const serialized = JSON.stringify({ error: { code: 'UNAUTHORIZED', message } })
  
  // Set status code first, then headers, then send response (HTTP/2 compatible)
  res.statusCode = 401
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Length', Buffer.byteLength(serialized, 'utf8'))
  res.end(serialized)
}

export function forbidden(res, message = 'Forbidden') {
  // Prevent sending response if already sent
  if (res.headersSent || res.writableEnded) {
    console.warn('⚠️ forbidden: Response already sent, skipping response')
    return
  }
  
  const serialized = JSON.stringify({ error: { code: 'FORBIDDEN', message } })
  
  // Set status code first, then headers, then send response (HTTP/2 compatible)
  res.statusCode = 403
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Length', Buffer.byteLength(serialized, 'utf8'))
  res.end(serialized)
}

export function notFound(res, message = 'Not found') {
  // Prevent sending response if already sent
  if (res.headersSent || res.writableEnded) {
    console.warn('⚠️ notFound: Response already sent, skipping response')
    return
  }
  
  const serialized = JSON.stringify({ error: { code: 'NOT_FOUND', message } })
  
  // Set status code first, then headers, then send response (HTTP/2 compatible)
  res.statusCode = 404
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Length', Buffer.byteLength(serialized, 'utf8'))
  res.end(serialized)
}

export function serverError(res, message = 'Server error', details) {
  // Prevent sending response if already sent
  if (res.headersSent || res.writableEnded) {
    console.warn('⚠️ serverError: Response already sent, skipping error response')
    return
  }
  
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
  
  const serialized = JSON.stringify(response)
  
  // Set status code first, then headers, then send response (HTTP/2 compatible)
  res.statusCode = 500
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Length', Buffer.byteLength(serialized, 'utf8'))
  res.end(serialized)
}

