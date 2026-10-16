import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { startFakeModel, type FakeModel } from '../helpers/fake-model';

/**
 * The Templates tab as the owner uses it: the three built-in checks and the
 * owner's own requests in one list, no schedule anywhere; a check run from
 * its row over the archive and from an entity's ✦ over the entity, saying
 * so when there is nothing new and looking again when asked; a built-in one
 * copied into a request of the owner's, which opens in a new session, and
 * deleted. On a computer, and on a phone.
 */
test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});
test.describe.configure({ mode: 'serial' });

const run = Date.now() % 100_000;
const TITLE = `Harbour look ${run}`;
const DAY = new Date(Date.UTC(2012, 0, 1) + (run % 700) * 86_400_000)
  .toISOString()
  .slice(0, 10);
let eventUuid = '';
let model: FakeModel;

test.beforeAll(async ({ request }) => {
  const made = await (
    await request.post('/api/admin/events', {
      data: {
        title: `Harbour night ${run}`,
        summary: 'A night by the harbour.',
        access: 'public',
        humanReadableSlug: 'harbour-night',
        publicId: `hn${run}`,
        content: {
          data: {
            blocks: [
              {
                type: 'paragraph',
                data: {
                  text: `Lanterns all along the pier, as told in <a data-content-link="entity" data-entity-type="project" data-entity-id="p-gone-${run}">the old plan</a>.`,
                },
              },
            ],
          },
        },
        periods: [{ startDate: DAY, endDate: DAY }],
      },
    })
  ).json();
  expect(made.type, JSON.stringify(made)).toBe('success');
  eventUuid = made.eventUuid;
  model = await startFakeModel(() => ({ text: 'Looked: all is well.' }), {
    models: ['fake-e2e'],
  });
  expect(
    (
      await request.put('/api/admin/ai/settings', { data: { enabled: true } })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.put('/api/admin/ai/model', {
        data: {
          provider: 'openai',
          baseUrl: model.url,
          model: 'fake-e2e',
          monthlyTokens: 10_000_000,
        },
      })
    ).ok(),
  ).toBe(true);
});

test.afterAll(async ({ request }) => {
  const list = (await (
    await request.get('/api/admin/ai/templates')
  ).json()) as {
    templates: { templateId: string; builtin?: string; title: string }[];
  };
  for (const template of list.templates)
    if (!template.builtin && template.title.includes(String(run)))
      await request.delete(`/api/admin/ai/templates/${template.templateId}`);
  await request.put('/api/admin/ai/model', { data: { provider: 'none' } });
  await request.put('/api/admin/ai/settings', { data: { enabled: false } });
  await model?.close();
});

let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function open(page: Page, path = '/admin/ai/?tab=templates') {
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
}

const row = (page: Page, templateId: string) =>
  page.locator(`[data-template-row="${templateId}"]`);
const toast = (page: Page) => page.locator('[data-toast]');

test('lists the three checks and the owner’s requests, no schedule anywhere', async ({
  page,
}) => {
  await open(page);
  const list = page.locator('[data-templates-list]');
  await expect(list.locator('[data-template-row^="builtin-"]')).toHaveCount(3);
  for (const key of ['proofread', 'links', 'graph'])
    await expect(row(page, `builtin-${key}`)).toBeVisible();
  await expect(row(page, 'builtin-proofread')).toContainText(
    'Fixing text mistakes',
  );
  await expect(list.getByRole('switch')).toHaveCount(0);
  await row(page, 'builtin-graph').locator('[data-template-edit]').click();
  const modal = page.locator('[data-template-modal]');
  await expect(modal).toBeVisible();
  await expect(modal.locator('[data-template-when]')).toHaveCount(0);
  await expect(modal.locator('[data-template-instruction]')).toHaveCount(0);
  await expect(
    modal.locator('[data-template-offer="diary-entry"]'),
  ).toHaveAttribute('aria-pressed', 'true');
  // Offered only where it can look: projects, events and diary entries.
  await expect(modal.locator('[data-template-offer]')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
});

test('runs a check from its row, and says when nothing new is left', async ({
  page,
}) => {
  await open(page);
  const links = row(page, 'builtin-links');
  // Each run takes up to forty links; the last says there is nothing new.
  let started = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    await links.locator('[data-template-run]').click();
    await expect(toast(page)).toBeVisible();
    const said = await toast(page).innerText();
    if (said.includes('nothing new to check')) break;
    expect(said).toContain('Fixing broken links');
    started++;
    await expect(links.locator('[data-template-last]')).toBeVisible({
      timeout: 20_000,
    });
  }
  expect(started).toBeGreaterThan(0);
  await expect(toast(page)).toContainText(
    '“Fixing broken links”: nothing new to check',
  );
  // From the whole archive there is no looking again from the start.
  await expect(toast(page).getByRole('button')).toHaveCount(0);
  const asked = JSON.stringify(
    model.requests.find((request) =>
      JSON.stringify(request.body.messages).includes(`p-gone-${run}`),
    )?.body.messages,
  );
  expect(asked).toContain('Mend these links that lead nowhere');
});

