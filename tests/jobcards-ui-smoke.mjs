/**
 * Browser smoke: public job card page + authenticated Service & Maintenance (token injection).
 * Requires dev server: npm run dev:backend
 * Run: node tests/jobcards-ui-smoke.mjs
 * Env: E2E_BASE=http://127.0.0.1:3000 TEST_EMAIL=... TEST_PASSWORD=...
 */
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

const BASE = (process.env.E2E_BASE || process.env.TEST_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const EMAIL = process.env.TEST_EMAIL || '';
const PASSWORD = process.env.TEST_PASSWORD || '';

async function apiLogin() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) return null;
  const body = await res.json();
  const token = body.data?.accessToken ?? body.accessToken;
  const user = body.data?.user ?? body.user;
  if (!token) return null;
  return { token, user: user || {} };
}

function badConsole(msgs) {
  return msgs.filter(
    (e) =>
      !e.includes('favicon') &&
      !e.includes('ResizeObserver') &&
      !e.includes('Failed to load resource') &&
      !e.includes('net::ERR_')
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const consoleErrors = [];
  const pageErrors = [];

  let exitCode = 0;

  try {
    // --- Public job card wizard ---
    const page1 = await browser.newPage();
    page1.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page1.on('pageerror', (err) => pageErrors.push(err.message));

    await page1.goto(`${BASE}/job-card`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page1.waitForFunction(() => typeof window.React !== 'undefined', null, { timeout: 45000 });
    await page1.waitForFunction(() => typeof window.JobCardFormPublic === 'function', null, { timeout: 60000 });
    console.log('OK /job-card: window.JobCardFormPublic registered');

    const calNoTok = await page1.evaluate(async (origin) => {
      const r = await fetch(`${origin}/api/public/jobcards-calendar.ics`, { method: 'GET' });
      return r.status;
    }, BASE);
    if (calNoTok === 401) {
      console.log('OK GET /api/public/jobcards-calendar.ics without token: 401 (expected)');
    } else {
      console.log('WARN calendar without token status', calNoTok);
    }

    await page1.close();

    // --- Authenticated Service & Maintenance (token in localStorage, same as authStorage) ---
    if (!EMAIL || !PASSWORD) {
      console.log('SKIP authenticated UI (set TEST_EMAIL and TEST_PASSWORD)');
    } else {
      const session = await apiLogin();
      if (!session) {
        console.log('WARN login failed – skip Service & Maintenance browser checks');
        exitCode = 1;
      } else {
        const { token, user } = session;
        const context = await browser.newContext();
        await context.addInitScript(
          ([tok, usrJson]) => {
            try {
              localStorage.setItem('abcotronics_token', tok);
              localStorage.setItem('abcotronics_user', usrJson);
            } catch (e) {
              console.error(e);
            }
          },
          [token, JSON.stringify(user)]
        );

        const page = await context.newPage();
        page.on('console', (msg) => {
          if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        page.on('pageerror', (err) => pageErrors.push(err.message));

        await page.goto(`${BASE}/service-maintenance`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForFunction(() => typeof window.React !== 'undefined', null, { timeout: 60000 });
        await page.waitForFunction(
          () => typeof window.ServiceAndMaintenance === 'function' && typeof window.JobCards === 'function',
          null,
          { timeout: 120000 }
        );
        console.log('OK /service-maintenance: ServiceAndMaintenance + JobCards registered');

        await page.waitForFunction(
          () =>
            typeof window.JobCards?.openNewJobCardModal === 'function' &&
            typeof window.JobCards?.openEditJobCardModal === 'function',
          null,
          { timeout: 60000 }
        );

        const jobCardsApi = await page.evaluate(() => ({
          hasOpenNew: typeof window.JobCards?.openNewJobCardModal === 'function',
          hasOpenEdit: typeof window.JobCards?.openEditJobCardModal === 'function',
        }));
        if (jobCardsApi.hasOpenNew && jobCardsApi.hasOpenEdit) {
          console.log('OK window.JobCards.openNewJobCardModal / openEditJobCardModal');
        } else {
          console.log('WARN JobCards global API', jobCardsApi);
        }

        const calOk = await page.evaluate(async ({ origin, tok }) => {
          const r = await fetch(`${origin}/api/public/jobcards-calendar.ics?token=${encodeURIComponent(tok)}`);
          return r.status;
        }, { origin: BASE, tok: token });
        if (calOk === 200) {
          console.log('OK GET /api/public/jobcards-calendar.ics?token= — 200');
        } else {
          console.log('WARN calendar with token status', calOk);
          exitCode = 1;
        }

        await page.waitForTimeout(1500);
        const hasOnlineOffline = await page.evaluate(() => {
          const t = document.body?.innerText || '';
          return t.includes('Online') || t.includes('Offline');
        });
        if (!hasOnlineOffline) {
          console.log('WARN: Online/Offline indicator text not found (may still be loading)');
        } else {
          console.log('OK Online/Offline status text visible');
        }

        await context.close();
      }
    }

    const bad = badConsole(consoleErrors);
    if (pageErrors.length) {
      console.log('Page errors:', pageErrors);
      exitCode = 1;
    }
    if (bad.length) {
      console.log('Console errors:', bad);
      exitCode = 1;
    }
  } finally {
    await browser.close();
  }

  process.exit(exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
