import {
  expect,
  request as playwright,
  test,
  type Locator,
} from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { E2E_ORIGIN } from './fixture-url';

/**
 * The way to the stage, section or diary entry before and after, in the
 * summary panel: two tiles, the one before above, each with the other's
 * picture, its name and what tells it apart — the time of a stage, how a
 * diary entry begins, never what a private section of it says.
 */

const adminState = fileURLToPath(
  new URL('./.artifacts/admin.json', import.meta.url),
);

const stamp = Date.now();
const LONG =
  'A stage whose name runs far too long to sit on two lines of the narrow summary beside the page';
const SECRET = `Kept to myself ${stamp}`;
const project = `neighbours-np${stamp}`;
// Three days in a row, in a year no other spec writes to.
const month = String(1 + (stamp % 9)).padStart(2, '0');
const days = ['01', '02', '03'].map((day) => `2013-${month}-${day}`);

const text = (value: string) => ({
  data: { blocks: [{ type: 'paragraph', data: { text: value } }] },
});

test.beforeAll(async () => {
  const owner = await playwright.newContext({
    baseURL: E2E_ORIGIN,
    storageState: adminState,
  });
  const stage = (title: string, slug: string, start: string, end: string) => ({
    title,
    summary: `About ${slug}`,
    humanReadableSlug: slug,
    publicId: `${slug}${stamp}`,
    isPrivate: false,
    isStage: true,
    content: text(`The ${slug} stage.`),
    periods: [{ startDate: start, endDate: end }],
  });
  const created = await (
    await owner.post('/api/admin/projects', {
      data: {
        title: 'Neighbours',
        summary: 'A project with stages in a row.',
        access: 'public',
        humanReadableSlug: 'neighbours',
        publicId: `np${stamp}`,
        showcase: false,
        cv: false,
        descriptionContent: text('Stages.'),
        stages: [
          stage('Groundwork', 'first', '2020-01-01', '2020-02-01'),
          stage('Building', 'middle', '2020-03-01', '2020-04-01'),
          stage(LONG, 'last', '2020-05-01', '2020-06-01'),
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

test('a stage leads back above and on below, by picture, name and time', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/projects/${project}/stages/middle-middle${stamp}/`);
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

test('the first stage only leads on', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/projects/${project}/stages/first-first${stamp}/`);
  const links = tiles(page.locator('aside').first());
  await expect(links).toHaveCount(1);
  await expect(links.first()).toHaveAttribute('rel', 'next');
});

test('a diary entry shows how its neighbours begin, and not their private sections', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/diary/${days[1]}/`);
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
