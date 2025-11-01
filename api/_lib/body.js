export async function parseJsonBody(req) {
  // If Express middleware already parsed the body, use that
  if (req.body && typeof req.body === 'object') {
    return req.body
  }
  
  // Otherwise, read from stream (for non-Express cases)
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString()
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

