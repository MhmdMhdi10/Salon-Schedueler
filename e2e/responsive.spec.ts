import { expect, test, type Page } from '@playwright/test';
import { loginViaUi, SEED_SALON_ID, SEED_SALON_SLUG } from './fixtures';

const PUBLIC_ROUTES = [
  '/',
  '/business/register',
  `/s/${SEED_SALON_SLUG}`,
  `/salon/${SEED_SALON_ID}/book`,
  '/auth',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/not-found',
] as const;

async function assertResponsivePage(page: Page) {
  // Measure the routed surface, not the short-lived Suspense skeleton. The
  // skeleton is intentionally transient and its shell width can briefly
  // change while the lazy chunk and scrollbar settle.
  await expect(page.getByTestId('route-loader')).toHaveCount(0);
  // The static pre-React boot screen also holds `overflow: hidden` until its
  // short branded transition completes. Measure the routed surface after it
  // is removed, otherwise a cold mobile navigation can report a false width.
  await expect(page.locator('#app-boot-loader')).toHaveCount(0);
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page).toHaveTitle(/.+/);

  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth, 'horizontal overflow detected').toBeLessThanOrEqual(
    metrics.clientWidth + 1,
  );
}

for (const route of PUBLIC_ROUTES) {
  test(`public route stays usable without horizontal overflow: ${route}`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await assertResponsivePage(page);
    expect(pageErrors, `runtime error on ${route}`).toEqual([]);
  });
}

test('owner panel navigation and primary surfaces fit current viewport', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await loginViaUi(page, '09120000001', /\/owner(?:\/calendar)?(?:\?|$)/);

  for (const route of ['/owner/calendar', '/owner/analytics', '/owner/config', '/owner/qr']) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('h1').first()).toBeVisible();
    const metrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(metrics.scrollWidth, `horizontal overflow on ${route}`).toBeLessThanOrEqual(
      metrics.clientWidth + 1,
    );
  }

  const width = page.viewportSize()?.width ?? 0;
  if (width < 1024) {
    const nav = page.getByTestId('owner-bottom-tabs');
    await expect(nav).toBeVisible();
    const box = await nav.boundingBox();
    expect(
      box?.height ?? 0,
      'mobile bottom nav should be comfortably tappable',
    ).toBeGreaterThanOrEqual(64);
    await expect(page.getByRole('link', { name: 'تقویم' })).toBeVisible();
  } else {
    await expect(page.getByLabel('ناوبری پنل مدیریت')).toBeVisible();
  }
  expect(pageErrors).toEqual([]);
});

test('platform admin mobile drawer navigates and stays within viewport', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 1024, 'mobile-only platform shell check');
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await loginViaUi(page, '09120000999', /\/platform-admin(?:\?|$)/);
  await page.goto('/platform-admin', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

  await page.getByRole('button', { name: 'باز کردن منوی مدیریت' }).click();
  const drawer = page.getByRole('dialog', { name: 'منوی مدیریت' });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('menuitem', { name: 'عملیات کسب‌وکار' }).click();
  await drawer.getByText('سالن‌ها', { exact: true }).click();
  await expect(page).toHaveURL(/\/platform-admin\/salons(?:\?|$)/);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(pageErrors).toEqual([]);
});
