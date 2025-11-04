// Helper function to get the application URL with proper fallback
// Ensures production URLs don't default to localhost
export function getAppUrl() {
  // If APP_URL is explicitly set, use it
  if (process.env.APP_URL) {
    return process.env.APP_URL
  }
  
  // In production, default to production URL
  if (process.env.NODE_ENV === 'production') {
    return 'https://abcoafrica.co.za'
  }
  
  // In development, default to localhost
  return 'http://localhost:3001'
}

