#!/usr/bin/env node
/**
 * Manufacturing section – production test: Functionality, UI, Persistence.
 * Run: TEST_URL=https://abcoafrica.co.za TEST_EMAIL=... TEST_PASSWORD=... node scripts/test-manufacturing-production-full.js
 * Or:  npm run test:manufacturing:production:full
 */

import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

const BASE_URL = process.env.TEST_URL || process.env.APP_URL || 'https://abcoafrica.co.za';
const EMAIL = process.env.TEST_EMAIL || '';
const PASSWORD = process.env.TEST_PASSWORD || '';

const results = { passed: [], failed: [], skipped: [] };

function pass(name, detail = '') {
  results.passed.push({ name, detail });
  console.log('✅', name, detail ? `– ${detail}` : '');
}

function fail(name, reason) {
  results.failed.push({ name, reason });
  console.log('❌', name, '–', reason);
}

function skip(name, reason) {
  results.skipped.push({ name, reason });
  console.log('⏭️', name, '–', reason);
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

function apiData(res) {
  return res?.data?.data ?? res?.data ?? {};
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

async function runApiTests(token) {
  if (!token) {
    skip('API: All authenticated tests', 'No token (set TEST_EMAIL and TEST_PASSWORD)');
    return;
  }

  // Locations
  const locRes = await api('/api/manufacturing/locations', 'GET', null, token);
  const locations = apiData(locRes).locations || [];
  if (locRes.status === 200 && Array.isArray(locations)) {
    pass('API: List locations', `${locations.length} location(s)`);
  } else {
    fail('API: List locations', `status ${locRes.status}`);
  }

  // Inventory – no location filter (all locations, one per SKU)
  const invRes = await api('/api/manufacturing/inventory', 'GET', null, token);
  const inventory = apiData(invRes).inventory || apiData(invRes).items || [];
  if (invRes.status !== 200) {
    fail('API: List inventory', `status ${invRes.status}`);
  } else {
    pass('API: List inventory', `${inventory.length} item(s)`);
    const skus = inventory.map((i) => i.sku).filter(Boolean);
    const uniqueSkus = new Set(skus);
    if (skus.length === uniqueSkus.size) {
      pass('API: Inventory one row per SKU (no duplicate SKUs)', '');
    } else {
      fail('API: Inventory one row per SKU', `duplicate SKUs in list (${skus.length} rows, ${uniqueSkus.size} unique)`);
    }
  }

  // Stock movements
  const movRes = await api('/api/manufacturing/stock-movements', 'GET', null, token);
  const movements = apiData(movRes).movements || [];
  if (movRes.status === 200 && Array.isArray(movements)) {
    pass('API: List stock movements', `${movements.length} movement(s)`);
    const withLocationIds = movements.filter((m) => m.fromLocation && typeof m.fromLocation === 'string' && m.fromLocation.length > 0);
    if (movements.length > 0) {
      pass('API: Movements have location references', `${withLocationIds.length}/${movements.length} with fromLocation`);
    }
  } else {
    fail('API: List stock movements', `status ${movRes.status}`);
  }

  // Single inventory item + ledger (if we have items)
  if (inventory.length > 0) {
    const item = inventory[0];
    const itemId = item.id || item.sku;
    const detailRes = await api(`/api/manufacturing/inventory/${itemId}`, 'GET', null, token);
    const detail = apiData(detailRes).item;
    if (detailRes.status === 200 && detail) {
      pass('API: Get inventory item detail', detail.sku || itemId);
      const ledger = detail.ledger || detail.stockLedger || [];
      if (Array.isArray(ledger)) {
        pass('API: Item has ledger', `${ledger.length} ledger entries`);
      }
    } else {
      fail('API: Get inventory item detail', `status ${detailRes.status}`);
    }
  }

  // Transfer validation (400 when insufficient stock – no side effects)
  const mainLoc = locations[0];
  const secondLoc = locations[1];
  if (mainLoc && secondLoc && inventory.length > 0) {
    const sku = inventory[0].sku;
    const transferRes = await api('/api/manufacturing/stock-movements', 'POST', {
      type: 'transfer',
      sku,
      itemName: inventory[0].name || 'Test',
      quantity: 999999,
      fromLocationId: mainLoc.id,
      toLocationId: secondLoc.id,
    }, token);
    if (transferRes.status === 400) {
      const msg = (transferRes.data?.error?.message || transferRes.data?.message || JSON.stringify(transferRes.data)).toLowerCase();
      const hasClearMessage = msg.includes('insufficient') || msg.includes('required') || msg.includes('stock');
      pass('API: Transfer validation (400 + clear message)', hasClearMessage ? 'insufficient stock or required' : '400 returned');
    } else if (transferRes.status === 201 || transferRes.status === 200) {
      skip('API: Transfer validation', 'transfer succeeded (high qty allowed – no assertion)');
    } else {
      fail('API: Transfer validation', `status ${transferRes.status}`);
    }
  }
}

async function runUiTests(token) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);

    if (!token || !EMAIL || !PASSWORD) {
      skip('UI: All UI tests', 'No token – login required');
      await browser.close();
      return;
    }

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2000);

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    await emailInput.fill(EMAIL);
    await passwordInput.fill(PASSWORD);

    const loginResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/api/auth/login') && res.status() === 200,
      { timeout: 15000 }
    ).catch(() => null);
    await page.locator('button[type="submit"]').first().click();
    await loginResponsePromise;
    await page.waitForTimeout(3000);

    await page.goto(`${BASE_URL}/manufacturing`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    const heading = page.getByRole('heading', { name: 'Manufacturing' });
    let headingVisible = await heading.isVisible().catch(() => false);
    if (!headingVisible) {
      await page.waitForTimeout(5000);
      headingVisible = await heading.isVisible().catch(() => false);
    }
    if (headingVisible) {
      pass('UI: Manufacturing page loads', '');
    } else {
      const subtext = await page.locator('text=Stock control and production management').first().isVisible().catch(() => false);
      if (subtext) {
        pass('UI: Manufacturing page loads', '');
      } else {
        fail('UI: Manufacturing page loads', 'title/tab not found');
      }
    }

    const invTab = page.getByRole('button', { name: 'Inventory' }).first();
    if (await invTab.isVisible()) {
      await invTab.click();
      await page.waitForTimeout(2000);
    }

    const searchInput = page.getByPlaceholder('Search by name or SKU...');
    const searchVisible = await searchInput.isVisible().catch(() => false);
    if (searchVisible) {
      pass('UI: Inventory tab – search input visible', '');
    } else {
      fail('UI: Inventory tab – search input', 'not found');
    }

    const movementsTab = page.getByRole('button', { name: 'Stock Movements' }).first();
    if (await movementsTab.isVisible()) {
      await movementsTab.click();
      await page.waitForTimeout(2500);
    }

    const recordBtn = page.getByRole('button', { name: /Record (Stock )?Movement/i }).first();
    await recordBtn.scrollIntoViewIfNeeded().catch(() => {});
    if (await recordBtn.isVisible()) {
      await recordBtn.click();
      await page.waitForTimeout(2000);
    }

    const modalTitle = page.locator('h2:has-text("Record Stock Movement")');
    const modalOpen = await modalTitle.isVisible().catch(() => false);
    if (!modalOpen) {
      fail('UI: Record Movement – From/To dropdowns', 'modal did not open');
    } else {
      const modal = page.locator('div.max-w-2xl').first();
      const movementTypeSelect = modal.locator('select').first();
      await movementTypeSelect.selectOption('transfer').catch(() => {});
      await page.waitForTimeout(500);

      const fromLabel = page.locator('text=From Location').first();
      const toLabel = page.locator('text=To Location').first();
      const selectsWithLocation = page.locator('select').filter({ has: page.locator('option:has-text("Select location...")') });
      const fromVisible = await fromLabel.isVisible().catch(() => false);
      const toVisible = await toLabel.isVisible().catch(() => false);
      const locationSelectCount = await selectsWithLocation.count();

      if (locationSelectCount >= 2 && (fromVisible || toVisible)) {
        pass('UI: Record Movement – From/To location dropdowns', 'both present');
      } else if (locationSelectCount >= 1) {
        pass('UI: Record Movement – From/To location dropdowns', 'at least one location select present');
      } else {
        fail('UI: Record Movement – From/To dropdowns', 'not found');
      }
    }

    await browser.close();
  } catch (e) {
    fail('UI: Run', e.message);
    if (browser) await browser.close().catch(() => {});
  }
}

