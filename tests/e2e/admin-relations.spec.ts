import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * The relations block of an edit form: three tabs heading it, the chosen
 * one underlined and on a phone the only one with its words; each relation a
 * chip — its name, and what it is to this entity — that opens the relation
 * in a modal, the same one "+" opens for a new relation, its other end
 * chosen there with the picker; projects and events dragged into order,
 * diary entries by their days; and at its foot, what the entity's own text
 * links to, recommended.
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

const content = (text: string) => ({
  data: { blocks: [{ type: 'paragraph', data: { text } }] },
});

const entityLink = (id: string, text: string) =>
  `<a data-content-link="entity" data-entity-type="event" data-entity-id="${id}">${text}</a>`;

const LONG_NOTE =
  'The harbour project gave this one its maps, its routes and most of the people who later carried it on';

async function createEvent(page: Page, stamp: number, index: number) {
  const response = await page.request.post('/api/admin/events', {
    data: {
      title: `Linked meeting ${index} ${stamp}`,
      summary: 'Named in a text.',
      access: 'public',
      humanReadableSlug: `linked-meeting-${index}`,
      publicId: `lm${index}${stamp}`,
      content: content('Met.'),
      periods: [{ startDate: '2024-03-14', endDate: '2024-03-14' }],
    },
  });
  const body = await response.json();
  expect(body.type, JSON.stringify(body)).toBe('success');
  return body.eventUuid as string;
}

/**
 * Days of 2014, a year no other spec writes to, that hold no entry yet: a
 * spec run again, or a test retried, writes beside what it wrote before.
 */
async function createDiaryEntries(page: Page, count: number) {
  const taken = new Set(
    (
      (await (await page.request.get('/api/admin/diary/dates')).json()) as {
        date: string;
      }[]
    ).map((entry) => entry.date),
  );
  const days: string[] = [];
  for (let day = Date.UTC(2014, 0, 1); days.length < count; day += 86_400_000) {
    const date = new Date(day).toISOString().slice(0, 10);
    if (!taken.has(date)) days.push(date);
  }
  const entries: { date: string; uuid: string }[] = [];
  for (const date of days) {
    const response = await page.request.post('/api/admin/diary', {
      data: { date, access: 'public', content: content(`Day ${date}.`) },
    });
    const body = await response.json();
    expect(body.type, JSON.stringify(body)).toBe('success');
    entries.push({ date, uuid: body.diaryUuid as string });
  }
  return entries;
}

async function createProject(
  page: Page,
  stamp: number,
  data: { description?: string; relations?: unknown[] },
) {
  const response = await page.request.post('/api/admin/projects', {
    data: {
      title: `Related things ${stamp}`,
      summary: 'A project with relations.',
      access: 'public',
      humanReadableSlug: 'related-things',
      publicId: `rel${stamp}`,
      showcase: false,
      cv: false,
      descriptionContent: content(data.description ?? 'Nothing linked.'),
      relations: data.relations ?? [],
    },
  });
  const body = await response.json();
  expect(body.type, JSON.stringify(body)).toBe('success');
  return body.projectUuid as string;
}

async function openEditForm(page: Page, projectUuid: string) {
  await page.goto(`/admin/projects/${projectUuid}/edit/`);
  // The form is drawn on the server: a choice made in it before it hydrates
  // changes only the markup, and hydration puts the stored value back.
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
}

const block = (page: Page) => page.locator('[data-relations]');
const chips = (page: Page) => page.locator('[data-relation-chip]');
const chipNamed = (page: Page, name: string) =>
  chips(page).filter({ hasText: name });
const titles = (page: Page) => chips(page).locator('[data-relation-title]');
const modal = (page: Page) => page.locator('[data-relation-modal]');
/** The picker's field, not the tag field of the form under the modal. */
const picker = (page: Page) =>
  page.locator('section[role="dialog"]').getByRole('combobox');
const saved = (page: Page) =>
  page.getByRole('button', { name: 'Saved', exact: true });
