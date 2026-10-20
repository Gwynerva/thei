import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { expectPopupUsable } from './helpers/popup';

/**
 * The one link popup of the editor, taken down level by level: a project,
 * a heading of its description or one of its sections, a heading of that
 * section. The levels passed stand above as a path back; Escape climbs one;
 * a link being changed opens where it leads, and a heading no longer there
 * says so. An address of this site opens its entity at the heading it names.
 */

test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});

const SIZES = [
  ['computer', { width: 1280, height: 800 }],
  ['phone', { width: 375, height: 812 }],
] as const;

let errors: string[] = [];

test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const withHeading = (heading: string, text: string) => ({
  data: {
    blocks: [
      { type: 'header', data: { text: heading, level: 2 } },
      { type: 'paragraph', data: { text } },
    ],
  },
});

type Outline = {
  headings: { id: string; title: string }[];
  sections?: { entityId: string; title: string }[];
};

/** A project with a heading in its description and two sections. */
async function createProject(page: Page) {
  const stamp = Date.now();
  const title = `Linkable ${stamp}`;
  const response = await page.request.post('/api/admin/projects', {
    data: {
      title,
      summary: 'A project to link into.',
      access: 'public',
      humanReadableSlug: 'linkable',
      publicId: `lnk${stamp}`,
      showcase: false,
      cv: false,
      descriptionContent: withHeading('Goals', 'What it set out to do.'),
      sections: [
        {
          title: `Topic one ${stamp}`,
          summary: 'The first part.',
          humanReadableSlug: 'one',
          publicId: `one${stamp}`,
          isPrivate: false,
          content: withHeading('Results', 'What came of it.'),
          periods: [],
        },
        {
          title: `Early stage ${stamp}`,
          summary: 'A dated part.',
          humanReadableSlug: 'early',
          publicId: `early${stamp}`,
          isPrivate: false,
          content: withHeading('Findings', 'What was found.'),
          periods: [{ startDate: '2020-01-01', endDate: '2020-02-01' }],
        },
      ],
    },
  });
  const body = await response.json();
  expect(body.type, JSON.stringify(body)).toBe('success');
  const projectUuid = body.projectUuid as string;
  const outline = (await (
    await page.request.get('/api/admin/content-entities/outline', {
      params: { entityType: 'project', entityId: projectUuid },
    })
  ).json()) as Outline;
  const section = outline.sections!.find((item) =>
    item.title.startsWith('Topic one'),
  )!;
  const sectionOutline = (await (
    await page.request.get('/api/admin/content-entities/outline', {
      params: { entityType: 'project-section', entityId: section.entityId },
    })
  ).json()) as Outline;
  const found = (await (
    await page.request.get('/api/admin/content-entities', {
      params: { query: title, entityTypes: 'project' },
    })
  ).json()) as { entityId: string; url: string }[];
  return {
    title,
    projectUuid,
    url: found.find((item) => item.entityId === projectUuid)!.url,
    goals: outline.headings.find((item) => item.title === 'Goals')!.id,
    section,
    results: sectionOutline.headings.find((item) => item.title === 'Results')!
      .id,
  };
}

/**
 * The editor of a new page whose first paragraph is `html`, then `blocks`;
 * with its save button, and what the page keeps once saved.
 */
async function openEditor(page: Page, html: string, blocks: object[] = []) {
  const response = await page.request.post('/api/admin/pages', {
    data: {
      title: `Link picker ${Date.now()}`,
      summary: 'A page for the link picker spec.',
      slug: `link-picker-${Date.now()}`,
      // Kept out of the public lists other specs read.
      access: 'private',
      content: {
        data: {
          blocks: [{ type: 'paragraph', data: { text: html } }, ...blocks],
        },
      },
      reminder: '',
      notes: null,
    },
  });
  const result = await response.json();
  expect(result.type, JSON.stringify(result)).toBe('success');
  await page.goto(`/admin/pages/${result.pageUuid}/edit/`);
  await page.waitForLoadState('networkidle');
  await page.locator('button[data-field]').first().click();
  await expect(paragraph(page)).toBeVisible({ timeout: 15_000 });
  const save = page
    .locator('dialog')
    .getByRole('button', { name: 'Save', exact: true });
  const read = async () =>
    (
      await (
        await page.request.get(`/api/admin/pages/${result.pageUuid}`)
      ).json()
    ).content.data.blocks as { type: string; data: Record<string, unknown> }[];
  return {
    save,
    /**
     * What the page keeps, once it keeps blocks of `types`: the form saves
     * the page a moment after the editor hands it the text.
     */
    stored: async (types: string[]) => {
      await expect
        .poll(async () => (await read()).map((item) => item.type))
        .toEqual(types);
      return read();
    },
  };
}

/**
 * Another site, read as a stub says it is. The sites the specs name are
 * seeded as already read (`BLOCK_SITE`, `LISTED_SITE`), so a save never waits
 * on the network for them.
 */
async function stubExternalLinks(page: Page) {
  await page.route('**/api/admin/external-links', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return await route.fallback();
    const url = (request.postDataJSON() as { url: string }).url;
    await route.fulfill({
      json: {
        url,
        title: `Stubbed ${new URL(url).host}`,
        status: 'complete',
        touchedAt: Date.now(),
      },
    });
  });
}

