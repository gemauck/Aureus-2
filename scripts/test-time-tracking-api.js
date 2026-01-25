#!/usr/bin/env node
/**
 * Test time-entries API: login, create entry, list by project.
 * Usage:
 *   node scripts/test-time-tracking-api.js
 *   LOGIN_EMAIL=you@example.com LOGIN_PASSWORD=secret node scripts/test-time-tracking-api.js
 *
 * Requires server running at BASE (default http://localhost:3000).
 */
const BASE = process.env.BASE || 'http://localhost:3000';

async function main() {
  console.log('🧪 Time tracking API test');
  console.log('   BASE:', BASE);
  const email = process.env.LOGIN_EMAIL || 'admin@example.com';
  const password = process.env.LOGIN_PASSWORD || 'password123';

  let token = null;

  // 1) Login
  console.log('\n1) Login...');
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await loginRes.json().catch(() => ({}));
  token = loginBody?.data?.accessToken || loginBody?.accessToken || null;
  if (!loginRes.ok || !token) {
    console.log('   ❌ Login failed:', loginRes.status, loginBody?.error?.message || loginBody?.message || '');
    console.log('   Set LOGIN_EMAIL and LOGIN_PASSWORD if needed.');
    process.exit(1);
  }
  console.log('   ✅ Logged in');

  // 2) Get first project id
  console.log('\n2) Get first project...');
  const projectsRes = await fetch(`${BASE}/api/projects`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const projectsBody = await projectsRes.json().catch(() => ({}));
  const projects = projectsBody?.data?.projects ?? projectsBody?.projects ?? projectsBody?.data ?? [];
  const list = Array.isArray(projects) ? projects : [];
  const project = list[0];
  if (!project?.id) {
    console.log('   ❌ No projects found');
    process.exit(1);
  }
  console.log('   ✅ Project:', project.id, project.name || '');

  // 3) Create time entry
  console.log('\n3) Create time entry...');
  const payload = {
    date: new Date().toISOString(),
    hours: 0.25,
    projectId: project.id,
    projectName: project.name || '',
    description: 'API test entry',
  };
  const createRes = await fetch(`${BASE}/api/time-entries`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const createBody = await createRes.json().catch(() => ({}));
  if (!createRes.ok) {
    console.log('   ❌ Create failed:', createRes.status, createBody?.error?.message ?? createBody?.message ?? JSON.stringify(createBody).slice(0, 200));
    if (String(createBody?.error?.details || '').includes('project: ""')) {
      console.log('   💡 Restart the backend (npm run dev:backend) so it loads the updated time-entries API.');
    }
    process.exit(1);
  }
  const created = createBody?.data ?? createBody;
  const id = created?.id;
  if (!id) {
    console.log('   ❌ No id in response:', createBody);
    process.exit(1);
  }
  console.log('   ✅ Created time entry:', id);

  // 4) List by project
  console.log('\n4) List time entries for project...');
  const listRes = await fetch(`${BASE}/api/time-entries?projectId=${encodeURIComponent(project.id)}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const listBody = await listRes.json().catch(() => ({}));
  const entries = Array.isArray(listBody?.data) ? listBody.data : (Array.isArray(listBody) ? listBody : []);
  const found = entries.some((e) => e.id === id);
  if (!listRes.ok || !found) {
    console.log('   ❌ List failed or new entry not found:', listRes.status, entries.length, 'entries');
    process.exit(1);
  }
  console.log('   ✅ Found new entry in list (' + entries.length + ' total)');

  console.log('\n✅ Time tracking API test passed.');
}

main().catch((err) => {
  console.error('❌', err.message || err);
  process.exit(1);
});