const save = (page: Page) =>
  page.getByRole('button', { name: 'Save', exact: true });

/** A diary entry's chip is called by its day, its month cut short. */
function chipDay(date: string) {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/**
 * Drags a chip by the pointer and sets it down at the start of another, the
 * way a hand does: the sorter follows the pointer on a clock of its own, so
 * it is given the time to. The block lies below the fold of the form, and
 * the pointer goes where the chips are once it is in view.
 */
async function dragChip(page: Page, chip: Locator, before: Locator) {
  await chip.scrollIntoViewIfNeeded();
  const box = (await chip.boundingBox())!;
  const target = (await before.boundingBox())!;
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const to = { x: target.x + 6, y: target.y + target.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const steps = 20;
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(
      start.x + ((to.x - start.x) * step) / steps,
      start.y + ((to.y - start.y) * step) / steps,
    );
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(200);
  await page.mouse.up();
}

/**
 * Every chip within the panel's width, its name above what its relation
 * says, when it says anything.
 */
async function expectChipsInside(page: Page) {
  const panel = (await block(page)
    .locator('[data-relation-panel]')
    .boundingBox())!;
  for (const chip of await chips(page).all()) {
    const box = (await chip.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(panel.x - 0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width + 0.5);
    const title = (await chip.locator('[data-relation-title]').boundingBox())!;
    const line = chip.locator('[data-relation-line]');
    if (!(await line.count())) continue;
    const said = (await line.boundingBox())!;
    expect(title.y + title.height / 2).toBeLessThan(said.y);
    expect(said.y + said.height).toBeLessThanOrEqual(box.y + box.height + 0.5);
  }
}

async function expectTabs(page: Page, width: number, selected: number) {
  const tabs = block(page).getByRole('tab');
  await expect(tabs).toHaveCount(3);
  for (let index = 0; index < 3; index++) {
    const tab = tabs.nth(index);
    await expect(tab).toHaveAttribute(
      'aria-selected',
      String(index === selected),
    );
    await expect(tab.locator('svg').first()).toBeVisible();
    const label = tab.locator('[data-tab-label]');
    if (index === selected || width >= 640) await expect(label).toBeVisible();
    else await expect(label).toBeHidden();
  }
}

for (const width of [320, 375, 1280]) {
  test(`three tabs head the block and its chips keep inside it at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const stamp = Date.now();
    const first = await createEvent(page, stamp, 1);
    const second = await createEvent(page, stamp, 2);
    const [older, newer] = await createDiaryEntries(page, 2);
    const projectUuid = await createProject(page, stamp, {
      relations: [
        {
          entityType: 'event',
          entityId: first,
          type: 'influencing',
          note: { type: 'shared', text: LONG_NOTE },
        },
        { entityType: 'event', entityId: second, type: 'related' },
        { entityType: 'diary-entry', entityId: older!.uuid, type: 'related' },
        {
          entityType: 'diary-entry',
          entityId: newer!.uuid,
          type: 'dependent',
        },
      ],
    });
    await openEditForm(page, projectUuid);

    // No projects are related: the first kind that has any is on show.
    await expectTabs(page, width, 1);
    const tabs = block(page).getByRole('tab');
    await expect(tabs.nth(0)).not.toContainText(/\d/);
    await expect(tabs.nth(1)).toContainText('2');
    await expect(tabs.nth(2)).toContainText('2');

    await expect(chips(page)).toHaveCount(2);
    await expectChipsInside(page);
    const influencing = chipNamed(page, `Linked meeting 1 ${stamp}`);
    await expect(influencing.locator('[data-relation-label]')).toHaveText(
      'Influences',
    );
    // The reason runs on from the relation's word.
    await expect(influencing.locator('[data-relation-note]')).toHaveText(
      LONG_NOTE,
    );
    // A plain relation with nothing said of it is its name alone.
    const related = chipNamed(page, `Linked meeting 2 ${stamp}`);
    await expect(related.locator('[data-relation-line]')).toHaveCount(0);

    // Diary entries by their days, the newest first, and never dragged.
    await tabs.nth(2).click();
    await expectTabs(page, width, 2);
    await expect(titles(page)).toHaveText([
      chipDay(newer!.date),
      chipDay(older!.date),
    ]);
    await expect(
      chips(page).first().locator('[data-relation-label]'),
    ).toHaveText('Depends');
    await expectChipsInside(page);

    await tabs.nth(0).click();
    await expect(chips(page)).toHaveCount(0);
    await expect(block(page).locator('[data-relations-empty]')).toHaveText(
      'No related projects yet.',
    );
  });
}

test('a chip opens its relation: its other end, its kind, its note once or per side, its removal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  const stamp = Date.now();
  const first = await createEvent(page, stamp, 1);
  const second = await createEvent(page, stamp, 2);
  await createEvent(page, stamp, 3);
  const projectUuid = await createProject(page, stamp, {
    relations: [
      {
        entityType: 'event',
        entityId: first,
        type: 'influencing',
        note: { type: 'shared', text: LONG_NOTE },
      },
      { entityType: 'event', entityId: second, type: 'related' },
    ],
  });
  await openEditForm(page, projectUuid);
  // The text links to nothing, so nothing is recommended.
  await expect(page.locator('[data-relation-recommendations]')).toHaveCount(0);

  await chipNamed(page, `Linked meeting 1 ${stamp}`).click();
  await expect(modal(page)).toBeVisible();
  const entity = modal(page).locator('[data-relation-entity]');
  await expect(entity).toContainText(`Linked meeting 1 ${stamp}`);

  // Each kind is said as a sentence with both names and their pictures.
  const option = (type: string) =>
    modal(page).locator(`[data-relation-option="${type}"]`);
  await expect(option('influencing').getByRole('radio')).toBeChecked();
  await expect(option('influencing')).toContainText(
    `Related things ${stamp} depends on Linked meeting 1 ${stamp}`,
  );
  await expect(
    option('influencing').locator('[data-relation-token]'),
  ).toHaveCount(2);
  await option('dependent').click();
  await expect(option('dependent').getByRole('radio')).toBeChecked();
  const chip = chipNamed(page, `Linked meeting 1 ${stamp}`);
  await expect(chip.locator('[data-relation-label]')).toHaveText('Depends');

  // The other end is chosen anew with the picker; the relation keeps its
  // kind, its note and its place.
  await entity.click();
  const search = picker(page);
  await expect(search).toBeFocused();
  await search.fill(`Linked meeting 3 ${stamp}`);
  await page
    .getByRole('listbox')
    .getByRole('option', { name: new RegExp(`Linked meeting 3 ${stamp}`) })
    .click();
  await expect(entity).toContainText(`Linked meeting 3 ${stamp}`);
  await expect(titles(page)).toHaveText([
    `Linked meeting 3 ${stamp}`,
    `Linked meeting 2 ${stamp}`,
  ]);
  const moved = chipNamed(page, `Linked meeting 3 ${stamp}`);
  await expect(moved.locator('[data-relation-label]')).toHaveText('Depends');
  await expect(moved.locator('[data-relation-note]')).toHaveText(LONG_NOTE);

  const shared = modal(page).locator('[data-relation-note="shared"]');
  await expect(shared).toHaveValue(LONG_NOTE);
  const toggle = modal(page)
    .locator('[data-relation-split]')
    .getByRole('switch');
  await toggle.click();
  const current = modal(page).locator('[data-relation-note="current"]');
  const other = modal(page).locator('[data-relation-note="related"]');
  await expect(current).toHaveValue(LONG_NOTE);
  await expect(other).toHaveValue(LONG_NOTE);
  // Each side's field says whose page it is shown on.
  await expect(current).toHaveAccessibleName(
    `Explanation on the page of Related things ${stamp}`,
  );
  await expect(other).toHaveAccessibleName(
    `Explanation on the page of Linked meeting 3 ${stamp}`,
  );
  await other.fill('Why it matters there');
  // Made one again, nothing written is lost.
  await toggle.click();
  await expect(shared).toHaveValue(`${LONG_NOTE} — Why it matters there`);

  // What was done is the form's already: closing keeps it.
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await expect(modal(page)).toHaveCount(0);
  await expect(save(page)).toBeVisible();

  await chipNamed(page, `Linked meeting 2 ${stamp}`).click();
  await modal(page).locator('[data-relation-remove]').click();
  await expect(modal(page)).toHaveCount(0);
  await expect(chips(page)).toHaveCount(1);
  await expect(block(page).getByRole('tab').nth(1)).toContainText('1');
});

test('"+" opens a new relation with the picker ready, and it joins once chosen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const stamp = Date.now();
  await createEvent(page, stamp, 1);
  const projectUuid = await createProject(page, stamp, {});
  await openEditForm(page, projectUuid);
  const add = page.getByRole('button', { name: 'Add a relation', exact: true });
  const search = picker(page);

  // Left without a choice, a new relation is nothing to keep.
  await add.click();
  await expect(modal(page)).toBeVisible();
  await expect(search).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(search).toBeHidden();
  await expect(modal(page)).toBeVisible();
  await expect(modal(page).locator('[data-relation-remove]')).toHaveCount(0);
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await expect(modal(page)).toHaveCount(0);
  await expect(chips(page)).toHaveCount(0);
  await expect(saved(page)).toBeVisible();

  await add.click();
  // The picker searches as it always did.
  const options = page.getByRole('listbox').getByRole('option');
  await expect(options).toHaveCount(5);
  await search.fill(`Linked meeting 1 ${stamp}`);
  await options.first().click();
  await expect(search).toBeHidden();
  await expect(modal(page).locator('[data-relation-entity]')).toContainText(
    `Linked meeting 1 ${stamp}`,
  );
  // Chosen, it is a plain relation of the form's at once.
  await expect(chips(page)).toHaveCount(1);
  const added = chips(page).first();
  await expect(added.locator('[data-relation-line]')).toHaveCount(0);
  await modal(page).locator('[data-relation-option="influencing"]').click();
  await expect(added.locator('[data-relation-label]')).toHaveText('Influences');
  await modal(page).getByRole('button', { name: 'Done' }).click();
  await expect(modal(page)).toHaveCount(0);
  await expect(block(page).getByRole('tab').nth(1)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(save(page)).toBeVisible();
});

test('projects and events are dragged into order, diary entries keep their days', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const stamp = Date.now();
  const events = [
    await createEvent(page, stamp, 1),
    await createEvent(page, stamp, 2),
    await createEvent(page, stamp, 3),
  ];
  const diary = await createDiaryEntries(page, 2);
  const projectUuid = await createProject(page, stamp, {
    relations: [
      ...events.map((id) => ({
        entityType: 'event',
        entityId: id,
        type: 'related',
      })),
      ...diary.map((entry) => ({
        entityType: 'diary-entry',
        entityId: entry.uuid,
        type: 'related',
      })),
    ],
  });
  await openEditForm(page, projectUuid);
  await expect(saved(page)).toBeVisible();
  await expect(titles(page)).toHaveText(
    [1, 2, 3].map((index) => `Linked meeting ${index} ${stamp}`),
  );

  // The third, taken by the pointer and set down before the first.
  await dragChip(page, chips(page).nth(2), chips(page).nth(0));
  await expect(titles(page)).toHaveText(
    [3, 1, 2].map((index) => `Linked meeting ${index} ${stamp}`),
  );
  // The drop is not a click on the chip.
  await page.waitForTimeout(300);
  await expect(modal(page)).toHaveCount(0);
  await expect(save(page)).toBeVisible();

  await block(page).getByRole('tab').nth(2).click();
  await expect(chips(page)).toHaveCount(2);
  for (const chip of await chips(page).all())
    await expect(chip).not.toHaveAttribute('data-drag-id');
  await expect(titles(page)).toHaveText(
    diary.map((entry) => chipDay(entry.date)).reverse(),
  );
});

test('the foot recommends what the text links to, and a tap relates it plainly', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const stamp = Date.now();
  const mentioned = await createEvent(page, stamp, 1);
  const related = await createEvent(page, stamp, 2);
  const projectUuid = await createProject(page, stamp, {
    description: `Started at ${entityLink(mentioned, 'the meeting')}, after ${entityLink(related, 'another')}.`,
    relations: [{ entityType: 'event', entityId: related, type: 'related' }],
  });
  await openEditForm(page, projectUuid);

  const foot = page.locator('[data-relation-recommendations]');
  await expect(foot).toContainText('Recommended relations');
  // Linked and already related is not recommended again.
  const recommendations = foot.locator('[data-relation-recommendation]');
  await expect(recommendations).toHaveCount(1);
  await expect(recommendations).toContainText(`Linked meeting 1 ${stamp}`);

  await recommendations.click();
  await expect(chips(page)).toHaveCount(2);
  const added = chipNamed(page, `Linked meeting 1 ${stamp}`);
  await expect(added.locator('[data-relation-line]')).toHaveCount(0);
  await expect(foot).toHaveCount(0);
  await expect(save(page)).toBeVisible();
});

test('a form whose relations were stored mixed loads as saved, and an undone change leaves it so', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const stamp = Date.now();
  const event = await createEvent(page, stamp, 4);
  const diary = await createDiaryEntries(page, 2);
  const other = await page.request.post('/api/admin/projects', {
    data: {
      title: `Other project ${stamp}`,
      summary: 'Related.',
      access: 'public',
      humanReadableSlug: 'other-project',
      publicId: `op${stamp}`,
      showcase: false,
      cv: false,
      descriptionContent: content('Other.'),
    },
  });
  const otherBody = await other.json();
  expect(otherBody.type, JSON.stringify(otherBody)).toBe('success');
  // Stored in an order the form does not keep: kinds mixed, the older day
  // first — as relations drawn from their other ends come to be stored.
  const projectUuid = await createProject(page, stamp, {
    relations: [
      { entityType: 'diary-entry', entityId: diary[0]!.uuid, type: 'related' },
      { entityType: 'event', entityId: event, type: 'related' },
      { entityType: 'diary-entry', entityId: diary[1]!.uuid, type: 'related' },
      {
        entityType: 'project',
        entityId: otherBody.projectUuid,
        type: 'related',
      },
    ],
  });

  await openEditForm(page, projectUuid);
  await expect(saved(page)).toBeVisible();

  async function edit(change: (dialog: Locator) => Promise<void>) {
    await chips(page).first().click();
    await expect(modal(page)).toBeVisible();
    await change(modal(page));
    await modal(page).getByRole('button', { name: 'Done' }).click();
    await expect(modal(page)).toHaveCount(0);
  }

  await edit((dialog) =>
    dialog.locator('[data-relation-option="dependent"]').click(),
  );
  await expect(save(page)).toBeVisible();
  await edit((dialog) =>
    dialog.locator('[data-relation-option="related"]').click(),
  );
  await expect(saved(page)).toBeVisible();

  // A note typed and taken back says nothing, as before it was typed.
  await edit(async (dialog) => {
    const note = dialog.locator('[data-relation-note="shared"]');
    await note.fill('A word');
    await note.fill('');
  });
  await expect(saved(page)).toBeVisible();
  // Nor does a note split and merged again with nothing in it.
  await edit(async (dialog) => {
    const toggle = dialog.locator('[data-relation-split]').getByRole('switch');
    await toggle.click();
    await expect(
      dialog.locator('[data-relation-note="current"]'),
    ).toBeVisible();
    await toggle.click();
  });
  await expect(saved(page)).toBeVisible();
});