const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
/** Sites the fixture's seed stores as read (`tests/e2e/fixture/server/api/test/seed.post.ts`). */
const BLOCK_SITE = 'https://block.example/';
const LISTED_SITE = 'https://listed.example/';

const paragraph = (page: Page) =>
  page.locator('dialog .content-editor .ce-paragraph').first();
const picker = (page: Page) => page.locator('dialog [data-link-picker]');
const field = (page: Page) => page.locator('dialog [data-link-field]');
const place = (page: Page) => picker(page).locator('[data-select]');
const selectPopup = (page: Page) =>
  page.locator('[data-select-popup]').filter({ visible: true });
const option = (page: Page, value: string) =>
  selectPopup(page).locator(`[data-select-option="${value}"]`);
const apply = (page: Page) => page.locator('dialog [data-link-apply]');

/** Selects the last `length` characters of the paragraph, then the tool. */
async function linkLastWords(page: Page, length: number) {
  await paragraph(page).click();
  await page.keyboard.press('End');
  for (let step = 0; step < length; step++)
    await page.keyboard.press('Shift+ArrowLeft');
  await page
    .locator('.ce-popover--opened [data-item-name="contentLink"]')
    .click();
  await expect(field(page)).toBeFocused();
}

/** Opens the tool over the link already in the paragraph. */
async function openExisting(page: Page, words: string) {
  await paragraph(page).getByText(words).click();
  await page.keyboard.press('Shift+ArrowRight');
  await page
    .locator('.ce-popover--opened [data-item-name="contentLink"]')
    .click();
  await expect(picker(page)).toBeVisible();
}

test('a project, its section and a heading in it make one link, and Escape climbs back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const project = await createProject(page);
  await openEditor(page, 'We read the results');
  await linkLastWords(page, 'results'.length);

  await field(page).fill(project.title);
  const row = picker(page).locator('[role="option"]').first();
  await expect(row).toContainText(project.title);
  // → at the end of the words goes into the row, its select open.
  await page.keyboard.press('ArrowRight');
  await expect(picker(page)).toHaveAttribute('data-link-level', 'entity');
  await expect(picker(page).locator('[data-link-path-entity]')).toContainText(
    project.title,
  );
  await expect(option(page, 'whole')).toBeVisible();
  await expect(option(page, `h:${project.goals}`)).toBeVisible();
  await expect(option(page, `s:${project.section.entityId}`)).toBeVisible();
  // The dated section is a stage, named by where it stands.
  await expect(selectPopup(page)).toContainText('1/1');

  // The filter takes what is typed; Enter picks what it leaves first.
  await page.keyboard.type('Topic one');
  await page.keyboard.press('Enter');
  await expect(picker(page)).toHaveAttribute('data-link-level', 'section');
  await expect(picker(page).locator('[data-link-path-section]')).toContainText(
    'Topic one',
  );
  await expect(option(page, `h:${project.results}`)).toBeVisible();

  // Escape closes the open list first, then climbs a level at a time.
  await page.keyboard.press('Escape');
  await expect(selectPopup(page)).toHaveCount(0);
  await expect(picker(page)).toHaveAttribute('data-link-level', 'section');
  await page.keyboard.press('Escape');
  await expect(picker(page)).toHaveAttribute('data-link-level', 'entity');
  await expect(place(page)).toBeFocused();

  // Back down by the select, to the heading of the section.
  await place(page).click();
  await option(page, `s:${project.section.entityId}`).click();
  await expect(picker(page)).toHaveAttribute('data-link-level', 'section');
  await option(page, `h:${project.results}`).click();
  await expect(apply(page)).toBeFocused();
  await expect(place(page)).toContainText('Results');
  await page.keyboard.press('Enter');

  const link = paragraph(page).locator('a[data-content-link="entity"]');
  await expect(link).toHaveText('results');
  await expect(link).toHaveAttribute('data-entity-type', 'project-section');
  await expect(link).toHaveAttribute(
    'data-entity-id',
    project.section.entityId,
  );
  await expect(link).toHaveAttribute('data-entity-fragment', project.results);
  await expect(picker(page)).toHaveCount(0);
});

test('a row is chosen whole at once, and the path leads back to the search', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const project = await createProject(page);
  await openEditor(page, 'We read the project');
  await linkLastWords(page, 'project'.length);

  await field(page).fill(project.title);
  const first = picker(page).locator('[role="option"]').first();
  await expect(first).toContainText(project.title);
  // The row Enter takes is ringed before any arrow is pressed.
  await expect(first).toHaveAttribute('data-active', 'true');
  await expect(field(page)).toHaveAttribute(
    'aria-activedescendant',
    (await first.getAttribute('id'))!,
  );
  await page.keyboard.press('Enter');
  // The level shows, the whole chosen and ✓ waiting.
  await expect(picker(page)).toHaveAttribute('data-link-level', 'entity');
  await expect(selectPopup(page)).toHaveCount(0);
  await expect(apply(page)).toBeFocused();

  // The search line goes back to the words as they were typed.
  await picker(page).locator('[data-link-path-search]').click();
  await expect(picker(page)).toHaveAttribute('data-link-level', 'search');
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveValue(project.title);

  await page.keyboard.press('Enter');
  await expect(apply(page)).toBeFocused();
  await page.keyboard.press('Enter');
  const link = paragraph(page).locator('a[data-content-link="entity"]');
  await expect(link).toHaveAttribute('data-entity-type', 'project');
  await expect(link).toHaveAttribute('data-entity-id', project.projectUuid);
  await expect(link).not.toHaveAttribute('data-entity-fragment', /./);
});

