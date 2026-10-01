import {
  expect,
  request as playwright,
  test,
  type Page,
} from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { E2E_ORIGIN } from './fixture-url';

type Graph = { '@context': string; '@graph': Record<string, any>[] };

async function graph(page: Page): Promise<Graph> {
  // `hasText` matches rendered text, which a <script> has none of, so the
  // blocks are read out and picked apart here instead.
  const blocks = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  // One graph per page: the site and its owner live in it, not beside it.
  expect(blocks).toHaveLength(1);
  expect(blocks[0], 'no page-level JSON-LD graph was rendered').toContain(
    '"@graph"',
  );
  return JSON.parse(blocks[0]!);
}

const node = (value: Graph, type: string) =>
  value['@graph'].find((item) => item['@type'] === type);

/** Every `@type` anywhere in the graph, nested nodes included. */
function types(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(types);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) =>
    key === '@type' ? [String(item)] : types(item),
  );
}

test('a detail page describes itself with metadata and a linked graph', async ({
  page,
}) => {
  await page.goto('/pages/page-0/');

  await expect(page).toHaveTitle(/Fixture page 0/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /.+/,
  );
  const canonical = await page
    .locator('link[rel="canonical"]')
    .getAttribute('href');
  expect(new URL(canonical!).pathname).toBe('/pages/page-0/');

  const value = await graph(page);
  const webSite = node(value, 'WebSite')!;
  const person = node(value, 'Person')!;
  const webPage = node(value, 'WebPage')!;
  const crumbs = node(value, 'BreadcrumbList')!;
  const article = node(value, 'Article')!;

  expect(webPage.url).toBe(canonical);
  expect(webPage.inLanguage).toBe('en');
  // The page hangs off the site node in its own graph, and points at both its
  // trail and the thing it is about.
  expect(webPage.isPartOf['@id']).toBe(webSite['@id']);
  expect(webSite['@id']).toMatch(/#website$/);
  expect(webPage.breadcrumb['@id']).toBe(crumbs['@id']);
  expect(webPage.mainEntity['@id']).toBe(article['@id']);
  // The author is named on the page itself, not only on the home page.
  expect(person.name).toBe('Regression');
  expect(article.author['@id']).toBe(person['@id']);
  expect(webSite.publisher['@id']).toBe(person['@id']);

  expect(
    crumbs.itemListElement.map((item: any) => [item.position, item.name]),
  ).toEqual([
    [1, 'Pages'],
    [2, 'Fixture page 0'],
  ]);
  for (const item of crumbs.itemListElement) {
    expect(item.item).toMatch(/^https?:\/\//);
  }
  expect(article.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('an event is an article about a moment, never a schema.org Event', async ({
  page,
}) => {
  // Search engines take an `Event` for a public gathering and flag every one
  // without a venue, which a moment of a life never has.
  const admin = await playwright.newContext({
    baseURL: E2E_ORIGIN,
    storageState: fileURLToPath(
      new URL('./.artifacts/admin.json', import.meta.url),
    ),
  });
  const publicId = `seo${Date.now()}`;
  const created = await (
    await admin.post('/api/admin/events', {
      data: {
        title: 'Slipped on the ice',
        summary: 'A winter morning worth remembering.',
        access: 'public',
        humanReadableSlug: 'slipped-on-the-ice',
        publicId,
        content: {
          data: {
            blocks: [{ type: 'paragraph', data: { text: 'It was icy.' } }],
          },
        },
        periods: [{ startDate: '2026-01-10', endDate: '2026-01-12' }],
      },
    })
  ).json();
  await admin.dispose();
  expect(created.type, JSON.stringify(created)).toBe('success');

  await page.goto(`/events/slipped-on-the-ice-${publicId}/`);
  const value = await graph(page);
  expect(types(value)).not.toContain('Event');

  const webPage = node(value, 'WebPage')!;
  const article = node(value, 'Article')!;
  const person = node(value, 'Person')!;
  expect(webPage.mainEntity['@id']).toBe(article['@id']);
  // The owner's typography binds short words with a no-break space.
  expect(article.headline.replace(/\s/g, ' ')).toBe('Slipped on the ice');
  expect(article.temporalCoverage).toBe('2026-01-10/2026-01-12');
  expect(article.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(article.author['@id']).toBe(person['@id']);
  // Without a picture of its own, the event is shown by its card.
  expect(new URL(article.image).pathname).toBe(`/og/event/${publicId}.png`);
  expect(webPage.primaryImageOfPage).toBe(article.image);
});

test('a listing page is a CollectionPage carrying a bounded ItemList', async ({
  page,
}) => {
  await page.goto('/pages/');
  const value = await graph(page);
  const collection = node(value, 'CollectionPage')!;
  const list = node(value, 'ItemList')!;

  expect(collection.mainEntity['@id']).toBe(list['@id']);
  // The seed makes 2000; other specs in this run may add their own.
  expect(list.numberOfItems).toBeGreaterThanOrEqual(2000);
  // The listing is paginated: the markup reports the whole count and lists
  // only the rows of the page it is on.
  expect(list.itemListElement.length).toBe(30);
  expect(list.itemListElement[0].position).toBe(1);

  await page.goto('/pages/?page=2');
  const second = node(await graph(page), 'ItemList')!;
  expect(second.itemListElement[0].position).toBe(31);
});

test('Open Graph cards render as pictures', async ({ page, request }) => {
  // The fixture is a production build: a card depends on files the build
  // has to carry along (fonts, HarfBuzz's wasm) that development reads from
  // node_modules.
  await page.goto('/pages/page-0/');
  const card = await page
    .locator('meta[property="og:image"]')
    .getAttribute('content');
  for (const path of ['/og/site.png', new URL(card!).pathname]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()['content-type'], path).toBe('image/png');
    expect((await response.body()).length, path).toBeGreaterThan(10_000);
  }
});

test('robots.txt points at the sitemap and holds back the private areas', async ({
  request,
}) => {
  const response = await request.get('/robots.txt');
  expect(response.ok()).toBe(true);
  const body = await response.text();
  for (const path of ['/admin/', '/api/', '/sign-in/', '/install/', '/test/']) {
    expect(body).toContain(`Disallow: ${path}`);
  }
  const sitemap = body.match(/^Sitemap: (.+)$/m)?.[1];
  expect(new URL(sitemap!).pathname).toBe('/sitemap.xml');
});

test('sitemap.xml lists public pages and nothing behind the admin', async ({
  request,
}) => {
  const response = await request.get('/sitemap.xml');
  expect(response.headers()['content-type']).toContain('application/xml');
  const body = await response.text();

  expect(body.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  expect(body.endsWith('</urlset>')).toBe(true);
  for (const path of ['/', '/life/', '/tags/', '/pages/page-0/']) {
    expect(body).toContain(`<loc>${new URL(path, E2E_ORIGIN)}<`);
  }
  for (const path of ['/admin', '/api/', '/sign-in', '/install', '/update']) {
    expect(body).not.toContain(`${path}</loc>`);
  }
});
