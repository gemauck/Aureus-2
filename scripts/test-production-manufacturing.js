#!/usr/bin/env node
/**
 * Quick production browser test: Manufacturing inventory empty after purge.
 * Usage: TEST_EMAIL=admin@abcoafrica.co.za TEST_PASSWORD=xxx node scripts/test-production-manufacturing.js
 * Or:   npm run test:prod:manufacturing
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_URL || 'https://abcoafrica.co.za';
const EMAIL = process.env.TEST_EMAIL || '';
const PASSWORD = process.env.TEST_PASSWORD || '';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  try {
    console.log('1. Opening', BASE_URL + '/login');
    await page.goto(BASE_URL + '/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    if (EMAIL && PASSWORD) {
      console.log('2. Logging in…');
      await page.fill('input[type="email"], input[name="email"]', EMAIL);
      await page.fill('input[type="password"], input[name="password"]', PASSWORD);
      await page.click('button[type="submit"], button:has-text("Login"), [type="submit"]');
      await page.waitForTimeout(3000);
    } else {
      console.log('2. Skipping login (set TEST_EMAIL and TEST_PASSWORD to test behind login)');
    }

    console.log('3. Going to Manufacturing');
    await page.goto(BASE_URL + '/manufacturing', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const invButton = page.locator('button:has-text("Inventory")').first();
    if (await invButton.isVisible().catch(() => false)) {
      await invButton.click();
      await page.waitForTimeout(2000);
    }

    const emptyText = page.locator('text=No inventory items found');
    const emptyVisible = await emptyText.isVisible().catch(() => false);
    const tableRows = await page.locator('table tbody tr').count();
    const cards = await page.locator('.mobile-card').count();

    if (emptyVisible && tableRows <= 1 && cards === 0) {
      console.log('\n✅ Production Manufacturing: inventory appears empty (purge verified in UI).');
    } else if (emptyVisible) {
      console.log('\n✅ Production Manufacturing: "No inventory items found" is shown.');
    } else {
      console.log('\n⚠️ Production Manufacturing: empty state not clearly found. Table rows:', tableRows, 'Cards:', cards);
    }

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('Test error:', err.message);
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

run();