test('a link being changed opens where it leads, and a heading no longer there says so', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const project = await createProject(page);
  const entity = `data-content-link="entity" data-entity-type="project-section" data-entity-id="${project.section.entityId}"`;
  await openEditor(
    page,
    `See <a ${entity} data-entity-fragment="${project.results}">kept</a> and <a ${entity} data-entity-fragment="gone-away">lost</a>`,
  );

  await openExisting(page, 'kept');
  await expect(picker(page)).toHaveAttribute('data-link-level', 'section');
  await expect(picker(page).locator('[data-link-path-entity]')).toContainText(
    project.title,
  );
  await expect(place(page)).toContainText('Results');
  await expect(place(page)).toBeFocused();
  await expect(picker(page).locator('[data-link-remove]')).toBeVisible();
  // Pressed one after another, as fast as a hand does: the section, the
  // project, then the popup — never the editor under it.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(picker(page)).toHaveCount(0);
  await expect(paragraph(page)).toBeVisible();

  await openExisting(page, 'lost');
  await expect(picker(page)).toHaveAttribute('data-link-level', 'section');
  await expect(place(page)).toContainText('gone-away');
  await expect(apply(page)).toBeDisabled();
  // Pointed at the whole section instead, it can be made again.
  await place(page).click();
  await option(page, 'whole').click();
  await expect(apply(page)).toBeEnabled();
  await apply(page).click();
  const lost = paragraph(page).locator('a', { hasText: 'lost' });
  await expect(lost).toHaveAttribute('data-entity-type', 'project-section');
  await expect(lost).not.toHaveAttribute('data-entity-fragment', /./);
  await expect(
    paragraph(page).locator('a', { hasText: 'kept' }),
  ).toHaveAttribute('data-entity-fragment', project.results);
});

test('an address of this site opens its entity at the heading it names', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const project = await createProject(page);
  await openEditor(page, 'We read the goals');
  await linkLastWords(page, 'goals'.length);

  const address = new URL(
    `${project.url}#${project.goals}`,
    page.url(),
  ).toString();
  // Typed, it opens on Enter: a pause in typing never takes the field away.
  await field(page).fill(address);
  await page.waitForTimeout(800);
  await expect(picker(page)).toHaveAttribute('data-link-level', 'search');
  await page.keyboard.press('Enter');
  await expect(picker(page)).toHaveAttribute('data-link-level', 'entity');
  await expect(place(page)).toContainText('Goals');
  await expect(apply(page)).toBeFocused();
  await page.keyboard.press('Enter');
  const link = paragraph(page).locator('a[data-content-link="entity"]');
  await expect(link).toHaveAttribute('data-entity-type', 'project');
  await expect(link).toHaveAttribute('data-entity-fragment', project.goals);
});

for (const [name, size] of SIZES) {
  test(`every level of the link popup opens whole and on top (${name})`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    const project = await createProject(page);
    await openEditor(page, 'We read the results');
    await linkLastWords(page, 'results'.length);
    const popup = page
      .locator('[data-floating-popup]')
      .filter({ has: page.locator('[data-link-picker]') });
    // Editor.js's own toolbar fades out under it.
    await expect(
      page.locator('.ce-inline-toolbar .ce-popover--opened'),
    ).toHaveCount(0);
    await expectPopupUsable(page, popup);

    await field(page).fill(project.title);
    await expect(picker(page).locator('[role="option"]').first()).toContainText(
      project.title,
    );
    await page.keyboard.press('ArrowRight');
    await expect(option(page, 'whole')).toBeVisible();
    await expectPopupUsable(page, selectPopup(page));

    await option(page, `s:${project.section.entityId}`).click();
    await expect(picker(page)).toHaveAttribute('data-link-level', 'section');
    await expect(option(page, `h:${project.results}`)).toBeVisible();
    await expectPopupUsable(page, selectPopup(page));
    await page.keyboard.press('Escape');
    await expect(selectPopup(page)).toHaveCount(0);
    await expectPopupUsable(page, popup);
  });
}

/** A new link block after the last one, its picker open. */
async function addLinkBlock(page: Page) {
  await page.locator('dialog .content-editor .ce-block').last().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.locator('dialog .ce-toolbar__plus').click();
  await page.locator('dialog [data-block-tile="entityLink"]').click();
  await expect(page.locator('dialog [data-link-picker="block"]')).toBeVisible();
  await expect(field(page)).toBeFocused();
}

