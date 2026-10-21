import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import sharp from 'sharp';
import { expectPopupUsable } from './helpers/popup';
import { uploadFile } from './helpers/upload';

test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});

interface Stored {
  assetUuid: string;
  assetUrl: string;
  size: number;
}

/** A text's bytes; a line of its own makes them new on every run. */
const utf8 = (text: string) => new TextEncoder().encode(text);
const fresh = () => `\n<!-- ${randomUUID()} -->\n`;

async function view(
  page: Page,
  file: Stored,
  extension: string,
  { inWindow = false } = {},
) {
  const query = new URLSearchParams({
    src: file.assetUrl,
    extension,
    size: String(file.size),
    ...(inWindow ? { window: '1' } : {}),
  });
  await page.goto(`/file-preview-regression?${query}`);
  const preview = page.locator('[data-file-preview]');
  await expect(preview).not.toHaveAttribute(
    'data-file-preview-view',
    'loading',
  );
  return preview;
}

test('a text in the library opens as its words, in the encoding it was written in', async ({
  page,
  request,
}) => {
  // «Привет, мир» in windows-1251, as an old Russian notepad saves it.
  const cp1251 = [
    0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2, 0x2c, 0x20, 0xec, 0xe8, 0xf0,
  ];
  const file = await uploadFile<Stored>(
    request,
    'txt',
    new Uint8Array([...cp1251, ...utf8(`\n${randomUUID()}`)]),
  );
  await page.goto('/admin/assets/');
  // A tile clicked before the page is live opens nothing.
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
  await page.locator(`[data-asset-uuid="${file.assetUuid}"]`).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog.locator('[data-file-preview-view="text"]')).toBeVisible();
  await expect(dialog.locator('[data-file-preview-text]')).toContainText(
    'Привет, мир',
  );
  // A text is downloaded, never opened at its address on the site — and by
  // a name: the library's address ends in no file's.
  await expect(dialog.locator('[data-asset-download]')).toHaveAttribute(
    'download',
    'file.txt',
  );
  await expect(
    dialog.getByRole('link', { name: 'Direct link to asset' }),
  ).toHaveCount(0);
});

test('a Markdown file reads as a page, and its HTML runs nothing', async ({
  page,
  request,
}) => {
  const markdown = [
    '# Поход',
    '',
    '| День | Где |',
    '| --- | --- |',
    '| 1 | Суоярви |',
    '',
    '- [x] палатка',
    '- [ ] котелок',
    '',
    // A line of HTML opens an HTML block that lasts to the next blank line:
    // the Markdown after it would be read as more HTML.
    '<details><summary>Снаряжение</summary>весло</details>',
    '',
    '<script>window.__ran = true</script>',
    '',
    '<img src="x" onerror="window.__ran = true">',
    '',
    '<a href="javascript:window.__ran=true">ссылка</a>',
    '',
    '<a href=" javascript:window.__ran=true">с пробелом</a>',
    '',
    '<a href="data:text/html,<script>parent.__ran=true</script>">данные</a>',
    '',
    '<svg><script>window.__ran = true</script></svg>',
    '',
    '<math><mtext><img src="x" onerror="window.__ran = true"></mtext></math>',
    '',
    '<iframe srcdoc="<script>parent.__ran = true</script>"></iframe>',
    '',
    '<form action="https://example.com/steal"><button>Войти</button></form>',
    '',
    '<p id="app" name="cookie" style="position:fixed;inset:0">поверх</p>',
    '',
    '<img srcset="x 1x" alt="набор">',
    '',
    '<details open ontoggle="window.__ran = true"><summary>ещё</summary></details>',
    '',
    '[сайт](https://example.com/route)',
    '',
    '![точка](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==)',
    fresh(),
  ].join('\n');
  const file = await uploadFile<Stored>(request, 'md', utf8(markdown));
  const preview = await view(page, file, 'md');
  const article = preview.locator('[data-file-preview-markdown]');
  await expect(article.locator('h1')).toHaveText('Поход');
  await expect(article.locator('th').first()).toHaveText('День');
  await expect(article.locator('input[type="checkbox"]')).toHaveCount(2);
  await expect(
    article.locator('input[type="checkbox"]').first(),
  ).toBeDisabled();
  await expect(article.locator('details summary').first()).toHaveText(
    'Снаряжение',
  );
  await expect(article.locator('script')).toHaveCount(0);
  await expect(article.locator('[onerror]')).toHaveCount(0);
  await expect(article.getByText('ссылка')).not.toHaveAttribute('href', /.*/);
  for (const words of ['с пробелом', 'данные'])
    await expect(article.getByText(words)).not.toHaveAttribute('href', /.*/);
  await expect(article.locator('svg, math, iframe, form')).toHaveCount(0);
  await expect(
    article.locator('[style], [id], [name], [srcset], [ontoggle]'),
  ).toHaveCount(0);
  await expect(article.getByRole('link', { name: 'сайт' })).toHaveAttribute(
    'target',
    '_blank',
  );
  await expect(article.locator('img[alt="точка"]')).toHaveAttribute(
    'src',
    /^data:image\/png/,
  );
  // Nothing of the text ran on the page.
  expect(await page.evaluate(() => (window as { __ran?: boolean }).__ran)).toBe(
    undefined,
  );
});