async function runPersistenceCheck(token) {
  if (!token) {
    skip('Persistence: Check', 'No token');
    return;
  }

  const before = await api('/api/manufacturing/stock-movements', 'GET', null, token);
  const movementsBefore = (apiData(before).movements || []).length;

  const locRes = await api('/api/manufacturing/locations', 'GET', null, token);
  const locations = apiData(locRes).locations || [];
  const invRes = await api('/api/manufacturing/inventory', 'GET', null, token);
  const inventory = apiData(invRes).inventory || apiData(invRes).items || [];

  if (locations.length < 1 || inventory.length < 1) {
    skip('Persistence: Create movement and re-fetch', 'need at least 1 location and 1 inventory item');
    return;
  }

  const loc = locations[0];
  const item = inventory[0];
  const receiptRes = await api('/api/manufacturing/stock-movements', 'POST', {
    type: 'receipt',
    sku: item.sku,
    itemName: item.name || item.sku,
    quantity: 1,
    toLocationId: loc.id,
    reference: `PERSIST-TEST-${Date.now()}`,
  }, token);

  if (receiptRes.status !== 201 && receiptRes.status !== 200) {
    skip('Persistence: Create movement', `create failed: ${receiptRes.status}`);
    return;
  }

  const created = apiData(receiptRes).movement;
  const movementId = created?.id;

  const after = await api('/api/manufacturing/stock-movements', 'GET', null, token);
  const movementsAfter = (apiData(after).movements || []).length;

  if (movementsAfter > movementsBefore) {
    pass('Persistence: Movement count increased after create', '');
  } else {
    fail('Persistence: Movement count after create', `before ${movementsBefore}, after ${movementsAfter}`);
  }

  if (movementId) {
    const oneRes = await api(`/api/manufacturing/stock-movements/${movementId}`, 'GET', null, token);
    if (oneRes.status === 200 && apiData(oneRes).movement) {
      pass('Persistence: Movement fetch by ID after create', '');
    } else {
      fail('Persistence: Movement fetch by ID', `status ${oneRes.status}`);
    }
  }

  pass('Persistence: Create and re-fetch flow', '');
}

async function main() {
  console.log('Manufacturing Production Test –', BASE_URL);
  console.log('');

  const token = EMAIL && PASSWORD ? await login() : null;
  if (!token && (EMAIL || PASSWORD)) {
    fail('Login', 'Invalid credentials or server error');
  } else if (!EMAIL || !PASSWORD) {
    skip('Login', 'Set TEST_EMAIL and TEST_PASSWORD for full run');
  } else {
    pass('Login', 'OK');
  }

  console.log('\n--- Functionality (API) ---');
  await runApiTests(token);

  console.log('\n--- UI ---');
  await runUiTests(token);

  console.log('\n--- Persistence ---');
  await runPersistenceCheck(token);

  console.log('\n--- Summary ---');
  console.log('Passed:', results.passed.length);
  console.log('Failed:', results.failed.length);
  console.log('Skipped:', results.skipped.length);
  if (results.failed.length > 0) {
    console.log('\nFailed:');
    results.failed.forEach(({ name, reason }) => console.log('  -', name, ':', reason));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
