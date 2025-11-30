export async function parseJsonBody(req) {
  // If Express middleware already parsed the body, use that
  // Check if req.body exists and is not just an empty object from default
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    return req.body
  }
  
  // If req.body exists but is empty, Express might have parsed it as empty
  // Check if the request has content-length indicating a body
  const contentLength = req.headers['content-length']
  if (req.body && contentLength && parseInt(contentLength) > 0) {
    // Express parsed it but result is empty - might be a parsing issue
  }
  
  // Otherwise, try to read from stream (shouldn't happen with Express, but fallback)
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString()
  if (!raw) {
    return {}
  }
  try {
    const parsed = JSON.parse(raw)
    return parsed
  } catch (e) {
    console.error('❌ Failed to parse body:', e.message)
    return {}
  }
}