test('the link block takes a heading of an entity, another site, or a video', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await stubExternalLinks(page);
  const project = await createProject(page);
  const { save, stored } = await openEditor(page, 'Links below.');

  // A video is its own block.
  await addLinkBlock(page);
  await field(page).fill(VIDEO);
  await expect(picker(page).locator('[data-link-integration]')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(picker(page)).toHaveCount(0);

  // Another site is a card of its own.
  await addLinkBlock(page);
  await field(page).fill(BLOCK_SITE);
  await expect(picker(page)).toContainText('Stubbed block.example');
  await page.keyboard.press('Enter');
  await expect(picker(page)).toHaveCount(0);

  // An entity, at a heading of it.
  await addLinkBlock(page);
  await field(page).fill(project.title);
  await expect(picker(page).locator('[role="option"]').first()).toContainText(
    project.title,
  );
  await page.keyboard.press('ArrowRight');
  await option(page, `h:${project.goals}`).click();
  await expect(apply(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(picker(page)).toHaveCount(0);

  await expect(save).toHaveText('Save');
  await save.click();
  await expect(save).toHaveText('Saved');
  const blocks = await stored([
    'paragraph',
    'integration',
    'externalLink',
    'entityLink',
  ]);
  expect(blocks[2]!.data).toMatchObject({
    url: BLOCK_SITE,
  });
  expect(blocks[3]!.data).toMatchObject({
    entityType: 'project',
    entityId: project.projectUuid,
    fragment: project.goals,
  });
});

test('a card’s “Change link” opens the picker where it leads', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await stubExternalLinks(page);
  const project = await createProject(page);
  const { save, stored } = await openEditor(page, 'Cards below.', [
    {
      type: 'entityLink',
      data: {
        entityType: 'project',
        entityId: project.projectUuid,
        fragment: project.goals,
      },
    },
    { type: 'externalLink', data: { url: LISTED_SITE } },
    {
      type: 'entityLink',
      data: {
        entityType: 'project',
        entityId: project.projectUuid,
        fragment: 'gone-away',
      },
    },
    {
      type: 'entityLink',
      data: {
        entityType: 'project',
        entityId: project.projectUuid,
        fragment: 'project-sections',
      },
    },
  ]);
  const blocks = page.locator('dialog .content-editor .ce-block');
  const chip = (index: number) =>
    blocks.nth(index).locator('[data-link-fragment]');

  // Each card says where in its target it leads: a heading by its words, a
  // heading no longer there as gone, a place of the page as its name.
  await expect(chip(1)).toContainText('§Goals');
  await expect(chip(3)).toHaveAttribute('data-link-fragment-gone', 'true');
  await expect(chip(4)).toContainText('#project-sections');
  await expect(chip(4)).not.toHaveAttribute('data-link-fragment-gone');

  async function changeLink(index: number) {
    await blocks.nth(index).hover();
    await page.locator('dialog .ce-toolbar__settings-btn').click();
    await page
      .locator('.ce-popover--opened .ce-popover-item', {
        hasText: 'Change link',
      })
      .click();
    await expect(picker(page)).toBeVisible();
  }

  // The entity's card opens at its level, the heading chosen; the whole of
  // it is chosen instead.
  await changeLink(1);
  await expect(picker(page)).toHaveAttribute('data-link-level', 'entity');
  await expect(place(page)).toContainText('Goals');
  await place(page).click();
  await option(page, 'whole').click();
  await page.keyboard.press('Enter');
  await expect(picker(page)).toHaveCount(0);

  // The other site's card opens on its address; a video there makes it one.
  await changeLink(2);
  await expect(field(page)).toHaveValue(LISTED_SITE);
  await field(page).fill(VIDEO);
  await expect(picker(page).locator('[data-link-integration]')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(picker(page)).toHaveCount(0);
  // The card is a video now: the block it became stands in its place.
  await expect(
    blocks.nth(2).locator('[data-content-integration="youtube"]'),
  ).toBeVisible();

  // A place of the page is no lost heading: it is kept, and ✓ takes it.
  await changeLink(4);
  await expect(place(page)).toContainText('project-sections');
  await expect(place(page)).not.toHaveAttribute('aria-label', /gone/);
  await expect(apply(page)).toBeEnabled();
  await apply(page).click();
  await expect(picker(page)).toHaveCount(0);

  await expect(save).toHaveText('Save');
  await save.click();
  await expect(save).toHaveText('Saved');
  const saved = await stored([
    'paragraph',
    'entityLink',
    'integration',
    'entityLink',
    'entityLink',
  ]);
  expect(saved[1]!.data.fragment).toBeUndefined();
  expect(saved[3]!.data.fragment).toBe('gone-away');
  expect(saved[4]!.data.fragment).toBe('project-sections');
});

test('a link block left without a choice is not kept', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { save, stored } = await openEditor(page, 'Nothing below.');
  await addLinkBlock(page);
  await page.keyboard.press('Escape');
  await expect(picker(page)).toHaveCount(0);
  // An empty paragraph was replaced by the block; the text is as it was.
  await page.locator('dialog .content-editor .ce-paragraph').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Still.');
  await expect(save).toHaveText('Save');
  await save.click();
  await expect(save).toHaveText('Saved');
  // Saved with the words added, and without the block.
  await expect
    .poll(async () => JSON.stringify(await stored(['paragraph'])))
    .toContain('Still.');
});

// ---- A link made while typing, and leaving the markup of words -------------

const atHighlighted = (page: Page) =>
  page.evaluate(() => CSS.highlights.has('content-editor-at'));
const pickerPopup = (page: Page) =>
  page
    .locator('[data-floating-popup]')
    .filter({ has: page.locator('[data-link-picker]') });

test('an @ standing alone opens the picker at it, and the link it makes is typed over', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const project = await createProject(page);
  const { save, stored } = await openEditor(page, 'We went');
  await paragraph(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' @');
  await expect(field(page)).toBeFocused();
  expect(await atHighlighted(page)).toBe(true);
  await expectPopupUsable(page, pickerPopup(page));

  await field(page).fill(project.title);
  await expect(picker(page).locator('[role="option"]').first()).toContainText(
    project.title,
  );
  await page.keyboard.press('Enter');
  await expect(apply(page)).toBeFocused();
  await page.keyboard.press('Enter');

  // The @ is the link now, named after what it leads to, the name selected.
  const link = paragraph(page).locator('a[data-content-link="entity"]');
  await expect(link).toHaveText(project.title);
  await expect(link).toHaveAttribute('data-entity-id', project.projectUuid);
  expect(await page.evaluate(() => getSelection()!.toString())).toBe(
    project.title,
  );
  expect(await atHighlighted(page)).toBe(false);
  // Editor.js's own toolbar stays away from that selection.
  await page.waitForTimeout(400);
  await expect(
    page.locator('.ce-inline-toolbar .ce-popover--opened'),
  ).toHaveCount(0);

  // Typed over, the words change and the link stays.
  await page.keyboard.type('the trip');
  await expect(link).toHaveText('the trip');
  // → steps out of it; what follows is no part of the link.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type(' together');
  await expect(link).toHaveText('the trip');
  await expect(paragraph(page)).toHaveText('We went the trip together');

  await save.click();
  await expect(save).toHaveText('Saved');
  const [block] = await stored(['paragraph']);
  expect(block!.data.text).toContain('>the trip</a> together');

  // Back step by step — the words after, the link's own letter by letter,
  // the link — to the @ as typed, and never past a step into nonsense.
  const seen: string[] = [];
  // A space typed at the end of a line is the browser's no-break one.
  const nbsp = String.fromCharCode(160);
  for (let step = 0; step < 16; step++) {
    const text = ((await paragraph(page).textContent()) ?? '')
      .split(nbsp)
      .join(' ');
    seen.push(text);
    if (text === 'We went @') break;
    await page.keyboard.press('Control+z');
  }
  expect(seen.at(-1)).toBe('We went @');
  expect(seen).toContain('We went the trip');
  expect(seen).toContain(`We went ${project.title}`);
  await expect(link).toHaveCount(0);
});

