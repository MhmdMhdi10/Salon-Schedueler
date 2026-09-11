import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.GUIDE_BASE_URL ?? 'http://localhost:5273';
// Keep API and page traffic on one host so refresh cookies are shared
// reliably during long screenshot runs. Playwright's API client can resolve
// `localhost` through a different address than the browser.
const browserBaseUrl = (() => {
  const url = new URL(baseUrl);
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  return url.toString().replace(/\/$/, '');
})();
const outputRoot = join(process.cwd(), 'docs', 'guide-screenshots');

const ownerRoutes = [
  '/owner/calendar',
  '/owner/calendar/working-hours',
  '/owner/team',
  '/owner/clients',
  '/owner/marketing',
  '/owner/analytics',
  '/owner/qr',
  '/owner/config',
  '/owner/services',
  '/owner/transactions',
  '/owner/notifications',
  '/owner/subscription',
  '/owner/profile',
];

const ownerGuideIds = [
  'owner-team',
  'owner-services',
  'owner-profile',
  'owner-calendar',
  'owner-clients',
  'owner-marketing',
  'owner-analytics',
  'owner-qr',
  'owner-configuration',
  'owner-transactions',
  'owner-notifications',
  'owner-subscription',
];

const platformRoutes = [
  '/platform-admin',
  '/platform-admin/salons',
  '/platform-admin/appointments',
  '/platform-admin/waitlist',
  '/platform-admin/qr-scans',
  '/platform-admin/customers',
  '/platform-admin/staff',
  '/platform-admin/subscriptions',
  '/platform-admin/payments',
  '/platform-admin/audit-logs',
];

const platformGuideIds = platformRoutes.map((route) =>
  route === '/platform-admin'
    ? 'platform-admin-dashboard'
    : `platform-admin-${route.split('/').at(-1)}`,
);

const viewports = [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 390, height: 844 }],
];

function slug(route) {
  return route === '/' ? 'home' : route.replace(/^\//, '').replaceAll('/', '-');
}

function ensureDirectory(path) {
  mkdirSync(path, { recursive: true });
}

async function waitForSurface(page) {
  const bootLoader = page.locator('#app-boot-loader');
  if (await bootLoader.count()) {
    await bootLoader.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  }
  const routeLoader = page.getByTestId('route-loader');
  if (await routeLoader.count()) {
    await routeLoader.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  }
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(650);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const main = document.querySelector('main');
    if (main instanceof HTMLElement) main.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  });
  await page.waitForTimeout(100);
}

