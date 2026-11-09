import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Excerpts: named parts of a diary entry, an event or a project about
 * something else in the archive. In the parent's form they are a block of
 * rows that open a modal each; what an excerpt is about is its relations,
 * one at least; a diary entry may hold nothing but an excerpt. On the page
 * of what an excerpt is about, the form shows a read-only tab of excerpts
 * and recommends their parents; the public pages show the excerpt whole on
 * its parent's page, on a page of its own and as a card on the target's.
 * Deleting a target asks what becomes of the excerpts about it.
 */

test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 375, height: 812 };

let errors: string[] = [];

test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const content = (text: string) => ({
  data: { blocks: [{ type: 'paragraph', data: { text } }] },
});

/**
 * Days of 2011, a year no other spec writes to, that hold no entry yet: a
 * spec run again, or a test retried, writes beside what it wrote before.
 */
async function freeDays(page: Page, count: number) {
  const taken = new Set(
    (
      (await (await page.request.get('/api/admin/diary/dates')).json()) as {
        date: string;
      }[]
    ).map((entry) => entry.date),
  );
  const days: string[] = [];
  for (let day = Date.UTC(2011, 0, 1); days.length < count; day += 86_400_000) {
    const date = new Date(day).toISOString().slice(0, 10);
    if (!taken.has(date)) days.push(date);
  }
  return days;
}

async function createProject(page: Page, stamp: number, name: string) {
  const response = await page.request.post('/api/admin/projects', {
    data: {
      title: `${name} ${stamp}`,
      summary: 'Something an excerpt is about.',
      access: 'public',
      humanReadableSlug: name.toLowerCase(),
      publicId: `${name.toLowerCase()}${stamp}`,
      showcase: false,
      cv: false,
      descriptionContent: content('A project.'),
    },
  });
  const body = await response.json();
  expect(body.type, JSON.stringify(body)).toBe('success');
  return {
    uuid: body.projectUuid as string,
    href: `/projects/${name.toLowerCase()}-${name.toLowerCase()}${stamp}/`,
  };
}

function excerpt(
  stamp: number,
  title: string,
  about: { type: string; id: string }[],
  options: { isPrivate?: boolean } = {},
) {
  const slug = title.toLowerCase().replace(/\s+/g, '-');
  return {
    title: `${title} ${stamp}`,
    summary: `About ${slug}`,
    humanReadableSlug: slug,
    publicId: `${slug.replace(/-/g, '')}${stamp}`.slice(0, 32),
    isPrivate: options.isPrivate ?? false,
    content: content(`The ${slug} excerpt, in its own words.`),
    relations: about.map((target) => ({
      entityType: target.type,
      entityId: target.id,
      type: 'related',
    })),
  };
}

/** A diary entry with the given excerpts, and no text of its own. */
async function createEntry(
  page: Page,
  date: string,
  excerpts: ReturnType<typeof excerpt>[],
  text?: string,
) {
  const response = await page.request.post('/api/admin/diary', {
    data: {
      date,
      access: 'public',
      content: text ? content(text) : null,
      excerpts,
    },
  });
  const body = await response.json();
  expect(body.type, JSON.stringify(body)).toBe('success');
  return body.diaryUuid as string;
}

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
}

const block = (page: Page) => page.locator('[data-excerpts]');
const rows = (page: Page) => block(page).locator('[data-excerpt-row]');
const modal = (page: Page) => page.locator('[data-excerpt-modal]');
const relationModal = (page: Page) => page.locator('[data-relation-modal]');
const picker = (page: Page) =>
  page.locator('section[role="dialog"]').getByRole('combobox');
const dialogSave = (page: Page) => page.locator('[data-excerpt-save]');
const create = (page: Page) =>
  page.getByRole('button', { name: 'Create', exact: true });

