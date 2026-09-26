import { request, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
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
  const seed = await api.post('/api/test/seed');
  expect(seed.ok(), await seed.text()).toBe(true);
  const directory = fileURLToPath(new URL('./.artifacts/', import.meta.url));
  await mkdir(directory, { recursive: true });
  await api.storageState({ path: `${directory}/admin.json` });
  await api.dispose();
}
