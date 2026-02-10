#!/usr/bin/env node
/**
 * Purge all manufacturing data (inventory, movements, BOMs, production orders, locations, suppliers, purchase orders).
 * Requires: CONFIRM_PURGE=yes and auth (TEST_EMAIL / TEST_PASSWORD for API, or run against local server).
 *
 * Usage:
 *   CONFIRM_PURGE=yes TEST_URL=https://abcoafrica.co.za TEST_EMAIL=... TEST_PASSWORD=... node scripts/purge-manufacturing-data.js
 *   CONFIRM_PURGE=yes node scripts/purge-manufacturing-data.js   # uses localhost + .env credentials
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
const CONFIRM = process.env.CONFIRM_PURGE === 'yes' || process.env.CONFIRM_PURGE === 'true';

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed: ${res.status} ${text}`);
  }
  const body = await res.json();
  const token = body.data?.accessToken ?? body.accessToken;
  if (!token) throw new Error('No accessToken in login response');
  return token;
}

async function purge(token) {
  const url = `${BASE_URL}/api/manufacturing/purge?confirm=true`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

async function main() {
  if (!CONFIRM) {
    console.error('Aborted. Set CONFIRM_PURGE=yes to purge all manufacturing data.');
    process.exit(1);
  }
  if (!EMAIL || !PASSWORD) {
    console.error('Set TEST_EMAIL and TEST_PASSWORD (e.g. in .env) to authenticate.');
    process.exit(1);
  }

  console.log('Manufacturing purge –', BASE_URL);
  let token;
  try {
    token = await login();
    console.log('Authenticated.');
  } catch (e) {
    console.error('Login failed:', e.message);
    process.exit(1);
  }

  const result = await purge(token);
  if (result.status !== 200) {
    console.error('Purge failed:', result.status, result.data);
    process.exit(1);
  }

  const { existing, deleted } = result.data || {};
  console.log('Purge completed.');
  if (existing) {
    console.log('Previous counts:', existing);
  }
  if (deleted) {
    console.log('Deleted:', deleted);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
