import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { fileURLToPath } from 'node:url';

test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});

async function revokeToken(request: APIRequestContext) {
  await request.delete('/api/admin/backup/token');
}

/**
 * A server-rendered button is clickable before Vue has attached its handler,
 * so a click that lands first is simply lost.
 */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
}

test('a site that has never been backed up says so on the dashboard', async ({
  page,
}) => {
  // The seed clears the run ledger, so this is the state a fresh instance is
  // in — and the one the warning exists for.
  await open(page, '/admin/');
  const status = page.getByLabel('Site status');
  await expect(status.getByText('No backup yet')).toBeVisible();
  await expect(
    status.getByRole('link', { name: /No backup has completed/ }),
  ).toBeVisible();
});

test('the settings page issues a token once and reflects it', async ({
  page,
  request,
}) => {
  await revokeToken(request);
  await open(page, '/admin/settings/');

  const missing = page.getByText('No token — backups cannot run');
  await expect(missing).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Download the script' }),
  ).toHaveCount(0);

  await page.getByRole('button', { name: 'Generate a token' }).click();

  const token = page.locator('code');
  await expect(token).toBeVisible();
  expect((await token.textContent())!.trim()).toMatch(/^[0-9a-f]{64}$/);
  await expect(page.getByText('A token is active')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Download the script' }),
  ).toBeVisible();

  // Nothing reads a token back: reloading has to lose it.
  await open(page, '/admin/settings/');
  await expect(page.locator('code')).toHaveCount(0);
  await expect(page.getByText('A token is active')).toBeVisible();
});

test('the token is the only way into the backup API', async ({ request }) => {
  const token = (await (await request.post('/api/admin/backup/token')).json())
    .token as string;

  // The admin session must not be enough: these routes are for a script that
  // has no cookie, and the cookie is not a substitute for the token.
  const withoutToken = await request.post('/api/backup/session', {
    data: { kind: 'manual' },
  });
  expect(withoutToken.status()).toBe(403);

  const wrongToken = await request.post('/api/backup/session', {
    headers: { 'x-thei-backup-token': 'x'.repeat(64) },
    data: { kind: 'manual' },
  });
  expect(wrongToken.status()).toBe(403);

  const opened = await request.post('/api/backup/session', {
    headers: { 'x-thei-backup-token': token },
    data: { kind: 'manual', clientLabel: 'e2e' },
  });
  expect(opened.ok(), await opened.text()).toBe(true);
  const session = await opened.json();
  expect(session.totalFiles).toBeGreaterThan(0);
  expect(session.skipped).toEqual([]);

  // Only one at a time.
  const second = await request.post('/api/backup/session', {
    headers: { 'x-thei-backup-token': token },
    data: { kind: 'manual' },
  });
  expect(second.status()).toBe(409);

  const manifest = await (
    await request.get(`/api/backup/session/${session.sessionId}/manifest`, {
      headers: { 'x-thei-backup-token': token },
    })
  ).json();
  const paths = manifest.entries.map((entry: { path: string }) => entry.path);
  expect(paths).toContain('thei.db');
  expect(paths).toContain('thei.config.json');
  expect(paths.some((path: string) => path.startsWith('assets/'))).toBe(true);
  expect(
    paths.some((path: string) => path.startsWith('generated-media/')),
  ).toBe(false);

  for (const path of ['../thei.config.json', 'generated-media/a.avif']) {
    const refused = await request.get(
      `/api/backup/session/${session.sessionId}/file?path=${encodeURIComponent(path)}`,
      { headers: { 'x-thei-backup-token': token } },
    );
    expect(refused.status(), path).toBe(400);
  }

  const completed = await request.post(
    `/api/backup/session/${session.sessionId}/complete`,
    {
      headers: { 'x-thei-backup-token': token },
      data: { fileCount: session.totalFiles, byteCount: session.totalBytes },
    },
  );
  expect(completed.ok()).toBe(true);
  expect((await completed.json()).clientLabel).toBe('e2e');

  const status = await (await request.get('/api/admin/backup')).json();
  expect(status.lastBackup.clientLabel).toBe('e2e');
});