test('a space after a link the @ made keeps its name, and a composed word goes into it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const project = await createProject(page);
  await openEditor(page, 'We went');
  const nbsp = String.fromCharCode(160);
  const words = async () =>
    ((await paragraph(page).textContent()) ?? '').split(nbsp).join(' ');

  async function pick() {
    await page.keyboard.type(' @');
    await expect(field(page)).toBeFocused();
    await field(page).fill(project.title);
    await expect(picker(page).locator('[role="option"]').first()).toContainText(
      project.title,
    );
    await page.keyboard.press('Enter');
    await expect(apply(page)).toBeFocused();
    await page.keyboard.press('Enter');
  }

  await paragraph(page).click();
  await page.keyboard.press('End');
  await pick();
  const links = paragraph(page).locator('a[data-content-link="entity"]');
  await expect(links.first()).toHaveText(project.title);
  // A space accepts the name: it is typed after the link, and so is what
  // follows it.
  await page.keyboard.type(' by boat');
  await expect(links.first()).toHaveText(project.title);
  expect(await words()).toBe(`We went ${project.title} by boat`);

  // A word a phone's keyboard composes over the selected name replaces it,
  // and the link stays.
  await pick();
  await expect(links).toHaveCount(2);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', {
    text: 'по',
    selectionStart: 2,
    selectionEnd: 2,
  });
  await cdp.send('Input.imeSetComposition', {
    text: 'поход',
    selectionStart: 5,
    selectionEnd: 5,
  });
  await cdp.send('Input.insertText', { text: 'поход' });
  await expect(links).toHaveCount(2);
  await expect(links.nth(1)).toHaveText('поход');
});

test('an @ beside a letter is only typed, and one given up keeps what was typed after it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openEditor(page, 'Write to');
  await paragraph(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' me@home');
  await expect(picker(page)).toHaveCount(0);
  // Right before a word, too.
  await page.keyboard.press('Home');
  await page.keyboard.type('@');
  await expect(picker(page)).toHaveCount(0);

  // Given up with Escape: the @ and the search, as if typed in the text.
  await page.keyboard.press('End');
  await page.keyboard.type(' @');
  await expect(field(page)).toBeFocused();
  await expectPopupUsable(page, pickerPopup(page));
  await page.keyboard.type('gwy');
  await page.keyboard.press('Escape');
  await expect(picker(page)).toHaveCount(0);
  expect(await atHighlighted(page)).toBe(false);
  await expect(paragraph(page)).toHaveText('@Write to me@home @gwy');
  // The caret stands after it, and typing goes on there.
  await page.keyboard.type('nerva');
  await expect(paragraph(page)).toHaveText('@Write to me@home @gwynerva');

  // Given up by a tap elsewhere in the text — on a phone the picker is a
  // sheet, and the tap lands on the shade over the text: the same.
  await page.keyboard.type(' @');
  await expect(field(page)).toBeFocused();
  await page.keyboard.type('x');
  const text = (await paragraph(page).boundingBox())!;
  await page.mouse.click(text.x + 4, text.y + 4);
  await expect(picker(page)).toHaveCount(0);
  await expect(paragraph(page)).toHaveText('@Write to me@home @gwynerva @x');
});