test('runs a check from an entity’s ✦, and looks at it again when asked', async ({
  page,
}) => {
  await open(page, `/admin/events/${eventUuid}/edit/`);
  const menu = page.locator('[data-ai-entity-menu]');
  const check = menu.locator('[data-ai-preset="builtin-proofread"]');
  await page.locator('[data-ai-entity]').click();
  await check.click();
  const sent = menu.locator('[data-ai-entity-sent]');
  await expect(sent).toContainText(
    `Fixing text mistakes · Harbour night ${run}`,
  );
  await expect(sent.locator('[data-ai-entity-stop]')).toHaveCount(0, {
    timeout: 20_000,
  });
  // Looked at already: nothing new, and a way to look again.
  await check.click();
  await expect(toast(page)).toContainText(
    '“Fixing text mistakes”: nothing new to check',
  );
  await toast(page).getByRole('button', { name: 'Check again' }).click();
  await expect(sent).toBeVisible();
  await expect(sent.locator('[data-ai-entity-stop]')).toHaveCount(0, {
    timeout: 20_000,
  });
  const sessions = (await (
    await page.request.get(
      `/api/admin/ai/sessions?about=${encodeURIComponent(`event:${eventUuid}`)}`,
    )
  ).json()) as { sessions: { templateId: string | null; origin: string }[] };
  expect(
    sessions.sessions.filter(
      (session) =>
        session.templateId === 'builtin-proofread' &&
        session.origin === 'template',
    ),
  ).toHaveLength(2);
});

test('copies a check into a request of the owner’s, opened in a new session', async ({
  page,
}) => {
  await open(page);
  await row(page, 'builtin-graph').locator('[data-template-edit]').click();
  const modal = page.locator('[data-template-modal]');
  await modal.locator('[data-template-copy]').click();
  await expect(modal).toHaveCount(0);
  const copy = page
    .locator('[data-template-row]')
    .filter({ hasText: 'Finding possible relations (copy)' })
    .first();
  await expect(copy).toBeVisible();
  await copy.locator('[data-template-edit]').click();
  await modal.locator('[data-template-title]').fill(TITLE);
  await modal.locator('[data-template-save]').click();
  await expect(modal).toHaveCount(0);

  const own = page.locator('[data-template-row]').filter({ hasText: TITLE });
  await expect(own).toContainText('Find the relations missing');
  await own.locator('[data-template-run]').click();
  await expect(page).toHaveURL(/[?&]session=new/);
  await expect(page.locator('[data-composer-field]')).toContainText(
    'Find the relations missing',
  );

  // The owner's own is deleted, unlike a built-in one.
  await open(page);
  await own.locator('[data-template-edit]').click();
  await expect(modal.locator('[data-template-delete]')).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await modal.locator('[data-template-delete]').click();
  await expect(own).toHaveCount(0);
  await row(page, 'builtin-graph').locator('[data-template-edit]').click();
  await expect(modal.locator('[data-template-delete]')).toHaveCount(0);
});

test('fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await expect(
    row(page, 'builtin-proofread').locator('[data-template-run]'),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await row(page, 'builtin-proofread').locator('[data-template-edit]').click();
  await expect(page.locator('[data-template-modal]')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