test('a CSV file is a table, in the delimiter it is written with', async ({
  page,
  request,
}) => {
  const csv = `Дата;Место;Заметка\n2024-07-01;Суоярви;"старт; дождь"\n2024-07-02;"Порог ""Бесовец""";"обнос\nполдня"\n${randomUUID()};;\n`;
  const file = await uploadFile<Stored>(request, 'csv', utf8(csv));
  const preview = await view(page, file, 'csv');
  const table = preview.locator('[data-file-preview-table]');
  await expect(table.locator('th')).toHaveText(['Дата', 'Место', 'Заметка']);
  await expect(
    table.locator('tbody tr').nth(0).locator('td').nth(2),
  ).toHaveText('старт; дождь');
  await expect(
    table.locator('tbody tr').nth(1).locator('td').nth(1),
  ).toHaveText('Порог "Бесовец"');
});

test('an HTML report runs in a sandbox that is no part of the site', async ({
  page,
  request,
}) => {
  const html = `<!doctype html><html><body><h1>Отчёт</h1><script>
    const mark = (name, value) => (document.body.dataset[name] = value);
    mark('ran', 'yes');
    mark('origin', String(self.origin));
    try { mark('parent', parent.document.title ? 'reached' : 'reached'); } catch { mark('parent', 'blocked'); }
    try { mark('cookie', document.cookie === undefined ? 'none' : 'read'); } catch { mark('cookie', 'blocked'); }
  </script>${fresh()}</body></html>`;
  const file = await uploadFile<Stored>(request, 'html', utf8(html));
  const preview = await view(page, file, 'html');
  const frame = preview.locator('[data-file-preview-page]');
  await expect(frame).toHaveAttribute('sandbox', /allow-scripts/);
  await expect(frame).not.toHaveAttribute('sandbox', /allow-same-origin/);
  const body = page.frameLocator('[data-file-preview-page]').locator('body');
  await expect(body.locator('h1')).toHaveText('Отчёт');
  await expect(body).toHaveAttribute('data-ran', 'yes');
  await expect(body).toHaveAttribute('data-origin', 'null');
  await expect(body).toHaveAttribute('data-parent', 'blocked');
  await expect(body).toHaveAttribute('data-cookie', 'blocked');
});

test('an archive is a file explorer, and its files open in the window', async ({
  page,
  request,
}) => {
  const picture = await sharp({
    create: { width: 40, height: 30, channels: 3, background: '#4368a2' },
  })
    .png()
    .toBuffer();
  const archive = zipSync({
    'report/index.html': utf8('<h1>Отчёт</h1>'),
    'report/data/rows.csv': utf8('a;b\n1;2\n'),
    'report/photo.png': [new Uint8Array(picture), { level: 0 }],
    'report/drawing.svg': utf8(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>',
    ),
    'old.zip': zipSync({ 'inner.txt': utf8('inner') }),
    'Заметки.txt': utf8(`Шесть дней по Шуе.\n${randomUUID()}`),
  });
  const file = await uploadFile<Stored>(request, 'zip', archive);
  const preview = await view(page, file, 'zip', { inWindow: true });
  const explorer = preview.locator('[data-file-preview-zip]');
  const list = preview.locator('[data-archive-list]');
  const back = page.locator('[data-asset-action="archive-back"]');

  // The top: one folder with what it holds, then the files.
  await expect(explorer).toContainText('6 files');
  const report = list.locator('[data-archive-folder="report"]');
  await expect(report).toContainText('4');
  await expect(list.locator('[data-archive-entry="old.zip"]')).toHaveAttribute(
    'aria-disabled',
    'true',
  );

  // A text opens in the window, with a way back and one to save it.
  await list.locator('[data-archive-entry="Заметки.txt"]').click();
  await expect(page.locator('[data-file-preview-text]')).toContainText(
    'Шесть дней по Шуе.',
  );
  await expect(
    page.locator('[data-asset-action="archive-download"]'),
  ).toHaveAttribute('download', 'Заметки.txt');
  await expect(list).toBeHidden();
  // Escape goes back to the archive first.
  await page.keyboard.press('Escape');
  await expect(list).toBeVisible();
  await expect(back).toHaveCount(0);

  // Into a folder; a picture opens to zoom, and back is where it was.
  await report.click();
  await expect(preview.locator('[data-archive-path]')).toContainText('Archive');
  await expect(
    list.locator('[data-archive-entry="report/photo.png"]'),
  ).toBeVisible();
  await list.locator('[data-archive-entry="report/photo.png"]').click();
  await expect(page.locator('img[src^="blob:"]')).toBeVisible();
  await expect(
    page.locator('[data-asset-action="archive-zoom"]'),
  ).toBeVisible();
  await back.click();
  await expect(
    list.locator('[data-archive-entry="report/photo.png"]'),
  ).toBeVisible();

  // A drawing is shown from a data address, never one of the site's own.
  await list.locator('[data-archive-entry="report/drawing.svg"]').click();
  await expect(page.locator('img[src^="data:image/svg+xml"]')).toBeVisible();
  await back.click();
});

