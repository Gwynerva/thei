import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { uploadFile, uploadText } from './helpers/upload';

/**
 * Files in a text: whatever is pasted or picked goes where the one rule
 * puts it — pictures to a picture or a gallery, any other file to a player,
 * a file or a group — each stored at its block's defaults; a group's files
 * are moved by their grips; a picture is shown as a file and back as the
 * same block. None of it ever flashes the editor's state.
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

const blocks = (page: Page) => page.locator('.content-editor .ce-block');
const block = (page: Page, id: string) =>
  page.locator(`.content-editor .ce-block[data-id="${id}"]`);
const group = (page: Page) =>
  page.locator('.content-editor [data-content-file-group]');
const transitions = (page: Page) =>
  page.locator('[data-transitions]').getAttribute('data-transitions');

async function openFixture(page: Page) {
  await page.goto('/editor-regression');
  await expect(page.locator('[data-ready]')).toHaveAttribute(
    'data-ready',
    'true',
  );
}

/** A fresh empty paragraph at the end of the text, with the caret in it. */
async function emptyParagraph(page: Page) {
  const last = blocks(page).last();
  await last.scrollIntoViewIfNeeded();
  await last.locator('[contenteditable="true"]').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(
    blocks(page).last().locator('[contenteditable="true"]'),
  ).toHaveText('');
}

interface Pasted {
  name: string;
  type: string;
  bytes: Buffer;
}

