import { expect, type APIRequestContext } from '@playwright/test';
import type { FakeModel } from '../../helpers/fake-model';

/**
 * Turns AI on for a spec, its model the fake one at `model.url`, with a
 * month's worth of tokens no run spends.
 */
export async function turnAiOn(request: APIRequestContext, model: FakeModel) {
  expect(
    (
      await request.put('/api/admin/ai/settings', { data: { enabled: true } })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.put('/api/admin/ai/model', {
        data: {
          provider: 'openai',
          baseUrl: model.url,
          model: 'fake-e2e',
          monthlyTokens: 10_000_000,
        },
      })
    ).ok(),
  ).toBe(true);
}

/** Leaves AI off again, with no model set, as the fixture starts. */
export async function turnAiOff(request: APIRequestContext) {
  await request.put('/api/admin/ai/model', { data: { provider: 'none' } });
  await request.put('/api/admin/ai/settings', { data: { enabled: false } });
}
