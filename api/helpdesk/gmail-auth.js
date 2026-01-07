// Gmail OAuth2 authentication setup
// Use this to get the refresh token needed for Gmail API access

import { google } from 'googleapis'

// Step 1: Get authorization URL
export async function handleGmailAuth(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/helpdesk/gmail-callback`
  )

  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify'
  ]

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent' // Force consent to get refresh token
  })

  res.redirect(authUrl)
}

// Step 2: Handle OAuth callback
export async function handleGmailCallback(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { code } = req.query

  if (!code) {
    return res.status(400).send('No authorization code provided')
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/helpdesk/gmail-callback`
    )

    const { tokens } = await oauth2Client.getToken(code)
    
    console.log('✅ Gmail OAuth tokens received:')
    console.log('Refresh Token:', tokens.refresh_token)
    console.log('Access Token:', tokens.access_token?.substring(0, 20) + '...')

    // Save refresh token to .env
    res.send(`
      <h1>Gmail OAuth Success!</h1>
      <p>Add this to your .env file:</p>
      <pre style="background: #f4f4f4; padding: 20px; border-radius: 5px;">
GMAIL_REFRESH_TOKEN="${tokens.refresh_token}"
      </pre>
      <p>Then restart your server.</p>
    `)
  } catch (error) {
    console.error('❌ Gmail OAuth error:', error)
    res.status(500).send(`Error: ${error.message}`)
  }
}

