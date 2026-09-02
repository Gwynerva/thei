import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const adminState = fileURLToPath(
  new URL('./.artifacts/admin.json', import.meta.url),
);

test('life confirms reading and preserves date navigation through browser history', async ({
  page,
}) => {
  await page.goto('/life/2026/07/01/');
  await page.bringToFront();
  await expect(page).toHaveURL(/\/life\/2026\/07\/01\/$/);
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          localStorage.getItem('thei:life:last-viewed-date:v1'),
        ),
      { timeout: 7000 },
    )
    .toBe('2026-07-01');
  await page
    .locator('[data-life-period-tracker]')
    .getByRole('link', { name: 'Month July' })
    .click();
  await expect(page.locator('[data-life-key]').first()).toBeAttached();
  await page.waitForTimeout(300);
  await page.goBack();
  await expect(page).toHaveURL(/\/life\/2026\/07\/01\/$/);
  await page.goForward();
  await expect(page.locator('[data-life-period-tracker]')).toContainText(
    'July',
  );
  await page.goto('/life/');
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          localStorage.getItem('thei:life:last-viewed-date:v1'),
        ),
      { timeout: 7000 },
    )
    .toBe('2026-09-02');
});

test('Editor.js settles after structural operations and preserves semantic dirty state', async ({
  page,
}) => {
  await page.route('**/slow-image.svg', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="gray"/></svg>',
    });
  });
  await page.goto('/editor-regression');
  const state = page.locator('[data-ready]');
  await expect(state).toHaveAttribute('data-ready', 'true');
  const save = page.locator('[data-save]');
  await page.waitForTimeout(1600);
  await expect(save).toHaveText('Saved');
  await expect(state).toHaveAttribute('data-transitions', '');
  const before = await state.getAttribute('data-events');
  await page.getByRole('button', { name: 'Refresh decoration' }).click();
  await page.waitForTimeout(700);
  await expect(state).toHaveAttribute('data-events', before!);
  await page.getByRole('button', { name: 'Invalid move', exact: true }).click();
  await page.waitForTimeout(1200);
  await expect(save).toHaveText('Saved');
  await expect(state).toHaveAttribute('data-transitions', '');
  await page.getByRole('button', { name: 'Insert section' }).click();
  await expect(page.locator('[data-private-section-id="new"]')).toHaveCount(2);
  // Empty sections are intentionally absent from the stored content format.
  await expect(save).toHaveText('Saved');
  await page.keyboard.insertText('New private content');
  await expect(save).toHaveText('Save');
  await save.click();
  await page.waitForTimeout(1200);
  await expect(state).toHaveAttribute('data-transitions', '');
  await page.getByRole('button', { name: 'Delete section' }).click();
  await expect(page.locator('[data-private-section-id="new"]')).toHaveCount(0);
  await expect(save).toHaveText('Save');
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.waitForTimeout(600);
  await save.click();
  await page.getByRole('button', { name: 'Valid move', exact: true }).click();
  await expect(save).toHaveText('Save');
  await save.click();
  await page
    .locator('[data-id="p1"] [contenteditable]')
    .fill('Changed inside section');
  await expect(save).toHaveText('Save');
});

test('life cache evicts distant windows, preserves focus and reloads both directions', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const targets = new Set<Set<Element>>();
    const Observer = window.ResizeObserver;
    window.ResizeObserver = class extends Observer {
      observed = new Set<Element>();
      constructor(callback: ResizeObserverCallback) {
        super(callback);
        targets.add(this.observed);
      }
      observe(element: Element, options?: ResizeObserverOptions) {
        this.observed.add(element);
        super.observe(element, options);
      }
      unobserve(element: Element) {
        this.observed.delete(element);
        super.unobserve(element);
      }
      disconnect() {
        this.observed.clear();
        super.disconnect();
      }
    };
    (window as any).detachedLifeMeasurements = () =>
      [...targets]
        .flatMap((items) => [...items])
        .filter(
          (element) =>
            element.hasAttribute('data-life-key') && !element.isConnected,
        ).length;
  });
  const errors: string[] = [];
  const windowRequests = new Map<string, number>();
  page.on('request', (request) => {
    if (!request.url().includes('/api/life?cursor=')) return;
    windowRequests.set(
      request.url(),
      (windowRequests.get(request.url()) ?? 0) + 1,
    );
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/life/2026/07/01/');
  const cache = page.locator('[data-life-cached-windows]');
  await expect(cache).toBeVisible();
  const focused = page.locator('[data-life-key] a').first();
  await focused.focus();
  const focusKey = await page.evaluate(
    () =>
      document.activeElement?.closest<HTMLElement>('[data-life-key]')?.dataset
        .lifeKey,
  );
  expect(focusKey).toBeTruthy();
  for (let index = 0; index < 14; index++) {
    const before = Number(await cache.getAttribute('data-life-windows'));
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await expect
      .poll(async () => Number(await cache.getAttribute('data-life-windows')))
      .toBeGreaterThan(before);
    expect(
      Number(await cache.getAttribute('data-life-cached-windows')),
    ).toBeLessThanOrEqual(10);
    expect(await page.locator('[data-life-key]').count()).toBeLessThan(80);
  }
  expect(
    await page.evaluate(
      () =>
        document.activeElement?.closest<HTMLElement>('[data-life-key]')?.dataset
          .lifeKey,
    ),
  ).toBe(focusKey);
  await expect
    .poll(() => page.evaluate(() => (window as any).detachedLifeMeasurements()))
    .toBe(0);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, document.documentElement.scrollHeight * 0.2);
  });
  await expect
    .poll(() => [...windowRequests.values()].some((count) => count > 1))
    .toBe(true);
  for (let index = 0; index < 6; index++) {
    await page.evaluate(() => window.scrollBy(0, -window.innerHeight * 12));
    await page.waitForTimeout(300);
    expect(
      Number(await cache.getAttribute('data-life-cached-windows')),
    ).toBeLessThanOrEqual(10);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(
    page.locator('[data-life-key] .life-item').first(),
  ).toBeAttached();
  expect(errors).toEqual([]);
});

