import {
  expect,
  request as playwright,
  test,
  type Locator,
  type Page,
} from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { E2E_ORIGIN } from './fixture-url';

/**
 * The way to the section or diary entry before and after, in the summary
 * panel: two tiles, the one before above, each with the other's picture, its
 * name and what tells it apart — the time of a dated section, how a
 * diary entry begins, never what a private section of it says.
 */

const adminState = fileURLToPath(
  new URL('./.artifacts/admin.json', import.meta.url),
);

const stamp = Date.now();
const LONG =
  'A section whose name runs far too long to sit on two lines of the narrow summary beside the page';
const SECRET = `Kept to myself ${stamp}`;
const project = `neighbours-np${stamp}`;
/**
 * Three days in a row, in a year no other spec writes to, and in a month this
 * spec has not written to yet: a worker started again after a failure runs
 * `beforeAll` once more, over the entries of the first.
 */
let days: string[] = [];

/** Opens a page once it answers clicks and hovers. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
}

const text = (value: string) => ({
  data: { blocks: [{ type: 'paragraph', data: { text: value } }] },
});

test.beforeAll(async () => {
  const owner = await playwright.newContext({
    baseURL: E2E_ORIGIN,
    storageState: adminState,
  });
  const taken = new Set(
    (
      (await (await owner.get('/api/admin/diary/dates')).json()) as {
        date: string;
      }[]
    ).map((entry) => entry.date),
  );
  days =
    Array.from({ length: 12 }, (_, index) => {
      const month = String(1 + ((stamp + index) % 12)).padStart(2, '0');
      return ['01', '02', '03'].map((day) => `2013-${month}-${day}`);
    }).find((month) => month.every((day) => !taken.has(day))) ?? [];
  expect(days, 'a month of 2013 with its first days free').toHaveLength(3);
  const dated = (title: string, slug: string, start: string, end: string) => ({
    title,
    summary: `About ${slug}`,
    humanReadableSlug: slug,
    publicId: `${slug}${stamp}`,
    isPrivate: false,
    content: text(`The ${slug} section.`),
    periods: [{ startDate: start, endDate: end }],
  });
  const created = await (
    await owner.post('/api/admin/projects', {
      data: {
        title: 'Neighbours',
        summary: 'A project with sections in a row.',
        access: 'public',
        humanReadableSlug: 'neighbours',
        publicId: `np${stamp}`,
        showcase: false,
        cv: false,
        descriptionContent: text('Sections.'),
        sections: [
          // About a topic: kept in the owner's order, apart from the dated
          // ones, so it is nobody's neighbour among them.
          {
            title: 'Notes',
            summary: 'About the whole',
            humanReadableSlug: 'notes',
            publicId: `notes${stamp}`,
            isPrivate: false,
            content: text('Notes.'),
            periods: [],
          },
          dated('Groundwork', 'first', '2020-01-01', '2020-02-01'),
          dated('Building', 'middle', '2020-03-01', '2020-04-01'),
          dated(LONG, 'last', '2020-05-01', '2020-06-01'),
        ],
      },
    })
  ).json();
  expect(created.type, JSON.stringify(created)).toBe('success');

  const entries = [
    {
      blocks: [
        { type: 'paragraph', data: { text: 'The first day began with rain.' } },
        {
          type: 'privateSectionBoundary',
          data: { sectionId: 'mine', edge: 'start' },
        },
        { type: 'paragraph', data: { text: SECRET } },
        {
          type: 'privateSectionBoundary',
          data: { sectionId: 'mine', edge: 'end' },
        },
      ],
    },
    { blocks: [{ type: 'paragraph', data: { text: 'The middle day.' } }] },
    { blocks: [{ type: 'paragraph', data: { text: 'The last day.' } }] },
  ];
  for (const [index, day] of days.entries()) {
    const diary = await (
      await owner.post('/api/admin/diary', {
        data: {
          date: day,
          access: 'public',
          content: { data: entries[index] },
        },
      })
    ).json();
    expect(diary.type, JSON.stringify(diary)).toBe('success');
  }
  await owner.dispose();
});

const tiles = (scope: Locator) => scope.locator('[data-neighbour]');

test('a dated section leads back above and on below, by picture, name and time', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, `/projects/${project}/sections/middle-middle${stamp}/`);
  const aside = page.locator('aside').first();
  const links = tiles(aside);
  await expect(links).toHaveCount(2);
  await expect(links.nth(0)).toHaveAttribute('rel', 'prev');
  await expect(links.nth(1)).toHaveAttribute('rel', 'next');
  const [back, on] = [
    (await links.nth(0).boundingBox())!,
    (await links.nth(1).boundingBox())!,
  ];
  expect(on.y).toBeGreaterThanOrEqual(back.y + back.height);

  await expect(links.nth(0)).toContainText('Groundwork');
  await expect(links.nth(0)).toContainText('2020');
  await expect(links.nth(0)).toHaveAttribute('aria-label', /Groundwork/);
  // The way is said to screen readers only.
  for (const word of ['Back', 'Next', 'Назад', 'Вперёд'])
    await expect(aside.getByText(word, { exact: true })).toHaveCount(0);
  await expect(links.nth(0).locator('.media-edge-strip')).toHaveCount(1);

  // A long name is cut to two lines and told whole in the popup; a short
  // one has nothing to add.
  const long = links.nth(1);
  const clipped = await long
    .locator('[data-title-popup-clip]')
    .first()
    .evaluate((element) => element.scrollHeight > element.clientHeight + 1);
  expect(clipped).toBe(true);
  await long.hover();
  await expect(page.locator('[data-title-popup-el]')).toContainText(LONG);
  await page.mouse.move(5, 5);
  await links.nth(0).hover();
  await page.waitForTimeout(700);
  await expect(page.locator('[data-title-popup-el]')).toBeHidden();
});

test('the first dated section only leads on, past the undated one', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, `/projects/${project}/sections/first-first${stamp}/`);
  const links = tiles(page.locator('aside').first());
  await expect(links).toHaveCount(1);
  await expect(links.first()).toHaveAttribute('rel', 'next');
  await expect(links.first()).toContainText('Building');
});

test('an undated section has no dated neighbours', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, `/projects/${project}/sections/notes-notes${stamp}/`);
  await expect(tiles(page.locator('aside').first())).toHaveCount(0);
});

test('a project lists its undated and dated sections in two tabs', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, `/projects/${project}/`);
  const block = page.locator('#project-sections');
  const titles = block.locator('#project-sections-panel h3');
  await expect(block.getByRole('tab')).toHaveCount(2);
  await expect(titles).toHaveText(['Notes']);
  await block.getByRole('tab', { name: /Dated|С датами/ }).click();
  // Newest first, as a chronology reads them.
  await expect(titles).toHaveText([LONG, 'Building', 'Groundwork']);
});

test('a diary entry shows how its neighbours begin, and not their private sections', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, `/diary/${days[1]}/`);
  await page.getByRole('button', { name: /Expand|Развернуть/ }).click();
  const sheet = page.locator('dialog[open]');
  const links = tiles(sheet);
  await expect(links).toHaveCount(2);
  await expect(links.nth(0)).toContainText('The first day began with rain.');
  await expect(links.nth(1)).toContainText('The last day.');
  await expect(sheet).not.toContainText(SECRET);
  await links.nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/diary/${days[2]}/$`));
});