test('an entry may be nothing but an excerpt, written in its modal and about a project', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  const stamp = Date.now();
  const project = await createProject(page, stamp, 'Kayak');
  const [date] = await freeDays(page, 1);
  await open(page, `/admin/diary/new/?date=${date}`);

  // A day is told by its text or by its excerpts: the form asks for either.
  await expect(create(page)).toBeDisabled();
  await expect(create(page)).toHaveAccessibleDescription(
    /Entry content or Excerpts/,
  );

  await page.getByRole('button', { name: 'Add excerpt' }).click();
  await expect(modal(page)).toBeVisible();
  const save = dialogSave(page);
  await expect(save).toBeDisabled();
  await expect(save).toHaveAccessibleDescription(
    /Excerpt title, About, Excerpt text/,
  );

  // The title field: the first of the modal, its label not read as its name.
  await modal(page).getByRole('textbox').first().fill(`Stringers ${stamp}`);
  // What it is about: a relation, chosen with the picker.
  await modal(page).getByRole('button', { name: 'Add a relation' }).click();
  await expect(relationModal(page)).toBeVisible();
  await picker(page).fill(`Kayak ${stamp}`);
  await page
    .locator('section[role="dialog"]')
    .getByRole('option', { name: new RegExp(`Kayak ${stamp}`) })
    .first()
    .click();
  await relationModal(page).getByRole('button', { name: 'Done' }).click();
  await expect(relationModal(page)).toBeHidden();
  await expect(
    modal(page).locator('[data-relation-chip]', { hasText: `Kayak ${stamp}` }),
  ).toBeVisible();

  // Its text, typed in the editor and saved into the modal.
  await modal(page)
    .getByRole('button', { name: `Edit: Stringers ${stamp}` })
    .click();
  const paragraph = page
    .locator('dialog[open]')
    .last()
    .getByRole('textbox')
    .first();
  await expect(paragraph).toBeVisible({ timeout: 15_000 });
  await paragraph.click();
  await page.keyboard.type('Glued the stringers to the frames.');
  await page.keyboard.press('ControlOrMeta+s');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(1);

  // Handed over to the entry, which is not made yet: the modal says so.
  await expect(save).toBeEnabled();
  await save.click();
  await expect(save).toHaveText('Save');
  await page.keyboard.press('Escape');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).locator('[data-excerpt-about]')).toContainText(
    `Kayak ${stamp}`,
  );

  // The entry is made with no text of its own.
  await expect(create(page)).toBeEnabled();
  await create(page).click();
  await expect(page).toHaveURL(/\/admin\/diary\/[^/]+\/edit\/$/);
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
  await expect(rows(page)).toHaveCount(1);
  await rows(page).locator('[data-excerpt-open]').click();
  await expect(dialogSave(page)).toHaveText('Saved');
  await page.keyboard.press('Escape');

  // On the project's form, a tab of its own and a recommendation to relate
  // the entry; on its page, the card; on the entry's page, the excerpt whole.
  await open(page, `/admin/projects/${project.uuid}/edit/`);
  const tab = page.locator('[data-relations]').getByRole('tab', {
    name: /Excerpts/,
  });
  await expect(tab).toContainText('1');
  await tab.click();
  await expect(page.locator('[data-excerpt-about-chip]')).toContainText(
    `Stringers ${stamp}`,
  );
  await expect(
    page.locator('[data-relation-recommendation]').first(),
  ).toContainText('Has an excerpt about this');

  await page.goto(project.href);
  const card = page.locator('[data-excerpt-card]');
  await expect(card).toContainText(`Stringers ${stamp}`);
  await expect(card).toHaveAttribute('data-torn', 'true');

  await page.goto(`/diary/${date}/`);
  const article = page.locator('[data-excerpt]');
  await expect(article.getByRole('heading', { level: 2 })).toContainText(
    `Stringers ${stamp}`,
  );
  await expect(
    article.getByRole('link', { name: `Stringers ${stamp}` }),
  ).toHaveAttribute('rel', 'bookmark');
  await expect(article.locator('[data-excerpt-about]')).toContainText(
    `Kayak ${stamp}`,
  );
  await article.getByRole('link', { name: `Stringers ${stamp}` }).click();
  await expect(page).toHaveURL(
    new RegExp(`/diary/${date}/excerpts/stringers-`),
  );
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    `Stringers ${stamp}`,
  );
  // The admin bar leads back to the excerpt, in its parent's form.
  await page.getByRole('link', { name: 'Edit excerpt' }).click();
  await expect(page).toHaveURL(/\/admin\/diary\/[^/]+\/edit\/$/);
  await expect(modal(page)).toBeVisible();
  await expect(modal(page).getByRole('textbox').first()).toHaveValue(
    `Stringers ${stamp}`,
  );
});