test('a failed life window offers retry and keeps the cursor', async ({
  page,
}) => {
  await page.goto('/life/2026/07/01/');
  await expect(page.locator('[data-life-key]').first()).toBeAttached();
  await page.waitForTimeout(300);
  const attempts: string[] = [];
  await page.route('**/api/life?**', async (route) => {
    if (!route.request().url().includes('cursor=')) return route.continue();
    attempts.push(route.request().url());
    if (attempts.length === 1)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"statusCode":503,"message":"Temporary failure"}',
      });
    else await route.continue();
  });
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  const retry = page.getByRole('button', { name: 'Try again', exact: true });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(retry).toHaveCount(0);
  expect(attempts.length).toBeGreaterThanOrEqual(2);
  expect(attempts[1]).toBe(attempts[0]);
});

test('SSR hydrates once, keeps missing resources as 404 and filters private content on the server', async ({
  page,
}) => {
  const warnings: string[] = [];
  const repeated: string[] = [];
  page.on('console', (message) => {
    if (/hydration/i.test(message.text())) warnings.push(message.text());
  });
  page.on('request', (request) => {
    if (request.url().includes('/api/pages/page-0'))
      repeated.push(request.url());
  });
  expect((await page.goto('/pages/page-0/'))!.status()).toBe(200);
  await expect(
    page.locator('h2').filter({ hasText: 'Public heading' }),
  ).toBeVisible();
  await expect(
    page.locator('h2').filter({ hasText: 'Private heading' }),
  ).toHaveCount(0);
  await expect(
    page.locator('h3').filter({ hasText: 'Section heading' }),
  ).toHaveCount(0);
  await page.waitForTimeout(700);
  expect(repeated).toEqual([]);
  expect(warnings).toEqual([]);
  expect((await page.goto('/tags/not-found/'))!.status()).toBe(404);
  expect((await page.goto('/pages/not-found/'))!.status()).toBe(404);
});

test('public lists reuse SSR data and a client API failure remains an API error', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (
      ['/api/life/latest', '/api/pages', '/api/projects', '/api/tags'].includes(
        path,
      )
    )
      requests.push(path);
  });
  for (const path of ['/', '/pages/', '/projects/', '/tags/']) {
    await page.goto(path);
    await page.waitForTimeout(250);
  }
  expect(requests).toEqual([]);
  await page.route('**/api/projects*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"statusCode":503,"message":"Temporary failure"}',
    }),
  );
  await page
    .getByRole('navigation', { name: 'Site navigation' })
    .getByRole('link', { name: 'Projects', exact: true })
    .click();
  await expect(page.getByText('503', { exact: true })).toBeVisible();
});

