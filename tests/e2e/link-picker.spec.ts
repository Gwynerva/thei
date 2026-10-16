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
  await expect(picker(page).locator('[role="option"]').first()).toContainText(
    project.title,
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