test('the path of an archive folds into a list of its folders on a phone', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const archive = zipSync({
    'Поход по Шуе в июле/фотографии с маршрута/второй день/порог.txt':
      utf8(randomUUID()),
  });
  const file = await uploadFile<Stored>(request, 'zip', archive);
  const preview = await view(page, file, 'zip', { inWindow: true });
  const list = preview.locator('[data-archive-list]');
  for (const folder of [
    'Поход по Шуе в июле',
    'Поход по Шуе в июле/фотографии с маршрута',
    'Поход по Шуе в июле/фотографии с маршрута/второй день',
  ])
    await list.locator(`[data-archive-folder="${folder}"]`).click();

  const levels = preview.locator('[data-archive-levels]');
  await expect(levels).toContainText('второй день');
  await expect(preview.locator('[data-archive-path]')).toHaveCount(0);
  await levels.click();
  const popup = page
    .locator('[data-floating-popup]')
    .filter({ has: page.locator('[data-archive-levels-popup]') });
  await expectPopupUsable(page, popup);
  await expect(popup.getByRole('button')).toHaveCount(4);
  await popup.getByRole('button', { name: 'Archive' }).click();
  await expect(
    list.locator('[data-archive-folder="Поход по Шуе в июле"]'),
  ).toBeVisible();
});

test('a large text shows its start and says how much of it', async ({
  page,
  request,
}) => {
  const line = 'день за днём по реке, от порога к порогу\n';
  const text = `${randomUUID()}\n${line.repeat(Math.ceil((1.3 * 1024 * 1024) / line.length))}`;
  const file = await uploadFile<Stored>(request, 'log', utf8(text));
  const preview = await view(page, file, 'log');
  await expect(preview).toContainText('The first 1');
  const shown = await preview.locator('[data-file-preview-text]').textContent();
  expect(shown!.length).toBeLessThan(text.length);
  expect(shown!.endsWith('\n') || shown!.endsWith('порогу')).toBe(true);
});

test('a file of no known kind is shown when its bytes are text', async ({
  page,
  request,
}) => {
  const notes = await uploadFile<Stored>(
    request,
    'nfo',
    utf8(`Release notes\n${randomUUID()}`),
  );
  await expect(await view(page, notes, 'nfo')).toHaveAttribute(
    'data-file-preview-view',
    'text',
  );
  const binary = await uploadFile<Stored>(
    request,
    'bin',
    new Uint8Array([0, 1, 2, 3, 0, 255, ...utf8(randomUUID())]),
  );
  const query = new URLSearchParams({
    src: binary.assetUrl,
    extension: 'bin',
    size: String(binary.size),
  });
  await page.goto(`/file-preview-regression?${query}`);
  // Nothing to show: the file's card, as before.
  await expect(
    page.locator('[data-file-preview-fixture] svg').first(),
  ).toBeVisible();
  await expect(page.locator('[data-file-preview]')).toHaveCount(0);
});

test('a PDF opens in the browser viewer where there is one', async ({
  page,
  request,
}) => {
  const pdf = utf8(
    `%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%${randomUUID()}\n%%EOF\n`,
  );
  const file = await uploadFile<Stored>(request, 'pdf', pdf);
  const preview = await view(page, file, 'pdf');
  const viewer = await page.evaluate(() => navigator.pdfViewerEnabled);
  if (viewer) {
    await expect(preview.locator('[data-file-preview-pdf]')).toHaveAttribute(
      'src',
      new RegExp(`${file.assetUrl}$`),
    );
  } else {
    await expect(preview).toContainText('does not show PDF files');
  }
  // Served for the viewer, not as a download.
  const response = await request.get(file.assetUrl);
  expect(response.headers()['content-type']).toBe('application/pdf');
  expect(response.headers()['content-disposition']).toBeUndefined();
});
