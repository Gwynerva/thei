import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * The owner's note on a link: why it is there, under what the page says of
 * itself — in the hand-made list, in a link block, in the popup over a link
 * in the text and in the sidebar. The sites are stored by the fixture's seed
 * as though they had been read, so nothing here goes out to the network.
 */

test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});

const NOTED = 'https://noted.example/';
const LISTED = 'https://listed.example/';
const BLOCK = 'https://block.example/';
const SILENT = 'https://silent.example/';
const REPEATED = 'This link is already in the project description.';

let errors: string[] = [];

test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function createProject(page: Page) {
  const stamp = Date.now();
  const response = await page.request.post('/api/admin/projects', {
    data: {
      title: `Noted links ${stamp}`,
      summary: 'A project whose links say why they are there.',
      access: 'public',
      humanReadableSlug: 'noted-links',
      publicId: `noted${stamp}`,
      showcase: false,
      cv: false,
      descriptionContent: {
        data: {
          blocks: [
            {
              type: 'paragraph',
              data: {
                text: `Read <a href="${NOTED}" data-content-link="external" data-content-note="In the text">the notes</a> first.`,
              },
            },
            {
              type: 'externalLink',
              data: { url: BLOCK, note: 'Why the block' },
            },
          ],
        },
      },
      externalLinks: [
        { url: NOTED, note: 'By hand', isPrivate: false },
        { url: LISTED, note: '', isPrivate: false },
      ],
    },
  });
  const result = await response.json();
  expect(result.type, JSON.stringify(result)).toBe('success');
  return {
    uuid: result.projectUuid as string,
    path: `/projects/noted-links-noted${stamp}/`,
  };
}

test('a hand-made link the description repeats is marked', async ({ page }) => {
  const project = await createProject(page);
  await page.goto(`/admin/projects/${project.uuid}/edit/`);
  await page.waitForLoadState('networkidle');

  // Each chip is named by the page's own title, not by the owner's words.
  const noted = page.locator('.external-link-chip', { hasText: 'Noted site' });
  const listed = page.locator('.external-link-chip', {
    hasText: 'Listed site',
  });
  await expect(noted).toHaveClass(/ring-2/);
  await expect(noted.getByRole('img', { name: REPEATED })).toBeVisible();
  await expect(listed).not.toHaveClass(/ring-2/);
  await expect(listed.getByRole('img', { name: REPEATED })).toHaveCount(0);

  // The popup says so too, where a touch screen has no hover to read it.
  await noted.click();
  await expect(
    page.getByRole('status').filter({ hasText: REPEATED }),
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'A note for the link' }),
  ).toHaveValue('By hand');
});

test('the page shows every note once, and both of two that differ', async ({
  page,
}) => {
  const project = await createProject(page);
  await page.goto(project.path);
  await page.waitForLoadState('networkidle');

  // A block shows its note as the last line of its card.
  const block = page.locator('.external-link-preview', {
    hasText: 'Block site',
  });
  await expect(block).toContainText('Why the block');
  await expect(block.getByText('Why the block')).toHaveCSS(
    'font-style',
    'italic',
  );

  // The same address by hand and in the text, with different notes: both.
  const sidebar = page.locator('aside').first();
  await expect(sidebar.getByText('By hand')).toBeVisible();
  await expect(sidebar.getByText('In the text')).toBeVisible();
  // One of a link's copies has a note, the other none: one line.
  await expect(sidebar.getByText('Why the block')).toHaveCount(1);
  await expect(sidebar.getByText('Noted site', { exact: true })).toHaveCount(2);
  await expect(sidebar.getByText('Listed site', { exact: true })).toHaveCount(
    1,
  );

  // The popup over a link in the text ends with the note.
  await page.getByRole('link', { name: 'the notes' }).hover();
  const popup = page.locator('.external-link-preview', {
    hasText: 'In the text',
  });
  await expect(popup).toBeVisible();
  await expect(popup).toContainText('Noted site');
});

test.describe('in the text editor', () => {
  async function openEditor(page: Page, blocks: object[]) {
    const stamp = Date.now();
    const response = await page.request.post('/api/admin/pages', {
      data: {
        title: `Link notes ${stamp}`,
        summary: 'A page for the link notes spec.',
        slug: `link-notes-${stamp}`,
        access: 'public',
        content: { data: { blocks } },
        reminder: '',
        notes: null,
      },
    });
    const result = await response.json();
    expect(result.type, JSON.stringify(result)).toBe('success');
    await page.goto(`/admin/pages/${result.pageUuid}/edit/`);
    await page.waitForLoadState('networkidle');
    await page.locator('button[data-field]').first().click();
    const save = page
      .locator('dialog')
      .getByRole('button', { name: 'Save', exact: true });
    await expect(save).toHaveText('Saved', { timeout: 15_000 });
    return { uuid: result.pageUuid as string, save };
  }

  /** Every text the save control shows from now on, to catch a flash. */
  async function recordSaveTexts(page: Page) {
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('dialog button')].find(
        (item) => item.getAttribute('aria-label') === 'Save',
      )!;
      const texts: string[] = [];
      (window as unknown as { saveTexts: string[] }).saveTexts = texts;
      new MutationObserver(() => {
        const text = button.textContent?.trim() ?? '';
        if (texts.at(-1) !== text) texts.push(text);
      }).observe(button, {
        subtree: true,
        characterData: true,
        childList: true,
      });
    });
    return () =>
      page.evaluate(
        () => (window as unknown as { saveTexts: string[] }).saveTexts,
      );
  }

  test('a note is written in the card and saved, without a flash', async ({
    page,
  }) => {
    const { uuid, save } = await openEditor(page, [
      { type: 'externalLink', data: { url: SILENT } },
    ]);
    const card = page.locator('dialog .external-link-preview');

    // A site that never answered says so upright and in red, apart from the
    // italic note.
    const hint = card.getByText('The site did not answer', { exact: false });
    await expect(hint).toHaveCSS('font-style', 'normal');
    await expect(hint).toHaveClass(/text-text-error/);

    // The card is not a link in the editor: a field lives inside it.
    await expect(page.locator('dialog a.external-link-preview')).toHaveCount(0);
    const note = card.getByRole('textbox', {
      name: 'A note for the link',
    });
    const saveTexts = await recordSaveTexts(page);

    // Going in and out of the empty field changes nothing.
    await note.click();
    await page.waitForTimeout(100);
    await note.evaluate((field) => (field as HTMLElement).blur());
    await page.waitForTimeout(100);
    expect(await saveTexts()).toEqual([]);

    await note.click();
    await page.keyboard.type('Worth a look');
    await expect(save).toHaveText('Save');
    await save.click();
    await expect(save).toHaveText('Saved');

    const stored = await (
      await page.request.get(`/api/admin/pages/${uuid}`)
    ).json();
    expect(stored.content.data.blocks[0].data).toMatchObject({
      url: SILENT,
      note: 'Worth a look',
    });
  });
});