test.describe('administrator content and keyboard panels', () => {
  test.use({ storageState: adminState });
  test('creates and saves pages, projects, stages, sections and events on the fresh schema', async ({
    request,
    browserName,
  }) => {
    const content = {
      data: {
        blocks: [{ type: 'paragraph', data: { text: 'Persisted body' } }],
      },
    };
    const pageData = {
      title: 'Created page',
      summary: 'Summary',
      slug: `crud-${browserName}`,
      access: 'public',
      content,
    };
    const createdPage = await (
      await request.post('/api/admin/pages', { data: pageData })
    ).json();
    expect(createdPage.type, JSON.stringify(createdPage)).toBe('success');
    expect(
      await (
        await request.put(`/api/admin/pages/${createdPage.pageUuid}`, {
          data: { ...pageData, title: 'Saved page' },
        })
      ).json(),
    ).toMatchObject({ type: 'success' });
    expect(
      await (await request.get(`/api/pages/${pageData.slug}`)).json(),
    ).toMatchObject({ title: 'Saved page' });
    const child = {
      title: 'Child',
      summary: 'Summary',
      humanReadableSlug: 'child',
      isPrivate: false,
      content,
    };
    const projectData = {
      title: 'Created project',
      summary: 'Summary',
      access: 'public',
      humanReadableSlug: 'project',
      publicId: `project${browserName}`,
      showcase: false,
      cv: false,
      descriptionContent: content,
      contentSections: [
        { ...child, isStage: false, publicId: `section${browserName}` },
      ],
      stages: [
        {
          ...child,
          isStage: true,
          publicId: `stage${browserName}`,
          periods: [{ startDate: '2026-01-01', endDate: '2026-01-02' }],
        },
      ],
    };
    const createdProject = await (
      await request.post('/api/admin/projects', { data: projectData })
    ).json();
    expect(createdProject.type, JSON.stringify(createdProject)).toBe('success');
    const storedProject = await (
      await request.get(`/api/admin/projects/${createdProject.projectUuid}`)
    ).json();
    expect(storedProject.stages).toHaveLength(1);
    expect(storedProject.contentSections).toHaveLength(1);
    expect(
      await (
        await request.put(`/api/admin/projects/${createdProject.projectUuid}`, {
          data: {
            ...projectData,
            stages: storedProject.stages,
            contentSections: storedProject.contentSections,
            title: 'Saved project',
          },
        })
      ).json(),
    ).toMatchObject({ type: 'success' });
    const eventData = {
      title: 'Created event',
      summary: 'Summary',
      access: 'public',
      humanReadableSlug: 'event',
      publicId: `event${browserName}`,
      content,
      periods: [{ startDate: '2026-02-01', endDate: '2026-02-02' }],
    };
    const createdEvent = await (
      await request.post('/api/admin/events', { data: eventData })
    ).json();
    expect(createdEvent.type, JSON.stringify(createdEvent)).toBe('success');
    expect(
      await (
        await request.put(`/api/admin/events/${createdEvent.eventUuid}`, {
          data: { ...eventData, title: 'Saved event' },
        })
      ).json(),
    ).toMatchObject({ type: 'success' });
  });
  test('renders private headings and native collapsible panels', async ({
    page,
  }) => {
    await page.goto('/pages/page-0/');
    await expect(
      page.locator('h2').filter({ hasText: 'Private heading' }),
    ).toBeVisible();
    await expect(
      page.locator('h3').filter({ hasText: 'Section heading' }),
    ).toBeVisible();
    await expect(page.locator('a[href="#private-heading"]')).toBeVisible();
    const details = page
      .locator('details')
      .filter({ has: page.locator('a[href="#private-heading"]') })
      .first();
    const summary = details.locator('summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(details).not.toHaveAttribute('open');
    await page.keyboard.press('Tab');
    expect(
      await details
        .locator('a')
        .evaluateAll((elements) =>
          elements.some((element) => element === document.activeElement),
        ),
    ).toBe(false);
    await summary.focus();
    await page.keyboard.press('Space');
    await expect(details).toHaveAttribute('open');
  });
});

test('dense life day remains virtualized and restores date navigation', async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (/hydration/i.test(message.text())) warnings.push(message.text());
  });
  await page.goto('/life/');
  await expect(page.locator('[data-life-key]').first()).toBeVisible();
  await page.waitForTimeout(700);
  expect(await page.locator('[data-life-key]').count()).toBeLessThan(60);
  for (let index = 0; index < 12; index++) {
    await page.evaluate(() => window.scrollBy(0, 1800));
    await page.waitForTimeout(70);
  }
  expect(await page.locator('[data-life-key]').count()).toBeLessThan(60);
  await page.setViewportSize({ width: 580, height: 850 });
  await page.waitForTimeout(200);
  expect(await page.locator('[data-life-key]').count()).toBeLessThan(60);
  await page.goto('/life/2026/05/01/');
  await expect(page.locator('[data-life-period-tracker]')).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.locator('[data-life-key]').count()).toBeLessThan(60);
  expect(
    Number(
      await page
        .locator('[data-life-cached-windows]')
        .getAttribute('data-life-cached-windows'),
    ),
  ).toBeLessThanOrEqual(10);
  expect(warnings).toEqual([]);
});
