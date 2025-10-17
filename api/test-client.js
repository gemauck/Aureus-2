export default function handler(req, res) {
  res.status(200).json({ 
    message: 'Individual client endpoint working',
    method: req.method,
    url: req.url,
    id: req.query.id || 'no-id'
  })
}
