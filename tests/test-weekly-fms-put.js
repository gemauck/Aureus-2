#!/usr/bin/env node

/**
 * Verify PUT /api/projects/:id with weeklyFMSReviewSections returns 200 (not 500).
 * Run after applying the "Weekly FMS JSON-only" fix and restarting the backend.
 *
 * Usage:
 *   PROJECT_ID=<id> node tests/test-weekly-fms-put.js
 *   PROJECT_ID=<id> AUTH_TOKEN=<jwt> node tests/test-weekly-fms-put.js
 *   npm run test:weekly-fms-put -- PROJECT_ID=<id>
 *
 * Watch server logs: 🔵 = api/projects/[id].js, 🟢 = api/projects.js
 * Exit 0 if PUT returns 200; exit 1 otherwise.
 */

const BASE_URL = process.env.BASE_URL || process.env.APP_URL || process.env.TEST_URL || 'http://localhost:3000';
const PROJECT_ID = process.env.PROJECT_ID;
const AUTH_TOKEN = process.env.AUTH_TOKEN;

const payload = {
  weeklyFMSReviewSections: JSON.stringify({
    2026: [
      { id: 'test-1', name: 'Test section', documents: [] }
    ]
  })
};

async function main() {
  if (!PROJECT_ID) {
    console.error('❌ PROJECT_ID is required.');
    console.error('   Example: PROJECT_ID=cmkuthaua001d11or2zbn2etq node tests/test-weekly-fms-put.js');
    console.error('   Or: npm run test:weekly-fms-put -- PROJECT_ID=cmkuthaua001d11or2zbn2etq');
    process.exit(1);
  }

  console.log('📡 PUT', `${BASE_URL}/api/projects/${PROJECT_ID}`, '(watch server logs for 🔵 or 🟢)');
  const url = `${BASE_URL}/api/projects/${PROJECT_ID}`;
  const options = {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  };
  if (AUTH_TOKEN) {
    options.headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }

  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    console.error('❌ Request failed:', err.message);
    console.error('   Is the backend running? Start with: npm run dev:backend');
    process.exit(1);
  }

  const status = res.status;
  let body = '';
  try {
    body = await res.text();
  } catch (_) {}

  if (status === 200) {
    console.log('✅ Weekly FMS PUT returned 200 – fix is active.');
    process.exit(0);
  }

  if (status === 401 || status === 403) {
    console.warn('⚠️  PUT returned', status, '– auth required.');
    console.warn('   Set AUTH_TOKEN=<your-jwt> to test authenticated PUT, or run in browser while logged in.');
    process.exit(1);
  }

  if (status === 500) {
    console.error('❌ Weekly FMS PUT returned 500.');
    try {
      const json = JSON.parse(body);
      if (json.details) console.error('   Details:', json.details);
      if (json.message) console.error('   Message:', json.message);
    } catch (_) {
      if (body) console.error('   Body:', body.slice(0, 300));
    }
    console.error('   Restart the backend (npm run dev:backend) so api/projects.js changes are loaded.');
    process.exit(1);
  }

  console.error('❌ PUT returned', status);
  if (body) console.error('   Body:', body.slice(0, 300));
  process.exit(1);
}

main();
