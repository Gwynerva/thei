import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * The limits of a stranger's search (`server/thei/search/limits.ts`) as a
 * page rendered on the server meets them: its search counts against its own
 * visitor, never against one bucket every render shares, and a visitor who
 * spent theirs still gets the page — its field, its filters, a word that an
 * answer is on its way — which asks again once in the browser.
 *
 * The fixture is served on this computer, so `X-Real-IP` names the visitor
 * as the proxy in front of a real site would.
 */

const QUERY = 'lantern';
// The phrase is set with non-breaking spaces.
const BUSY = /The\ssearch\sis\sbusy/u;

/** Searches from an address until its bucket is spent. */
async function spend(request: APIRequestContext, address: string) {
  for (let at = 0; at < 60; at++) {
    const response = await request.get('/api/search', {
      params: { q: QUERY, typing: '1' },
      headers: { 'x-real-ip': address },
    });
    if (response.status() === 429) return;
    expect(response.status()).toBe(200);
  }
  throw new Error(`${address} was never turned away`);
}

/**
 * The search page rendered for a visitor whose bucket is spent. A search
 * turned away leaves the bucket just short of one, which refills within
 * moments, so a render that came a moment too late is tried again.
 */
async function refusedPage(request: APIRequestContext, address: string) {
  for (let at = 0; at < 10; at++) {
    await spend(request, address);
    const response = await request.get(`/search/?q=${QUERY}`, {
      headers: { 'x-real-ip': address },
    });
    if (response.status() !== 200) return response;
  }
  throw new Error(`no page for ${address} was ever turned away`);
}

test('a visitor who spent their searches still gets the page', async ({
  page,
  request,
}) => {
  const address = '203.0.113.7';
  const response = await refusedPage(request, address);
  expect([429, 503]).toContain(response.status());
  expect(Number(response.headers()['retry-after'])).toBeGreaterThan(0);
  const html = await response.text();
  expect(html).toContain('data-search-page-field');
  expect(html).toMatch(BUSY);
  expect(html).not.toContain('data-error-status');

  // In the browser it asks again, and the answer comes.
  await page.setExtraHTTPHeaders({ 'x-real-ip': address });
  let shown = 200;
  for (let at = 0; at < 10 && shown === 200; at++) {
    await spend(request, address);
    shown = (await page.goto(`/search/?q=${QUERY}`))!.status();
  }
  expect([429, 503]).toContain(shown);
  await expect(page.locator('[data-search-page-field]')).toHaveValue(QUERY);
  await expect(page.getByText(BUSY)).toBeVisible();
  await page.waitForResponse(
    (sent) =>
      new URL(sent.url()).pathname === '/api/search' && sent.status() === 200,
    { timeout: 15_000 },
  );
  await expect(page.getByText(BUSY)).toHaveCount(0);
  await expect(page.locator('[data-error-status]')).toHaveCount(0);
});

test('every visitor’s page searches by their own bucket', async ({
  request,
}) => {
  // More renders than one bucket holds, each for a visitor of its own.
  for (let at = 1; at <= 30; at++) {
    const response = await request.get(`/search/?q=${QUERY}`, {
      headers: { 'x-real-ip': `198.51.100.${at}` },
    });
    expect(`${at}: ${response.status()}`).toBe(`${at}: 200`);
  }
});
