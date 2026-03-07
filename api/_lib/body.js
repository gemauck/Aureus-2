export async function parseJsonBody(req) {
  // If Express middleware already parsed the body, use it. Do not try to read the
  // request stream when req.body exists—the stream may already be consumed, which
  // would yield an empty body and drop documentId/month/year (e.g. for send-email activity).
  if (req.body != null && typeof req.body === 'object') {
    return req.body
  }

  // No body from Express: read from stream (e.g. no json middleware ran)
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

