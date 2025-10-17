// Health check endpoint for Railway
import { withHttp } from './_lib/withHttp.js'

async function handler(req, res) {
  try {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      platform: 'railway',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'production'
    })
  } catch (error) {
    console.error('Health check error:', error)
    res.status(500).json({ 
      status: 'error', 
      message: 'Health check failed',
      timestamp: new Date().toISOString()
    })
  }
}

export default withHttp(handler)