/** The caret at an offset of the first text inside `selector`. */
async function caretIn(page: Page, selector: string, offset: 'start' | 'end') {
  await page.evaluate(
    ({ selector, offset }) => {
      const element = document.querySelector(selector)!;
      const text = element.firstChild as Text;
      const range = document.createRange();
      range.setStart(text, offset === 'start' ? 0 : text.data.length);
      range.collapse(true);
      (element.closest('[contenteditable="true"]') as HTMLElement).focus();
      const selection = getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    },
    { selector, offset },
  );
}

test('→ at the last letter of bold or a hint steps out of it, ← at its first, as one step back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { save, stored } = await openEditor(
    page,
    'A <abbr data-content-hint="what it is">hint</abbr> and <b>bold</b>',
  );
  const bold = paragraph(page).locator('b');
  const hint = paragraph(page).locator('abbr');
  await paragraph(page).click();
  await page.keyboard.press('End');
  // The browser would type into the bold here; → steps out first.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('!?');
  await expect(bold).toHaveText('bold');
  await expect(paragraph(page)).toHaveText('A hint and bold!?');
  // The letters typed outside come back off; the bold stays as it was.
  await page.keyboard.press('Control+z');
  await expect(bold).toHaveText('bold');
  await expect(paragraph(page)).not.toContainText('!?');

  await caretIn(page, 'dialog .ce-paragraph abbr', 'start');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('«');
  await expect(hint).toHaveText('hint');
  await expect(paragraph(page)).toContainText('A «hint');

  // A word a phone's keyboard composes is moved out when it is done.
  await caretIn(page, 'dialog .ce-paragraph b', 'end');
  await page.keyboard.press('ArrowRight');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', {
    text: 'да',
    selectionStart: 2,
    selectionEnd: 2,
  });
  await cdp.send('Input.insertText', { text: 'да' });
  await expect(bold).toHaveText('bold');
  await expect(paragraph(page)).toContainText('boldда');

  await save.click();
  await expect(save).toHaveText('Saved');
  const [block] = await stored(['paragraph']);
  expect(block!.data.text).toContain('«<abbr');
  expect(block!.data.text).toContain('<b>bold</b>да');
});

test('the markup the caret is in is ringed, and words typed beside it go outside it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(
    page,
    'Say <b>bold</b>N1 and <a href="https://noted.example/">a <i>nested</i> link</a>',
  );
  const rings = page.locator(
    'dialog .content-inline-ring:not(.content-inline-ring--leaving)',
  );
  const bold = paragraph(page).locator('b');

  await paragraph(page).click();
  await page.keyboard.press('End');
  await expect(rings).toHaveCount(0);

  // In the italic inside the link: both are ringed.
  await caretIn(page, 'dialog .ce-paragraph a i', 'end');
  await expect(rings).toHaveCount(2);

  // In the bold, then out of it by →: the ring goes.
  await caretIn(page, 'dialog .ce-paragraph b', 'end');
  await expect(rings).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await expect(rings).toHaveCount(0);

  // Right after it, at the start of the words that follow, as the ring
  // says: what is typed there is no part of it.
  await page.evaluate(() => {
    const after = document.querySelector('dialog .ce-paragraph b')!
      .nextSibling as Text;
    const range = document.createRange();
    range.setStart(after, 0);
    range.collapse(true);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await expect(rings).toHaveCount(0);
  await page.keyboard.type('X');
  await expect(bold).toHaveText('bold');
  await expect(paragraph(page)).toContainText('boldXN1');

  // Out of the text, no ring.
  await caretIn(page, 'dialog .ce-paragraph b', 'end');
  await expect(rings).toHaveCount(1);
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await expect(rings).toHaveCount(0);
});

