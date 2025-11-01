export async function parseJsonBody(req) {
  // If Express middleware already parsed the body, use that
  // Check if req.body exists and is not just an empty object from default
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    console.log('📦 Using req.body from Express middleware:', req.body)
    return req.body
  }
  
  // If req.body exists but is empty, Express might have parsed it as empty
  // Check if the request has content-length indicating a body
  const contentLength = req.headers['content-length']
  if (req.body && contentLength && parseInt(contentLength) > 0) {
    // Express parsed it but result is empty - might be a parsing issue
    console.log('⚠️ req.body exists but empty, content-length:', contentLength)
  }
  
  // Otherwise, try to read from stream (shouldn't happen with Express, but fallback)
  console.log('📥 Reading body from stream (Express body not available)')
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString()
  if (!raw) {
    console.log('⚠️ No body data in stream')
    return {}
  }
  try {
    const parsed = JSON.parse(raw)
    console.log('✅ Parsed body from stream:', parsed)
    return parsed
  } catch (e) {
    console.error('❌ Failed to parse body:', e.message)
    return {}
  }
}

