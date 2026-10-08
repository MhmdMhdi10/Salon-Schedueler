import axe from 'axe-core';
import { expect, test, type Page } from '@playwright/test';
import { loginViaUi, uniquePhone } from './fixtures';

test.describe.configure({ timeout: 120_000 });

test.beforeEach(async ({ page }) => {
  const theme = process.env.E2E_THEME;
  if (theme !== 'light' && theme !== 'dark') return;
  await page.addInitScript((value) => {
    try {
      window.localStorage.setItem('salon-theme', value);
    } catch {
      // The initial about:blank document may not expose storage.
    }
  }, theme);
});

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
  '/owner/support',
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
] as const;

const PLATFORM_ADMIN_ROUTES = [
  '/platform-admin',
  '/platform-admin/details',
  '/platform-admin/salons',
  '/platform-admin/customers',
  '/platform-admin/staff',
  '/platform-admin/platform-admins',
  '/platform-admin/services',
  '/platform-admin/chairs',
  '/platform-admin/equipment',
  '/platform-admin/appointments',
  '/platform-admin/subscriptions',
  '/platform-admin/payments',
  '/platform-admin/waitlist',
  '/platform-admin/qr-scans',
  '/platform-admin/audit-logs',
  '/platform-admin/card-orders',
  '/platform-admin/support',
] as const;

type AxeViolation = {
  id: string;
  help: string;
  nodes: Array<{ target: string[] }>;
};

async function waitForSurface(page: Page): Promise<void> {
  await expect(page.locator('#app-boot-loader')).toHaveCount(0);
  const expectedTheme = process.env.E2E_THEME;
  if (expectedTheme === 'light' || expectedTheme === 'dark') {
    await expect(page.locator('html')).toHaveAttribute('data-theme', expectedTheme);
  }
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
  for (const route of [
    '/account',
    '/support',
    '/salon/11111111-1111-1111-1111-111111111111/waitlist',
    '/my-salons',
  ]) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await assertUx(page, route);
  }

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/account', { waitUntil: 'domcontentloaded' });
    await assertUx(page, `/account at ${width}px`);

    const registerLink = page.getByRole('banner').getByRole('link', { name: 'ثبت سالن' });
    await expect(registerLink).toBeVisible();
    if (width < 360) {
      await expect(registerLink.locator('span')).toBeHidden();
    } else {
      await expect(registerLink.locator('span')).toBeVisible();
    }
  }
  expect(pageErrors).toEqual([]);
});

test('customer notifications stay in the header on the mobile support page', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, 'mobile viewport project only');
  await loginViaUi(page, uniquePhone('5'), /\/account(?:\?|$)/);
  for (const viewportWidth of [390, 320]) {
    await page.setViewportSize({ width: viewportWidth, height: 844 });
    await page.goto('/support', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('support-page')).toBeVisible();
    await expect(page.getByTestId('route-progress')).toHaveCount(0);
    await expect(page.locator('.animate-page-enter')).toHaveCount(0);

    const bell = page.getByRole('banner').getByRole('button', {
      name: 'اعلان‌های حساب کاربری',
      exact: true,
    });
    await expect(bell).toBeVisible();
    const box = await bell.boundingBox();
    expect(box, 'notification bell has a visible touch target').not.toBeNull();
    expect(box!.x, 'notification bell stays inside the mobile viewport').toBeGreaterThanOrEqual(0);
    expect(
      box!.x + box!.width,
      'notification bell stays inside the mobile viewport',
    ).toBeLessThanOrEqual(viewportWidth);
  }
});

test('owner panel UX contract across every section', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await loginViaUi(page, '09120000001', /\/owner(?:\/calendar)?(?:\?|$)/);

  for (const route of OWNER_ROUTES) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await assertUx(page, route);
    if (route === '/owner/marketing') {
      const qr = page.getByTestId('owner-marketing-qr');
      await expect(qr).toBeVisible();
      const qrBox = await qr.boundingBox();
      expect(qrBox, 'booking QR is large and visible').not.toBeNull();
      expect(qrBox!.width, 'booking QR width').toBeGreaterThanOrEqual(220);
      expect(qrBox!.height, 'booking QR height').toBeGreaterThanOrEqual(220);
      if ((page.viewportSize()?.width ?? 0) < 768) {
        const headingBox = await page.getByRole('heading', { name: 'بازاریابی' }).boundingBox();
        expect(headingBox, 'marketing heading follows QR').not.toBeNull();
        expect(qrBox!.y, 'large QR appears before the page heading on mobile').toBeLessThan(
          headingBox!.y,
        );
      }
    }
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

test('platform admin UX contract across every section', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await loginViaUi(page, '09120000999', /\/platform-admin(?:\?|$)/);

  for (const route of PLATFORM_ADMIN_ROUTES) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await assertUx(page, route);
    if (route === '/platform-admin/salons') {
      const tableHint = page.getByRole('note', { name: 'راهنمای پیمایش جدول' });
      await expect(page.locator('.platform-admin-table-name strong').first()).toHaveAttribute('dir', 'auto');
      if ((page.viewportSize()?.width ?? 0) < 768) {
        await expect(tableHint).toBeVisible();
      } else {
        await expect(tableHint).toBeHidden();
      }
    }
    if (route === '/platform-admin/card-orders') {
      await expect(page.getByRole('region', { name: 'جدول سفارش کارت چاپی' })).toHaveAttribute(
        'tabindex',
        '0',
      );
    }
  }

  const width = page.viewportSize()?.width ?? 0;
  if (width < 1024) {
    await expect(page.getByRole('button', { name: 'باز کردن منوی مدیریت' })).toBeVisible();
    if (width > 320) {
      await page.setViewportSize({ width: 320, height: 844 });
      for (const route of ['/platform-admin', '/platform-admin/salons'] as const) {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await assertUx(page, route);
      }
    }
  }

  expect(pageErrors).toEqual([]);
});