/** Pastes files into whatever has the focus. */
async function paste(page: Page, files: Pasted[]) {
  await page.evaluate(
    (files) => {
      const data = new DataTransfer();
      for (const file of files) {
        const bytes = Uint8Array.from(atob(file.base64), (c) =>
          c.charCodeAt(0),
        );
        data.items.add(new File([bytes], file.name, { type: file.type }));
      }
      document.activeElement!.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    files.map((file) => ({ ...file, base64: file.bytes.toString('base64') })),
  );
}

/** A picture of a colour of its own, so no run finds it stored already. */
async function picture(name: string): Promise<Pasted> {
  const [r, g, b] = [0, 0, 0].map(() => Math.floor(Math.random() * 256));
  const bytes = await sharp({
    create: { width: 64, height: 48, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();
  return { name, type: 'image/png', bytes };
}

const text = (name: string, words: string): Pasted => ({
  name,
  type: 'text/plain',
  bytes: Buffer.from(words),
});

/** A short tone: 16-bit stereo WAV. */
function wav(name: string, seconds = 2): Pasted {
  const rate = 22_050;
  const samples = Math.round(seconds * rate);
  const bytes = Buffer.alloc(44 + samples * 4);
  bytes.write('RIFF', 0, 'latin1');
  bytes.writeUInt32LE(36 + samples * 4, 4);
  bytes.write('WAVEfmt ', 8, 'latin1');
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 4, 28);
  bytes.writeUInt16LE(4, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36, 'latin1');
  bytes.writeUInt32LE(samples * 4, 40);
  for (let index = 0; index < samples; index++) {
    const value = Math.round(
      Math.sin((2 * Math.PI * 440 * index) / rate) * 0.5 * 32_767,
    );
    bytes.writeInt16LE(value, 44 + index * 4);
    bytes.writeInt16LE(value, 46 + index * 4);
  }
  return { name, type: 'audio/wav', bytes };
}

/**
 * What each new file was asked to be stored as, by the extension it was
 * staged under: the draft a file is staged as names its extension, and its
 * commit what to make of it.
 */
function requestedSettings(page: Page) {
  const extensionOf = new Map<string, string>();
  const typeOf = new Map<string, string>();
  page.on('response', async (response) => {
    if (
      response.request().method() !== 'POST' ||
      new URL(response.url()).pathname !== '/api/admin/assets/drafts' ||
      !response.ok()
    )
      return;
    const draft = (await response.json()) as {
      draftId: string;
      extension: string;
    };
    extensionOf.set(draft.draftId, draft.extension);
  });
  page.on('request', (request) => {
    const match = /\/drafts\/([^/]+)\/commit$/.exec(
      new URL(request.url()).pathname,
    );
    if (!match || request.method() !== 'POST') return;
    const body = request.postDataJSON() as { settings: { type: string } };
    typeOf.set(match[1]!, body.settings.type);
  });
  return () =>
    Object.fromEntries(
      [...typeOf].map(([draftId, type]) => [extensionOf.get(draftId), type]),
    );
}

test('pasted files of every kind become a gallery and a group, each kept as its block keeps it', async ({
  page,
}) => {
  await openFixture(page);
  const requested = requestedSettings(page);
  const galleries = page.locator('.content-editor [data-content-gallery]');
  const before = await galleries.count();
  await emptyParagraph(page);
  await paste(page, [
    text('notes.txt', 'Shopping list'),
    await picture('one.png'),
    wav('Voice memo.wav'),
    await picture('two.png'),
  ]);

  // The pictures first, as one gallery; the other files after them, as one
  // group, each in the place it was pasted at until it lands.
  await expect(galleries).toHaveCount(before + 1);
  await expect(group(page)).toHaveCount(1);
  const lines = group(page).locator('[data-file-group-entry]');
  await expect(lines).toHaveCount(2);
  await expect(
    group(page).locator('[data-content-attachment], [data-content-audio]'),
  ).toHaveCount(2, { timeout: 30_000 });
  await expect(lines.nth(0).locator('[data-content-attachment]')).toBeVisible();
  await expect(lines.nth(1).locator('[data-content-audio]')).toBeVisible();
  await expect(galleries.last().locator('[data-pending-upload]')).toHaveCount(
    0,
    { timeout: 30_000 },
  );
  await expect(page.locator('[data-pending-uploads]')).toHaveAttribute(
    'data-pending-uploads',
    '0',
  );

  // Nothing was dirty until a file was in; then the text is, and stays.
  expect(await transitions(page)).toBe('Save');

  // A file to download is kept as it came; a recording and the pictures go
  // in at the defaults of where they are shown.
  expect(requested()).toEqual({
    txt: 'original',
    wav: 'audio-transform',
    png: 'image-transform',
  });
});

test('a group is titled, its files moved by their grips and taken out, and nothing flashes', async ({
  page,
}) => {
  await openFixture(page);
  await emptyParagraph(page);
  await paste(page, [
    text('first.txt', 'First'),
    text('second.txt', 'Second'),
    text('third.txt', 'Third'),
  ]);
  const cards = group(page).locator('[data-content-attachment]');
  await expect(cards).toHaveCount(3, { timeout: 30_000 });
  const extensions = () =>
    group(page)
      .locator('[data-file-group-entry]')
      .evaluateAll((lines) =>
        lines.map((line) => line.querySelector('figure')?.textContent ?? ''),
      );
  await page.locator('[data-save]').click();
  await expect(page.locator('[data-save]')).toHaveText('Saved');

  // The group's own title.
  const title = group(page).locator('[data-file-group-title]');
  await title.click();
  await page.keyboard.type('Papers');
  await expect(page.locator('[data-save]')).toHaveText('Save');
  await page.locator('[data-save]').click();

  // The arrows on a grip move its file and keep the focus on it: Editor.js
  // never takes the key for the caret.
  const grips = group(page).locator('[data-file-group-handle]');
  await expect(grips).toHaveCount(3);
  const order = await extensions();
  await grips.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect.poll(extensions).toEqual([order[1], order[0], order[2]]);
  await expect(
    group(page).locator('[data-file-group-handle]').nth(1),
  ).toBeFocused();
  await expect(page.locator('[data-save]')).toHaveText('Save');

  // The first file cannot go further up: nothing changes, nothing flashes.
  await page.locator('[data-save]').click();
  await expect(page.locator('[data-save]')).toHaveText('Saved');
  await group(page).locator('[data-file-group-handle]').first().focus();
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(300);
  expect(await transitions(page)).toBe('');

  // A file taken out goes, the others stay.
  await group(page)
    .locator('[data-file-group-entry]')
    .last()
    .getByRole('button', { name: /^Remove from the group/ })
    .click();
  await expect(cards).toHaveCount(2);
  await expect(page.locator('[data-save]')).toHaveText('Save');
});

test('a picture that will not go in is stored as a file instead', async ({
  page,
}) => {
  await openFixture(page);
  const requested = requestedSettings(page);
  // The picture's encode is refused, as one over a picture's limit would be.
  let refuse = true;
  await page.route('**/api/admin/assets/drafts/*/commit', async (route) => {
    if (!refuse) return route.continue();
    await route.fulfill({
      status: 413,
      contentType: 'application/json',
      body: JSON.stringify({
        statusCode: 413,
        message: 'File exceeds the maximum allowed size',
      }),
    });
  });
  await emptyParagraph(page);
  await paste(page, [await picture('large.png')]);
  const fallback = page.locator(
    '.content-editor [data-content-asset-fallback]',
  );
  await expect(fallback).toBeVisible({ timeout: 30_000 });
  refuse = false;
  await fallback.click();
  const card = blocks(page).last().locator('[data-content-attachment]');
  await expect(card).toBeVisible({ timeout: 30_000 });
  // Shown as a file, it is kept as it came.
  expect(requested().png).toBe('original');
});

test('a file’s title takes no marks; its caption does', async ({ page }) => {
  await openFixture(page);
  await emptyParagraph(page);
  await paste(page, [text('words.txt', `Words ${randomUUID()}`)]);
  const card = blocks(page).last().locator('[data-content-attachment]');
  await expect(card).toBeVisible({ timeout: 30_000 });
  const [title, caption] = [
    card.locator('[contenteditable="plaintext-only"]'),
    card.locator('[contenteditable="true"]'),
  ];
  const toolbar = page.locator('.ce-inline-toolbar .ce-popover--opened');

  await title.click();
  await page.keyboard.type('Plain title');
  await page.keyboard.press('Shift+Home');
  await page.waitForTimeout(400);
  await expect(toolbar).toHaveCount(0);

  await caption.click();
  await page.keyboard.type('Rich caption');
  await page.keyboard.press('Shift+Home');
  await expect(toolbar).toHaveCount(1);
});

// ---- In the admin's own editor --------------------------------------------

/** A private page holding these blocks; nothing a public list reads. */
async function createPage(request: APIRequestContext, content: object[]) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const result = await (
    await request.post('/api/admin/pages', {
      data: {
        title: `File blocks ${stamp}`,
        summary: 'A page for the file blocks spec.',
        slug: `file-blocks-${stamp}`,
        access: 'private',
        content: { data: { blocks: content } },
        reminder: '',
        notes: null,
      },
    })
  ).json();
  expect(result.type, JSON.stringify(result)).toBe('success');
  return { pageUuid: result.pageUuid as string, slug: `file-blocks-${stamp}` };
}

const editorBlocks = (page: Page) =>
  page.locator('dialog .content-editor .ce-block');

async function openEditor(page: Page, pageUuid: string) {
  await page.goto(`/admin/pages/${pageUuid}/edit/`);
  await page.waitForLoadState('networkidle');
  await page.locator('button[data-field]').first().click();
  await expect(editorBlocks(page).first()).toBeVisible({ timeout: 15_000 });
}

test('a picture shown as a file is the same block, its caption kept with its marks', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { assetUuid } = await uploadFile(
    page.request,
    'png',
    (await picture('any.png')).bytes,
  );
  const { pageUuid } = await createPage(page.request, [
    {
      id: 'pic',
      type: 'contentMedia',
      data: {
        asset: { assetUuid },
        layout: 'centered',
        caption: 'Sun<b>set</b>',
      },
    },
  ]);
  await openEditor(page, pageUuid);
  const pic = page.locator('dialog .ce-block[data-id="pic"]');

  async function setting(name: string) {
    await pic.hover();
    await page.locator('dialog .ce-toolbar__settings-btn').click();
    await page
      .locator('.ce-popover--opened .ce-popover-item', { hasText: name })
      .click();
  }

  await setting('Show as a file');
  const card = pic.locator('[data-content-attachment]');
  await expect(card).toBeVisible();
  // It shows what it is by its preview — for a picture this small, the
  // picture itself.
  await expect(card.locator('[data-attachment-thumbnail]')).toBeVisible();
  await expect(card.locator('[contenteditable="true"] b')).toHaveText('set');
  await expect(
    page.locator('dialog').getByRole('button', { name: 'Save', exact: true }),
  ).toBeEnabled();

  await setting('Show as a picture');
  await expect(pic.locator('[data-content-attachment]')).toHaveCount(0);
  await expect(pic.locator('[contenteditable="true"] b')).toHaveText('set');
});

test('a gallery’s caption shows its placeholder only while the picture shown has no caption', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const [first, second] = [
    await uploadFile(page.request, 'png', (await picture('any.png')).bytes),
    await uploadFile(page.request, 'png', (await picture('any.png')).bytes),
  ];
  const { pageUuid } = await createPage(page.request, [
    {
      id: 'gallery',
      type: 'contentGallery',
      data: {
        items: [
          { id: 'bare', asset: { assetUuid: first.assetUuid } },
          {
            id: 'captioned',
            asset: { assetUuid: second.assetUuid },
            caption: 'Sun<b>set</b>',
          },
        ],
      },
    },
  ]);
  await openEditor(page, pageUuid);
  const gallery = page.locator('dialog .ce-block[data-id="gallery"]');
  const tiles = gallery.locator('[aria-pressed]');
  const caption = gallery.locator('[data-gallery-view] [data-placeholder]');
  const placeholder = () =>
    caption.evaluate((field) => getComputedStyle(field, '::before').content);

  // Editor.js has marked the caption of the picture shown first, which has
  // none, as empty.
  await expect(caption).toHaveAttribute('data-empty', 'true');
  await expect.poll(placeholder).toBe('"Caption"');

  // The next picture's caption takes its place: words, and no placeholder
  // over them.
  await tiles.nth(1).click();
  await expect(caption).toHaveText('Sunset');
  await expect(caption).toHaveAttribute('data-empty', 'false');
  await expect.poll(placeholder).toBe('none');

  await tiles.nth(0).click();
  await expect(caption).toHaveText('');
  await expect.poll(placeholder).toBe('"Caption"');

  // Showing another picture changes nothing in the text.
  await expect(
    page.locator('dialog').getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled();
});

test('the one file tile places what is picked by its kind', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { pageUuid } = await createPage(page.request, [
    { type: 'paragraph', data: { text: 'Before' } },
  ]);
  await openEditor(page, pageUuid);
  await editorBlocks(page).last().locator('[contenteditable]').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+Shift+Slash');
  const tiles = page.locator('dialog [data-block-tile]');
  await expect(tiles.first()).toBeFocused();
  const keys = await tiles.evaluateAll((all) =>
    all.map((tile) => (tile as HTMLElement).dataset.blockTile),
  );
  // Files have one tile, the file's; a picture, a gallery, a recording and
  // a group are what it becomes.
  expect(keys).toContain('contentAttachment');
  for (const gone of ['contentMedia', 'contentGallery', 'contentAudio'])
    expect(keys).not.toContain(gone);
  await page.locator('dialog [data-block-tile="contentAttachment"]').click();

  // Several files at once: no settings, each stored at its block's defaults.
  await page.locator('input[type=file]').setInputFiles(
    [
      await picture('a.png'),
      await picture('b.png'),
      text('list.txt', `Groceries ${randomUUID()}`),
    ].map(({ name, type, bytes }) => ({
      name,
      mimeType: type,
      buffer: bytes,
    })),
  );
  const editor = page.locator('dialog .content-editor');
  await expect(editor.locator('[data-content-gallery]')).toHaveCount(1);
  await expect(editor.locator('[data-content-attachment]')).toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(editor.locator('[data-pending-upload]')).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(
    editor.locator('[data-content-gallery] [aria-pressed]'),
  ).toHaveCount(2);
});

