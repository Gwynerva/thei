import { request, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { E2E_ORIGIN } from './fixture-url';

export default async function setup() {
  const api = await request.newContext({ baseURL: E2E_ORIGIN });
  const marker = await api.get('/test-fixture.json');
  expect(await marker.json()).toEqual({ fixture: 'thei-regression' });
  const response = await api.get('/');
  if (response.url().includes('/install')) {
    expect(
      await (
        await api.post('/api/installation', {
          data: {
            languageCode: 'en',
            siteAccessLevel: 'public',
            displayName: 'Regression',
            secretPhrase: 'regression',
            password: 'fixture-only-password',
          },
        })
      ).json(),
    ).toEqual({ type: 'success' });
  }
  expect(
    await (
      await api.post('/api/admin/session', {
        data: { secretPhrase: 'regression', password: 'fixture-only-password' },
      })
    ).json(),
  ).toEqual({ type: 'success' });
  // A production build marks the session cookie Secure. Chromium still sends
  // it to 127.0.0.1 over http, but Playwright's own request client does not.
  const state = await api.storageState();
  for (const cookie of state.cookies) cookie.secure = false;
  await api.dispose();

  const admin = await request.newContext({
    baseURL: E2E_ORIGIN,
    storageState: state,
  });
  const seed = await admin.post('/api/test/seed');
  expect(seed.ok(), await seed.text()).toBe(true);
  await admin.dispose();
  const directory = fileURLToPath(new URL('./.artifacts/', import.meta.url));
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/admin.json`, JSON.stringify(state));
}
