// Simple test endpoint to debug API routing
export default async function handler(req, res) {
  
  try {
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({ 
      message: 'Test endpoint working',
      method: req.method,
      url: req.url,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Test Simple API Error:', error);
    res.status(500).json({ error: 'Test endpoint failed', details: error.message });
  }
}