async function clearBrowserState(page) {
  await page.goto(`${browserBaseUrl}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

async function login(page, phone, expectedPath) {
  await clearBrowserState(page);
  await page.goto(`${browserBaseUrl}/auth`, { waitUntil: 'domcontentloaded' });
  const alreadyAuthenticated = await page
    .waitForURL((url) => url.pathname.startsWith(expectedPath), { timeout: 2_500 })
    .then(() => true)
    .catch(() => false);
  if (alreadyAuthenticated) {
    await waitForSurface(page);
    return;
  }
  await page.getByLabel('شماره موبایل').fill(phone);
  await page.getByRole('button', { name: 'دریافت کد', exact: true }).click();
  const otpInput = page.locator('input[aria-label*="کد تایید"]').first();
  const nextSurface = await Promise.race([
    page
      .waitForURL((url) => url.pathname.startsWith(expectedPath), { timeout: 20_000 })
      .then(() => 'route')
      .catch(() => null),
    otpInput
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => 'otp')
      .catch(() => null),
  ]);
  if (nextSurface === 'otp') {
    // OTP may submit automatically after the last digit. Older test fixtures
    // still expose an explicit confirmation button, so support both flows.
    const confirmButton = page.getByRole('button', { name: /تایید و ورود/ });
    if (await confirmButton.count()) await confirmButton.click();
    await page.waitForURL((url) => url.pathname.startsWith(expectedPath), { timeout: 20_000 });
  }
  if (nextSurface !== 'route' && nextSurface !== 'otp') {
    throw new Error(`Login did not reach ${expectedPath} or show OTP for ${phone}`);
  }
  await waitForSurface(page);
  await page
    .getByRole('button', { name: 'بستن', exact: true })
    .click()
    .catch(() => {});
}

async function waitForAuthenticatedRoute(page, expectedPath, timeout = 8_000) {
  if (new URL(page.url()).pathname.startsWith(expectedPath)) return true;
  return page
    .waitForURL((url) => url.pathname.startsWith(expectedPath), { timeout })
    .then(() => true)
    .catch(() => false);
}

async function openAuthenticatedRoute(context, page, route, phone, expectedPath) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await loginByApi(context, phone);
    await page.goto(`${browserBaseUrl}${route}`, { waitUntil: 'domcontentloaded' });
    await waitForSurface(page);

    if (new URL(page.url()).pathname.startsWith(expectedPath)) return;
    if (new URL(page.url()).pathname === '/auth') {
      const recovered = await waitForAuthenticatedRoute(page, expectedPath);
      if (recovered) {
        await waitForSurface(page);
        if (new URL(page.url()).pathname.startsWith(expectedPath)) return;
      }
    }
  }
  throw new Error(`Authenticated context redirected to /auth while opening ${route}`);
}

async function loginByApi(context, phone) {
  const otpResponse = await context.request.post(`${browserBaseUrl}/api/auth/otp/request`, {
    data: { phone },
    timeout: 10_000,
  });
  if (!otpResponse.ok()) {
    throw new Error(
      `OTP request failed for ${phone}: ${otpResponse.status()} ${await otpResponse.text()}`,
    );
  }
  const otp = await otpResponse.json();
  if (typeof otp.devOtp !== 'string' || otp.devOtp.length === 0) {
    throw new Error(`OTP request did not expose a development code for ${phone}`);
  }

  const verifyResponse = await context.request.post(`${browserBaseUrl}/api/auth/otp/verify`, {
    data: { phone, code: otp.devOtp },
    timeout: 10_000,
  });
  if (!verifyResponse.ok()) {
    throw new Error(
      `OTP verification failed for ${phone}: ${verifyResponse.status()} ${await verifyResponse.text()}`,
    );
  }
}

async function closeGuide(page) {
  const close = page.getByTestId('panel-guide-close');
  if (await close.isVisible().catch(() => false)) {
    await close.click();
    await page
      .getByTestId('panel-guide-dialog')
      .waitFor({ state: 'detached', timeout: 5_000 })
      .catch(() => {});
  }
}

async function captureGuideWalkthrough(page, surface, viewport, guideIds) {
  const guideDirectory = join(outputRoot, surface, viewport, 'guide');
  ensureDirectory(guideDirectory);

  for (let index = 0; index < guideIds.length; index += 1) {
    const guideId = guideIds[index];
    console.log(`${surface}/${viewport} guide ${index + 1}/${guideIds.length}: ${guideId}`);
    try {
      await page.waitForFunction(
        (expected) =>
          document
            .querySelector('[data-panel-guide-active="true"]')
            ?.getAttribute('data-panel-guide') === expected,
        guideId,
        { timeout: 20_000 },
      );
    } catch (error) {
      const actual = await page
        .locator('[data-panel-guide-active="true"]')
        .getAttribute('data-panel-guide')
        .catch(() => null);
      throw new Error(
        `Guide target ${guideId} was not reached; actual=${actual}; url=${page.url()}`,
        { cause: error },
      );
    }
    await page.waitForTimeout(500);
    await page.screenshot({
      path: join(guideDirectory, `${String(index + 1).padStart(2, '0')}-${guideId}.png`),
      animations: 'disabled',
    });

    if (index === guideIds.length - 1) {
      await closeGuide(page);
    } else {
      await page.getByTestId('panel-guide-next').click();
    }
  }
}

async function captureRoutes(
  browser,
  surface,
  viewportName,
  viewport,
  routes,
  phone,
  expectedPath,
) {
  const pageDirectory = join(outputRoot, surface, viewportName, 'pages');
  ensureDirectory(pageDirectory);

  for (const route of routes) {
    console.log(`${surface}/${viewportName} page: ${route}`);
    const context = await browser.newContext({
      viewport,
      locale: 'fa-IR',
      timezoneId: 'Asia/Tehran',
      colorScheme: 'light',
    });
    const page = await context.newPage();
    try {
      // Authenticate inside this exact context. This keeps the HttpOnly
      // refresh cookie available to the browser page.
      await openAuthenticatedRoute(context, page, route, phone, expectedPath);
      // Page captures document the surface itself; the guide has its own
      // complete capture set above.
      await closeGuide(page);
      // A fresh context may auto-open the first-run guide. Closing it records
      // the decision, but the walkthrough may have moved to its first route;
      // return to the route under test before taking the page screenshot.
      if (new URL(page.url()).pathname !== route) {
        await page.goto(`${browserBaseUrl}${route}`, { waitUntil: 'domcontentloaded' });
        await waitForSurface(page);
      }
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        const main = document.querySelector('main');
        if (main instanceof HTMLElement) main.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      });
      await page.screenshot({
        path: join(pageDirectory, `${slug(route)}.png`),
        animations: 'disabled',
      });
    } finally {
      await context.close();
    }
  }
}

async function captureOwner(browser, viewportName, viewport) {
  const context = await browser.newContext({
    viewport,
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    colorScheme: 'light',
  });
  const page = await context.newPage();
  await login(page, '09120000001', '/owner');
  await captureGuideWalkthrough(page, 'owner', viewportName, ownerGuideIds);
  await captureRoutes(
    browser,
    'owner',
    viewportName,
    viewport,
    ownerRoutes,
    '09120000001',
    '/owner',
  );
  await context.close();
}

async function capturePlatform(browser, viewportName, viewport) {
  const context = await browser.newContext({
    viewport,
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    colorScheme: 'light',
  });
  const page = await context.newPage();
  await login(page, '09120000999', '/platform-admin');
  await captureGuideWalkthrough(page, 'platform-admin', viewportName, platformGuideIds);
  await captureRoutes(
    browser,
    'platform-admin',
    viewportName,
    viewport,
    platformRoutes,
    '09120000999',
    '/platform-admin',
  );
  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  for (const [viewportName, viewport] of viewports) {
    await captureOwner(browser, viewportName, viewport);
    await capturePlatform(browser, viewportName, viewport);
  }
  console.log(`Panel guide screenshots written to ${outputRoot}`);
} finally {
  await browser.close();
}
