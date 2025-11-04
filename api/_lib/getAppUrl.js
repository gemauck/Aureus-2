// Helper function to get the application URL with proper fallback
// Ensures production URLs don't default to localhost
export function getAppUrl() {
  // If APP_URL is explicitly set and not localhost, use it
  if (process.env.APP_URL && !process.env.APP_URL.includes('localhost')) {
    return process.env.APP_URL
  }
  
  // In production, default to production URL (ignore localhost APP_URL)
  if (process.env.NODE_ENV === 'production') {
    return 'https://abcoafrica.co.za'
  }
  
  // Check if we're likely in production by checking hostname patterns
  // This helps when NODE_ENV isn't set correctly
  const hostname = process.env.HOSTNAME || process.env.HOST || ''
  if (hostname.includes('abcoafrica') || hostname.includes('droplet') || hostname.includes('production')) {
    return 'https://abcoafrica.co.za'
  }
  
  // In development, default to localhost
  return process.env.APP_URL || 'http://localhost:3001'
}