test('a group of files on the page: its title, its files, and its captions in the file window', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const map = await uploadFile(
    page.request,
    'png',
    (await picture('any.png')).bytes,
  );
  const notes = await uploadText(page.request, `Notes ${randomUUID()}`);
  const { slug } = await createPage(page.request, [
    {
      type: 'contentFileGroup',
      data: {
        title: 'Papers',
        items: [
          {
            id: 'f1',
            asset: { assetUuid: map.assetUuid },
            title: 'Map',
            caption:
              'See <a href="https://example.com/" data-content-link="external">the source</a> and <abbr data-content-hint="A note">this</abbr>',
          },
          { id: 'f2', asset: { assetUuid: notes.assetUuid }, title: 'Notes' },
        ],
      },
    },
  ]);
  await page.goto(`/pages/${slug}/`);
  await page.waitForLoadState('networkidle');
  const files = page.locator('[data-content-file-group]');
  await expect(files.locator('[data-file-group-title]')).toHaveText('Papers');
  const cards = files.locator('[data-content-attachment]');
  await expect(cards).toHaveCount(2);
  // A picture in a group is a file, shown by its preview.
  await expect(
    cards.first().locator('[data-attachment-thumbnail]'),
  ).toBeVisible();
  await expect(
    cards.first().getByRole('link', { name: 'the source' }),
  ).toHaveAttribute('href', 'https://example.com/');

  // Its window shows the caption with its link and its hint working.
  await cards.first().getByRole('button').first().click();
  const caption = page.locator('dialog [data-public-asset-caption]');
  await expect(caption).toContainText('See the source and this');
  await expect(
    caption.getByRole('link', { name: 'the source' }),
  ).toHaveAttribute('href', 'https://example.com/');
  // The owner's words, with the typography of the site's language.
  await expect(caption.locator('abbr')).toHaveAttribute(
    'data-title-popup',
    /^A\snote$/,
  );
});