test('platform admin header remains fixed while scrolling on mobile', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, 'mobile viewport project only');
  await loginViaUi(page, '09120000999', /\/platform-admin(?:\?|$)/);
  for (const width of [520, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/platform-admin', { waitUntil: 'domcontentloaded' });

    const header = page.locator('.platform-admin-root .ant-layout-header');
    await expect(header).toBeVisible();
    const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(documentHeight).toBeGreaterThan(page.viewportSize()?.height ?? 0);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(async () => (await header.boundingBox())?.y).toBe(0);
  }
});

test('critical owner surfaces remain usable at compact 320px width', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, 'mobile viewport project only');
  await page.setViewportSize({ width: 320, height: 844 });
  await loginViaUi(page, '09120000001', /\/owner(?:\/calendar)?(?:\?|$)/);
  for (const route of [
    '/owner/calendar',
    '/owner/calendar/working-hours',
    '/owner/qr',
    '/owner/support',
  ] as const) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    if (route === '/owner/calendar') {
      const manage = page.getByTestId('owner-calendar-mobile-manage');
      const manageToggle = manage.getByTestId('owner-calendar-mobile-manage-toggle');
      await expect(manageToggle).toHaveAccessibleName(/مدیریت ساعت و تعطیلی برای/);
      await expect(manageToggle).toBeInViewport();
      const collapsedManageBox = await manage.boundingBox();
      expect(collapsedManageBox, 'collapsed day controls have a visible box').not.toBeNull();
      expect(collapsedManageBox!.height, 'collapsed day controls stay compact').toBeLessThan(130);

      const bottomNavBox = await page.getByTestId('owner-bottom-tabs').boundingBox();
      expect(bottomNavBox, 'mobile navigation has a visible box').not.toBeNull();
      expect(
        collapsedManageBox!.y + collapsedManageBox!.height,
        'collapsed day controls clear the fixed bottom navigation',
      ).toBeLessThanOrEqual(bottomNavBox!.y);

      await manageToggle.click();
      await expect(manageToggle).toHaveAttribute('aria-expanded', 'true');
      await expect(
        manage.getByRole('button', { name: /تغییر ساعت کاری هفتگی برای همه‌ی/ }),
      ).toBeVisible();
      await expect(
        manage.getByRole('button', { name: /تعطیلی کامل یا بستن بخشی از ساعت فقط برای/ }),
      ).toBeVisible();
    }
    if (route === '/owner/calendar/working-hours') {
      const settings = page.getByRole('region', { name: 'تنظیمات اصلی' });
      const selects = settings.getByRole('combobox');
      await expect(selects).toHaveCount(3);
      const firstSelect = await selects.nth(0).boundingBox();
      const secondSelect = await selects.nth(1).boundingBox();
      expect(firstSelect, 'first schedule setting is visible').not.toBeNull();
      expect(secondSelect, 'second schedule setting is visible').not.toBeNull();
      expect(secondSelect!.y).toBeGreaterThanOrEqual(firstSelect!.y + firstSelect!.height);
      await expect(page.getByRole('button', { name: 'همین ساعت برای همه روزها' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'پنجشنبه و جمعه تعطیل' })).toHaveCount(0);
    }
    if (route === '/owner/support') {
      const bell = page.getByRole('banner').getByRole('button', {
        name: 'اعلان‌ها',
        exact: true,
      });
      await expect(bell).toBeVisible();
      const box = await bell.boundingBox();
      expect(box, 'owner notification bell has a visible touch target').not.toBeNull();
      expect(
        box!.x,
        'owner notification bell stays inside the mobile viewport',
      ).toBeGreaterThanOrEqual(0);
      expect(
        box!.x + box!.width,
        'owner notification bell stays inside the mobile viewport',
      ).toBeLessThanOrEqual(320);
    }
    await assertUx(page, route);
    await expect(page.getByTestId('route-progress')).toHaveCount(0);
    await expect(page.locator('.animate-page-enter')).toHaveCount(0);
  }
});

test('legacy and discovery routes resolve to their supported destination', async ({ page }) => {
  const redirects: Array<[string, RegExp]> = [
    ['/business', /\/$/],
    ['/city/tehran', /\/city\/tehran(?:\?|$)/],
    ['/services/hair', /\/services\/hair(?:\?|$)/],
    ['/search', /\/search(?:\?|$)/],
    ['/admin/config', /\/auth(?:\?|$)/],
  ];
  for (const [route, destination] of redirects) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(destination);
  }
});
