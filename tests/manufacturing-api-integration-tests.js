#!/usr/bin/env node
/**
 * Manufacturing API integration tests.
 * Tests main flows: locations, inventory list, stock movements list and create.
 * Run: node tests/manufacturing-api-integration-tests.js
 * With auth: TEST_URL=http://localhost:3000 TEST_EMAIL=... TEST_PASSWORD=... node tests/manufacturing-api-integration-tests.js
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

const BASE_URL = process.env.TEST_URL || process.env.APP_URL || 'http://localhost:3000';
const EMAIL = process.env.TEST_EMAIL || '';
const PASSWORD = process.env.TEST_PASSWORD || '';

const results = { passed: [], failed: [] };

function pass(name, detail = '') {
  results.passed.push({ name, detail });
  console.log('✅', name, detail ? `– ${detail}` : '');
}

function fail(name, reason) {
  results.failed.push({ name, reason });
  console.log('❌', name, '–', reason);
}

async function api(path, method = 'GET', body = null, token) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const options = { method, headers };
  if (body && method !== 'GET') options.body = JSON.stringify(body);
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    return { status: res.status, data };
  } catch (e) {
    return { status: 0, error: e.message, data: null };
  }
}

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) return null;
  const body = await res.json();
  const token = body.data?.accessToken ?? body.accessToken;
  return token || null;
}

async function run() {
  console.log('Manufacturing API integration tests –', BASE_URL);
  const token = await login();
  if (!token) {
    console.log('⏭️ No auth – running only public/health checks');
  }

  // 1) GET locations
  const locRes = await api('/api/manufacturing/locations', 'GET', null, token);
  const locData = locRes.data?.data ?? locRes.data ?? {};
  const locations = locData.locations || [];
  if (locRes.status === 200 && Array.isArray(locations)) {
    pass('GET /api/manufacturing/locations', `${locations.length} location(s)`);
  } else {
    fail('GET /api/manufacturing/locations', `status ${locRes.status}`);
  }

  // 2) GET inventory
  const invRes = await api('/api/manufacturing/inventory', 'GET', null, token);
  const invData = invRes.data?.data ?? invRes.data ?? {};
  const inventory = invData.inventory || invData.items || [];
  if (invRes.status === 200 && Array.isArray(inventory)) {
    pass('GET /api/manufacturing/inventory', `${inventory.length} item(s)`);
  } else {
    fail('GET /api/manufacturing/inventory', `status ${invRes.status}`);
  }

  // 3) GET stock-movements
  const movRes = await api('/api/manufacturing/stock-movements', 'GET', null, token);
  const movData = movRes.data?.data ?? movRes.data ?? {};
  const movements = movData.movements || [];
  if (movRes.status === 200 && Array.isArray(movements)) {
    pass('GET /api/manufacturing/stock-movements', `${movements.length} movement(s)`);
  } else {
    fail('GET /api/manufacturing/stock-movements', `status ${movRes.status}`);
  }

  // 4) Optional: POST stock-movement (receipt) if we have auth and at least one location
  if (token && locations.length > 0 && inventory.length > 0) {
    const locId = locations[0].id;
    const item = inventory[0];
    const postRes = await api('/api/manufacturing/stock-movements', 'POST', {
      type: 'receipt',
      sku: item.sku,
      itemName: item.name || item.sku,
      quantity: 1,
      toLocationId: locId,
      date: new Date().toISOString().split('T')[0],
    }, token);
    if (postRes.status === 200 || postRes.status === 201) {
      pass('POST /api/manufacturing/stock-movements (receipt)', '');
    } else {
      fail('POST /api/manufacturing/stock-movements', `status ${postRes.status}`);
    }
  }

  const total = results.passed.length + results.failed.length;
  console.log('\n' + (results.failed.length ? 'FAILED' : 'PASSED') + ': ' + results.passed.length + '/' + total);
  process.exit(results.failed.length > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