test('each edge of markup takes an arrow press of its own, in and out', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(
    page,
    'aa <b>bold</b>XY <a href="https://noted.example/">link</a> zz',
  );
  const rings = page.locator(
    'dialog .content-inline-ring:not(.content-inline-ring--leaving)',
  );
  const bold = paragraph(page).locator('b');
  const link = paragraph(page).locator('a');
  /** The words the caret is in and its place in them, or the element's. */
  const where = () =>
    page.evaluate(() => {
      const selection = getSelection()!;
      const node = selection.focusNode!;
      const name =
        node.nodeType === Node.TEXT_NODE
          ? (node as Text).data.trim()
          : node.nodeName;
      return `${name}@${selection.focusOffset}`;
    });
  async function press(key: string, at: string, ringed: number) {
    await page.keyboard.press(key);
    expect(await where()).toBe(at);
    await expect(rings).toHaveCount(ringed);
  }

  await paragraph(page).click();
  await page.evaluate(() => {
    const after = document.querySelector('dialog .ce-paragraph b')!
      .nextSibling as Text;
    const range = document.createRange();
    range.setStart(after, 2);
    range.collapse(true);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  // Leftward: the place after the bold, into it, then its letters; at its
  // first, the place inside, then out before it.
  await press('ArrowLeft', 'XY@1', 0);
  await press('ArrowLeft', 'XY@0', 0);
  await press('ArrowLeft', 'bold@4', 1);
  await press('ArrowLeft', 'bold@3', 1);
  await press('ArrowLeft', 'bold@2', 1);
  await press('ArrowLeft', 'bold@1', 1);
  await press('ArrowLeft', 'bold@0', 1);
  await page.keyboard.press('ArrowLeft');
  await expect(rings).toHaveCount(0);
  // Typed there, outside it, as the ring says.
  await page.keyboard.type('Z');
  await expect(bold).toHaveText('bold');
  // Rightward: into it before any letter is passed.
  await page.keyboard.press('ArrowRight');
  await expect(rings).toHaveCount(1);
  await page.keyboard.type('Y');
  await expect(bold).toHaveText('Ybold');

  // At the end inside a link, what is typed goes into it, though the
  // browser keeps clear of a link's edge.
  await caretIn(page, 'dialog .ce-paragraph a', 'end');
  await expect(rings).toHaveCount(1);
  await page.keyboard.type('s');
  await expect(link).toHaveText('links');
  await page.keyboard.press('ArrowRight');
  await expect(rings).toHaveCount(0);
  await page.keyboard.type('!');
  await expect(link).toHaveText('links');
  const nbsp = String.fromCharCode(160);
  expect(
    ((await paragraph(page).textContent()) ?? '').split(nbsp).join(' '),
  ).toBe('aa ZYboldXY links! zz');
});

test('markup emptied by Backspace waits for its words, and one more Backspace lets it go', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { save, stored } = await openEditor(page, 'Say <b>bold</b>');
  const bold = paragraph(page).locator('b');
  const kept = page.locator('dialog .content-inline-kept');
  const html = () => paragraph(page).innerHTML();

  // By the keys, as a person gets there: Editor.js reads the caret its way.
  await paragraph(page).click();
  await page.keyboard.press('End');
  for (let step = 0; step < 4; step++) await page.keyboard.press('Backspace');
  // Nothing of it is in the text, and the caret says it waits.
  await expect(bold).toHaveCount(0);
  await expect(kept).toBeVisible();
  // What is typed goes back into it, dressed in nothing else.
  await page.keyboard.type('new');
  await expect(bold).toHaveText('new');
  await expect(kept).toHaveCount(0);
  expect(await html()).not.toContain('<font');

  // Back step by step to the bold as it was, never into nonsense.
  let restored = false;
  for (let step = 0; step < 12 && !restored; step++) {
    await page.keyboard.press('Control+z');
    restored = (await html()).includes('<b>bold</b>');
  }
  expect(restored).toBe(true);

  // Emptied again, one more Backspace lets it go and deletes nothing else.
  await page.keyboard.press('End');
  for (let step = 0; step < 4; step++) await page.keyboard.press('Backspace');
  await expect(kept).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(kept).toHaveCount(0);
  await page.keyboard.type('x');
  await expect(bold).toHaveCount(0);
  const nbsp = String.fromCharCode(160);
  expect(((await paragraph(page).textContent()) ?? '').replace(nbsp, ' ')).toBe(
    'Say x',
  );

  await save.click();
  await expect(save).toHaveText('Saved');
  const [block] = await stored(['paragraph']);
  expect(block!.data.text).not.toContain('<b>');
});

test('the last Delete of an emptied mark at the edge of a block joins no blocks', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page, '<i>Hi</i>', [
    { type: 'paragraph', data: { text: 'Next line' } },
  ]);
  const blocks = page.locator('dialog .content-editor .ce-paragraph');
  const kept = page.locator('dialog .content-inline-kept');
  await blocks.first().click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Delete');
  await expect(kept).toBeVisible();
  // Editor.js would take this one to join the next block to this one.
  await page.keyboard.press('Delete');
  await expect(kept).toHaveCount(0);
  await expect(blocks).toHaveCount(2);
  await expect(blocks.nth(1)).toHaveText('Next line');
});

test('End and Home leave the caret outside the markup the words end or begin with', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(
    page,
    '<b>Bold</b> middle <a href="https://noted.example/">link</a>',
  );
  const rings = page.locator(
    'dialog .content-inline-ring:not(.content-inline-ring--leaving)',
  );
  await paragraph(page).click();
  await page.keyboard.press('End');
  await expect(rings).toHaveCount(0);
  await page.keyboard.type('!');
  await page.keyboard.press('Home');
  await expect(rings).toHaveCount(0);
  await page.keyboard.type('>');
  await expect(paragraph(page).locator('a')).toHaveText('link');
  await expect(paragraph(page).locator('b')).toHaveText('Bold');
  await expect(paragraph(page)).toHaveText('>Bold middle link!');
});

test('the last Backspace of an emptied mark beside a private edge is the mark’s', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page, 'Before', [
    {
      type: 'privateSectionBoundary',
      data: { sectionId: 'one', edge: 'start' },
    },
    { type: 'paragraph', data: { text: '<i>Hi</i>' } },
    { type: 'privateSectionBoundary', data: { sectionId: 'one', edge: 'end' } },
    { type: 'paragraph', data: { text: 'After' } },
  ]);
  const blocks = page.locator('dialog .content-editor .ce-paragraph');
  const kept = page.locator('dialog .content-inline-kept');
  await blocks.nth(1).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(kept).toBeVisible();
  // The edge would take it to step the caret out of the section.
  await page.keyboard.press('Backspace');
  await expect(kept).toHaveCount(0);
  await page.keyboard.type('x');
  await expect(blocks.nth(1)).toHaveText('x');
  await expect(blocks.first()).toHaveText('Before');
  await expect(
    page.locator('dialog .content-editor [data-private-section-id]'),
  ).toHaveCount(2);
});