test('deleting a target asks what becomes of the excerpts about it, and both answers hold', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  const stamp = Date.now();
  const kept = await createProject(page, stamp, 'Kept');
  const gone = await createProject(page, stamp, 'Gone');
  const [first, second] = await freeDays(page, 2);
  const firstEntry = await createEntry(page, first!, [
    excerpt(stamp, 'Only kept', [{ type: 'project', id: kept.uuid }]),
  ]);
  const secondEntry = await createEntry(page, second!, [
    excerpt(stamp, 'Only gone', [{ type: 'project', id: gone.uuid }]),
    excerpt(stamp, 'Both', [
      { type: 'project', id: gone.uuid },
      { type: 'project', id: kept.uuid },
    ]),
  ]);

  // Kept without the project: the excerpt stays, about nothing until told.
  await open(page, `/admin/projects/${kept.uuid}/edit/`);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const pane = page.locator('dialog[open]').last();
  const choice = pane.locator('[data-excerpts-on-delete]');
  await expect(choice).toContainText(
    '2 excerpts are about it; for one of them it is the only thing.',
  );
  await expect(
    choice.getByRole('button', { name: 'Keep the excerpts about it' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await pane.getByRole('textbox').fill(`Kept ${stamp}`);
  await pane.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/projects\/$/);
  const afterKeep = await (
    await page.request.get(`/api/admin/diary/${firstEntry}`)
  ).json();
  expect(afterKeep.excerpts).toHaveLength(1);
  expect(afterKeep.excerpts[0].relations).toEqual([]);
  await open(page, `/admin/diary/${firstEntry}/edit/`);
  await expect(rows(page).locator('[data-excerpt-orphan]')).toHaveText(
    /About nothing yet/,
  );

  // Deleted with the project: its excerpts go, the one about two things too.
  await open(page, `/admin/projects/${gone.uuid}/edit/`);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const second_ = page.locator('dialog[open]').last();
  await second_
    .locator('[data-excerpts-on-delete]')
    .getByRole('button', { name: 'Delete the excerpts too' })
    .click();
  await second_.getByRole('textbox').fill(`Gone ${stamp}`);
  await second_.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/projects\/$/);
  const afterDelete = await (
    await page.request.get(`/api/admin/diary/${secondEntry}`)
  ).json();
  expect(afterDelete.excerpts).toHaveLength(0);
});

test('the block and the modal keep to a phone', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const stamp = Date.now();
  const project = await createProject(page, stamp, 'Phone');
  const [date] = await freeDays(page, 1);
  const entry = await createEntry(
    page,
    date!,
    [excerpt(stamp, 'Narrow', [{ type: 'project', id: project.uuid }])],
    'A day with an excerpt.',
  );
  await open(page, `/admin/diary/${entry}/edit/`);
  const row = rows(page).first();
  await expect(row).toBeVisible();
  const box = (await row.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width + 0.5);
  await row.locator('[data-excerpt-open]').click();
  await expect(modal(page)).toBeVisible();
  // The square Save of a phone, and the relation chip inside the modal.
  await expect(dialogSave(page)).toBeVisible();
  await expect(
    modal(page).locator('[data-relation-chip]', { hasText: `Phone ${stamp}` }),
  ).toBeVisible();
  const chip = (await modal(page)
    .locator('[data-relation-chip]')
    .first()
    .boundingBox())!;
  expect(chip.x + chip.width).toBeLessThanOrEqual(PHONE.width + 0.5);
});
