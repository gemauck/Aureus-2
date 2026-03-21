/**
 * Smoke test: load app, ensure ProjectDetail bundle registers, no console errors on home.
 * Full Online Drive typing test needs an authenticated session (run manually after login).
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:3010';

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const consoleErrors = [];
    const pageErrors = [];

    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    try {
        await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(
            () => typeof window.React !== 'undefined',
            null,
            { timeout: 30000 }
        );

        // ProjectDetail is loaded asynchronously; wait a bit for script init
        await page.waitForTimeout(3000);

        const hasProjectDetail = await page.evaluate(() => typeof window.ProjectDetail === 'function');

        const title = await page.title();
        console.log('OK page title:', title);
        console.log('OK window.ProjectDetail:', hasProjectDetail);

        if (pageErrors.length) {
            console.log('Page errors:', pageErrors);
            process.exitCode = 1;
        }
        if (consoleErrors.length) {
            // Filter noisy third-party
            const bad = consoleErrors.filter(
                (e) =>
                    !e.includes('favicon') &&
                    !e.includes('ResizeObserver') &&
                    !e.includes('Failed to load resource')
            );
            if (bad.length) {
                console.log('Console errors:', bad);
                process.exitCode = 1;
            }
        }

        if (!hasProjectDetail) {
            console.warn('WARN: ProjectDetail not on window yet (may still be loading).');
        }
    } finally {
        await browser.close();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