test('a line with a link pasted into a link keeps that link whole', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(
    page,
    'See <a href="https://outer.example/">Alpha Beta</a> end',
  );
  await paragraph(page).click();
  await page.evaluate(() => {
    const text = document.querySelector('dialog .ce-paragraph a')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 'Alpha'.length);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    const data = new DataTransfer();
    data.setData('text/plain', 'Gamma more');
    data.setData(
      'text/html',
      '<a href="https://inner.example/">Gamma</a> more',
    );
    text.parentElement!.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  const links = paragraph(page).locator('a');
  await expect(links).toHaveCount(1);
  await expect(links).toHaveText('AlphaGamma more Beta');
  await expect(links).toHaveAttribute('href', 'https://outer.example/');
});

test('markup made or written into inside bold stays inside the bold', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { save, stored } = await openEditor(
    page,
    'Say <b>one two <a href="https://noted.example/">link</a></b> end',
  );
  const html = () => paragraph(page).innerHTML();
  await paragraph(page).click();

  // A hint on a word of the bold: the browser would split the bold round it.
  await page.evaluate(() => {
    const text = document.querySelector('dialog .ce-paragraph b')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 7);
    range.collapse(true);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  for (let step = 0; step < 3; step++)
    await page.keyboard.press('Shift+ArrowLeft');
  await page
    .locator('.ce-popover--opened [data-item-name="contentHint"]')
    .click();
  await page.keyboard.type('a number');
  await page.keyboard.press('Enter');
  await expect(paragraph(page).locator('b abbr')).toHaveText('two');
  expect(await html()).not.toContain('</b><abbr');

  // Letters typed at the end of the link inside the bold: into the link,
  // still in the bold, and three dots are an ellipsis as anywhere.
  await caretIn(page, 'dialog .ce-paragraph a', 'end');
  await page.keyboard.type('s...');
  await expect(paragraph(page).locator('b a')).toHaveText('links…');

  // A line pasted in the middle of the bold goes into it.
  await page.evaluate(() => {
    const text = document.querySelector('dialog .ce-paragraph b')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 4);
    range.collapse(true);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    const data = new DataTransfer();
    data.setData('text/plain', 'pasted ');
    text.parentElement!.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(paragraph(page).locator('b').first()).toContainText(
    'one pasted two',
  );
  expect(await paragraph(page).locator('b').count()).toBe(1);

  await save.click();
  await expect(save).toHaveText('Saved');
  const [block] = await stored(['paragraph']);
  expect(block!.data.text).toMatch(
    /^Say <b>one pasted <abbr data-content-hint="a number">two<\/abbr> <a [^>]+>links…<\/a><\/b> end$/,
  );
});

test('a link typed over or emptied keeps its address and takes what is typed', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(
    page,
    'Read <a href="https://noted.example/">site</a> and <abbr data-content-hint="a short word">hint</abbr>',
  );
  const link = paragraph(page).locator('a');
  const hint = paragraph(page).locator('abbr');
  const kept = page.locator('dialog .content-inline-kept');

  await paragraph(page).click();
  // Its words selected and typed over: the new ones go into it, letter by
  // letter, though the browser keeps clear of a link's end.
  await page.evaluate(() => {
    const anchor = document.querySelector('dialog .ce-paragraph a')!;
    (anchor.closest('[contenteditable="true"]') as HTMLElement).focus();
    const range = document.createRange();
    range.selectNodeContents(anchor);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.type('page');
  await expect(link).toHaveText('page');
  await expect(link).toHaveAttribute('href', 'https://noted.example/');

  // Emptied, it waits; typed into, it is back with its address.
  for (let step = 0; step < 4; step++) await page.keyboard.press('Backspace');
  await expect(link).toHaveCount(0);
  await expect(kept).toBeVisible();
  await page.keyboard.type('notes');
  await expect(link).toHaveText('notes');
  await expect(link).toHaveAttribute('href', 'https://noted.example/');
  // → steps out; what follows is no part of it.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type(' too');
  await expect(link).toHaveText('notes');

  // A hint keeps what it says the same way.
  await caretIn(page, 'dialog .ce-paragraph abbr', 'end');
  for (let step = 0; step < 4; step++) await page.keyboard.press('Backspace');
  await expect(kept).toBeVisible();
  await page.keyboard.type('word');
  await expect(hint).toHaveText('word');
  await expect(hint).toHaveAttribute('data-content-hint', 'a short word');

  // Emptied, then left: the caret moved away lets it go.
  for (let step = 0; step < 4; step++) await page.keyboard.press('Backspace');
  await expect(kept).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(kept).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('s');
  await expect(hint).toHaveCount(0);
});

test('a click past the end of bold at the end of a line puts the caret outside it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page, 'Read <b>this</b>');
  const bold = paragraph(page).locator('b');
  const box = (await bold.boundingBox())!;
  await page.mouse.click(box.x + box.width + 40, box.y + box.height / 2);
  await page.keyboard.type(' now');
  await expect(bold).toHaveText('this');
  await expect(paragraph(page)).toHaveText('Read this now');
});
