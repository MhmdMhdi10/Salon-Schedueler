import axe from 'axe-core';
import { expect, test, type Page } from '@playwright/test';
import { loginViaUi, uniquePhone } from './fixtures';

test.describe.configure({ timeout: 120_000 });

const PUBLIC_ROUTES = [
  '/',
  '/business/register',
  '/s/salon-rose',
  '/salon/11111111-1111-1111-1111-111111111111/book',
  '/booking/success',
  '/auth',
  '/account',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/my-salons',
  '/qr/not-a-valid-qr',
  '/not-found',
] as const;

const OWNER_ROUTES = [
  '/owner/calendar',
  '/owner/calendar/working-hours',
  '/owner/analytics',
  '/owner/config',
  '/owner/subscription',
  '/owner/transactions',
  '/owner/notifications',
  '/owner/qr',
  '/owner/my-qr',
] as const;

type AxeViolation = {
  id: string;
  help: string;
  nodes: Array<{ target: string[] }>;
};

async function waitForSurface(page: Page): Promise<void> {
  await expect(page.locator('#app-boot-loader')).toHaveCount(0);
  await expect(page.getByTestId('route-loader')).toHaveCount(0);
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page).toHaveTitle(/.+/);
}

async function runAxe(page: Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ content: axe.source });
  return page.evaluate(async () => {
    const result = await (window as unknown as {
      axe: { run: (context: Document, options: unknown) => Promise<{ violations: AxeViolation[] }> };
    }).axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    return result.violations;
  });
}

async function assertUx(page: Page, route: string): Promise<void> {
  await waitForSurface(page);

  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(metrics.scrollWidth, `horizontal overflow on ${route}`).toBeLessThanOrEqual(
    metrics.clientWidth + 1,
  );

  const unnamedControls = await page.locator('button, a, input, select, textarea').evaluateAll(
    (elements) =>
      elements
        .filter((element) => {
          const style = window.getComputedStyle(element);
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            !element.classList.contains('sr-only') &&
            element.getAttribute('aria-hidden') !== 'true' &&
            element.getClientRects().length > 0
          );
        })
        .filter((element) => {
          const input = element as HTMLInputElement;
          const labelledBy = element.getAttribute('aria-labelledby');
          const labelText = labelledBy
            ? labelledBy
                .split(/\s+/)
                .map((id) => document.getElementById(id)?.textContent ?? '')
                .join(' ')
            : '';
          const name =
            element.getAttribute('aria-label') ||
            labelText ||
            input.labels?.[0]?.textContent ||
            element.textContent ||
            input.placeholder ||
            element.getAttribute('title') ||
            '';
          return !name.trim();
        })
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          html: element.outerHTML.slice(0, 180),
        })),
  );
  expect(unnamedControls, `unnamed interactive controls on ${route}`).toEqual([]);

  const undersizedControls = await page.locator('button, a, input, select, textarea').evaluateAll(
    (elements) =>
      elements
        .filter((element) => {
          const style = window.getComputedStyle(element);
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            !element.classList.contains('sr-only') &&
            element.getAttribute('aria-hidden') !== 'true' &&
            element.getClientRects().length > 0
          );
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const after = getComputedStyle(element, '::after');
          const left = Number.parseFloat(after.left);
          const right = Number.parseFloat(after.right);
          const top = Number.parseFloat(after.top);
          const bottom = Number.parseFloat(after.bottom);
          const extraWidth = Number.isFinite(left) && left < 0 ? -left : 0;
          const extraRight = Number.isFinite(right) && right < 0 ? -right : 0;
          const extraTop = Number.isFinite(top) && top < 0 ? -top : 0;
          const extraBottom = Number.isFinite(bottom) && bottom < 0 ? -bottom : 0;
          return {
            tag: element.tagName.toLowerCase(),
            width: Math.round(rect.width + extraWidth + extraRight),
            height: Math.round(rect.height + extraTop + extraBottom),
            html: element.outerHTML.slice(0, 180),
          };
        })
        .filter(({ width, height }) => width < 40 || height < 40),
  );
  if (metrics.viewportWidth < 768) {
    expect(undersizedControls, `small touch targets on ${route}`).toEqual([]);
  }

  const violations = await runAxe(page);
  expect(
    violations.map(({ id, help, nodes }) => ({ id, help, targets: nodes.map((node) => node.target) })),
    `axe violations on ${route}`,
  ).toEqual([]);
}

for (const route of PUBLIC_ROUTES) {
  test(`public UX contract: ${route}`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(route, { waitUntil: 'domcontentloaded' });

    // `/account` is private; the unauthenticated contract is the login redirect.
    if (route === '/account') {
      await expect(page).toHaveURL(/\/auth(?:\?|$)/);
      return;
    }

    await assertUx(page, route);
    expect(pageErrors, `runtime error on ${route}`).toEqual([]);
  });
}

test('customer dashboard UX contract after authentication', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await loginViaUi(page, uniquePhone('5'), /\/account(?:\?|$)/);
  await assertUx(page, '/account');
  expect(pageErrors).toEqual([]);
});

test('owner panel UX contract across every section', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await loginViaUi(page, '09120000001', /\/owner(?:\/calendar)?(?:\?|$)/);

  for (const route of OWNER_ROUTES) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await assertUx(page, route);
  }

  const width = page.viewportSize()?.width ?? 0;
  if (width < 1024) {
    const nav = page.getByTestId('owner-bottom-tabs');
    await expect(nav).toBeVisible();
    const box = await nav.boundingBox();
    expect(box?.height ?? 0, 'mobile bottom nav touch height').toBeGreaterThanOrEqual(64);
  } else {
    await expect(page.getByLabel('ناوبری پنل مدیریت')).toBeVisible();
  }
  expect(pageErrors).toEqual([]);
});

test('critical owner surfaces remain usable at compact 320px width', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, 'mobile viewport project only');
  await page.setViewportSize({ width: 320, height: 844 });
  await loginViaUi(page, '09120000001', /\/owner(?:\/calendar)?(?:\?|$)/);
  for (const route of ['/owner/calendar', '/owner/qr'] as const) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await assertUx(page, route);
  }
});

test('legacy routes redirect to their supported destination', async ({ page }) => {
  const redirects: Array<[string, RegExp]> = [
    ['/business', /\/$/],
    ['/city/tehran', /\/$/],
    ['/services/hair', /\/$/],
    ['/search', /\/$/],
    ['/admin/config', /\/auth(?:\?|$)/],
  ];
  for (const [route, destination] of redirects) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(destination);
  }
});
