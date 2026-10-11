// dentÁl árlista — Playwright-tesztek. Futtatás: npm test (részletek: tests/README.md).
// Minden teszt 6 változatban fut: Chromium és WebKit × 375×812, 360×740 (mobil) és 1280×800 (asztali).
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT || 4173);
const NEZETEK = [
  { nev: '375', viewport: { width: 375, height: 812 }, mobil: true },
  { nev: '360', viewport: { width: 360, height: 740 }, mobil: true },
  { nev: 'asztal', viewport: { width: 1280, height: 800 }, mobil: false }
];
const UA = { chromium: devices['Pixel 7'].userAgent, webkit: devices['iPhone 13'].userAgent };

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/kimenet/**'],
  outputDir: process.env.PW_KIMENET || 'test-results',
  globalSetup: './tests/globalis-elokeszites.js',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.PW_SZALAK ? Number(process.env.PW_SZALAK) : 6,
  reporter: [['list'], ['html', { open: 'never', outputFolder: process.env.PW_JELENTES || 'playwright-report' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'hu-HU',
    timezoneId: 'Europe/Budapest',
    serviceWorkers: 'block',
    acceptDownloads: true,
    trace: 'retain-on-failure'
  },
  projects: ['chromium', 'webkit'].flatMap(motor => NEZETEK.map(n => ({
    name: `${motor}-${n.nev}`,
    use: {
      browserName: motor,
      viewport: n.viewport,
      isMobile: n.mobil,
      hasTouch: n.mobil,
      deviceScaleFactor: n.mobil ? 2 : 1,
      ...(n.mobil ? { userAgent: UA[motor] } : {})
    }
  }))),
  webServer: {
    command: `node tests/szerver.js ${PORT}`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: true,
    timeout: 20_000
  }
});
