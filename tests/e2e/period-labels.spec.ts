import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * A period's own name: what that stretch of an event was. It is typed in the
 * popup that picks the dates, shown on its chip, and read first wherever the
 * period is — the chronology of the panel and the summary sheet, a card on
 * the life timeline, the Markdown copy — with its dates quieter under it.
 *
 * Everything here happens in 2011, a year no other spec writes to.
 */

test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});

let errors: string[] = [];

test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** Opens a page once it answers clicks and keys. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
}

const period = (startDate: string, endDate: string, label = '') => ({
  startDate,
  endDate,
  precision: 'exact',
  precisionNote: '',
  label,
});

/**
 * Italy ends the day France begins: the two overlap, and still stay two
 * periods, because they are named apart.
 */
async function createTrip(page: Page) {
  const stamp = Date.now();
  const response = await page.request.post('/api/admin/events', {
    data: {
      title: `Grand tour ${stamp}`,
      summary: 'Two countries in a row, and a day at home after.',
      access: 'public',
      humanReadableSlug: 'grand-tour',
      publicId: `tour${stamp}`,
      content: {
        data: { blocks: [{ type: 'paragraph', data: { text: 'Went.' } }] },
      },
      periods: [
        period('2011-03-10', '2011-03-20', 'France'),
        period('2011-03-01', '2011-03-10', 'Italy'),
        period('2011-05-05', '2011-05-05'),
      ],
    },
  });
  const body = await response.json();
  expect(body.type, JSON.stringify(body)).toBe('success');
  return {
    uuid: body.eventUuid as string,
    path: `/events/grand-tour-tour${stamp}/`,
  };
}

async function storedPeriods(page: Page, uuid: string) {
  const response = await page.request.get(`/api/admin/events/${uuid}`);
  const body = await response.json();
  return (body.periods as { startDate: string; label: string }[]).map(
    ({ startDate, label }) => [startDate, label],
  );
}

test('a named period reads by its name, with its dates under it', async ({
  page,
}) => {
  const trip = await createTrip(page);
  expect(await storedPeriods(page, trip.uuid)).toEqual([
    ['2011-03-01', 'Italy'],
    ['2011-03-10', 'France'],
    ['2011-05-05', ''],
  ]);

  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, trip.path);
  const aside = page.locator('aside').first();
  const france = aside.getByRole('link', { name: /France/ });
  await expect(france).toBeVisible();
  // The name leads; the date steps back under it.
  const [name, date] = [
    (await france.getByText('France', { exact: true }).boundingBox())!,
    (await france.locator('time').boundingBox())!,
  ];
  expect(date.y).toBeGreaterThanOrEqual(name.y + name.height - 1);
  await expect(france.locator('time')).toHaveClass(/text-text-3/);
  // A period without a name is its date alone, as bright as a name.
  const home = aside.locator('time[datetime="2011-05-05"]');
  await expect(home).toBeVisible();
  await expect(home).not.toHaveClass(/text-text-3/);

  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, trip.path);
  await page.getByRole('button', { name: /Expand|Развернуть/ }).click();
  const sheet = page.locator('dialog[open]');
  await expect(sheet.getByText('Italy', { exact: true })).toBeVisible();
  await expect(sheet.getByText('France', { exact: true })).toBeVisible();

  const markdown = await (
    await page.request.get(`${trip.path}index.md`)
  ).text();
  expect(markdown).toContain('2011-03-01 — 2011-03-10 (Italy)');
  expect(markdown).toContain('2011-03-10 — 2011-03-20 (France)');
  expect(markdown).toContain('2011-05-05');
});

test('a life card names the period it marks', async ({ page }) => {
  await createTrip(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, '/life/?d=2011-03-20');
  const card = page
    .locator('article')
    .filter({ hasText: /France/ })
    .first();
  await expect(card).toBeVisible();
  // What kind of moment it is, in a word, and the whole sentence on hover.
  await expect(card).toContainText(/(Happened|Произошло)\s*France/);
  const kicker = card.locator('[data-title-popup]').filter({
    hasText: 'France',
  });
  // Phrases carry no-break spaces, which `\s` matches.
  await expect(kicker).toHaveAttribute(
    'data-title-popup',
    /An\s+event\s+took\s+place|Состоялось\s+событие/,
  );
});

test('the popup names a period and picks a day by picking it twice', async ({
  page,
}) => {
  const trip = await createTrip(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, `/admin/events/${trip.uuid}/edit/`);

  // An existing period opens on its name, its dates and its certainty.
  await page.getByRole('button', { name: /(Edit|Изменить): Italy/ }).click();
  const label = page.getByRole('textbox', { name: /^(Label|Подпись)$/ });
  await expect(label).toHaveValue('Italy');
  await label.fill('Italia');
  await label.press('Enter');
  await expect(label).toBeHidden();
  await expect(
    page.getByRole('button', { name: /(Edit|Изменить): Italia/ }),
  ).toBeVisible();

  // A new period: the same day twice is a day.
  await page.getByRole('button', { name: /^(Add|Добавить)$/ }).click();
  const today = new Date();
  const day = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  const cell = page.locator(`[data-test-id="dp-${day}"]`);
  await cell.click();
  await cell.click();
  await expect(label).toBeVisible();
  await expect(label).toHaveValue('');
  await label.fill('Back home');
  await label.press('Enter');
  await expect(
    page.getByRole('button', { name: /(Edit|Изменить): Back home/ }),
  ).toBeVisible();

  await page.getByRole('button', { name: /^(Save|Сохранить)$/ }).click();
  await expect
    .poll(() => storedPeriods(page, trip.uuid))
    .toEqual([
      ['2011-03-01', 'Italia'],
      ['2011-03-10', 'France'],
      ['2011-05-05', ''],
      [day, 'Back home'],
    ]);
});
