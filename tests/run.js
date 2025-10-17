async function http(method, path, body, token) {
  const res = await fetch(`http://localhost:3000/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch {}
  if (!res.ok) throw new Error(data?.error?.message || res.statusText)
  return { data, headers: res.headers }
}

async function testAuthAndClients() {
  const unique = Math.random().toString(36).slice(2)
  const email = `user_${unique}@example.com`
  await http('POST', '/auth/register', { email, password: 'password123', name: 'Test User' })
  const loginRes = await http('POST', '/auth/login', { email, password: 'password123' })
  const token = loginRes.data.data.accessToken
  const me = await http('GET', '/me', undefined, token)
  if (!me?.data?.data?.user?.email) throw new Error('me failed')
  const created = await http('POST', '/clients', { name: `Client ${unique}` }, token)
  const list = await http('GET', '/clients', undefined, token)
  if (!Array.isArray(list?.data?.data?.clients)) throw new Error('clients list failed')
  console.log('Auth + Clients tests: OK')
}

async function main() {
  try {
    await testAuthAndClients()
    console.log('All tests passed')
    process.exit(0)
  } catch (e) {
    console.error('Test failure:', e.message)
    process.exit(1)
  }
}

main()

