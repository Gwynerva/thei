import { expect, test, type Page } from '@playwright/test';

type Graph = { '@context': string; '@graph': Record<string, any>[] };

async function graph(page: Page): Promise<Graph> {
  // `hasText` matches rendered text, which a <script> has none of, so the
  // blocks are read out and picked apart here instead.
  const blocks = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  const raw = blocks.find((block) => block.includes('"@graph"'));
  expect(raw, 'no page-level JSON-LD graph was rendered').toBeTruthy();
  return JSON.parse(raw!);
}

const node = (value: Graph, type: string) =>
  value['@graph'].find((item) => item['@type'] === type);

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
  const webPage = node(value, 'WebPage')!;
  const crumbs = node(value, 'BreadcrumbList')!;
  const article = node(value, 'Article')!;

  expect(webPage.url).toBe(canonical);
  expect(webPage.inLanguage).toBe('en');
  // The page hangs off the site node the layout emits, and points at both its
  // trail and the thing it is about.
  expect(webPage.isPartOf['@id']).toMatch(/#website$/);
  expect(webPage.breadcrumb['@id']).toBe(crumbs['@id']);
  expect(webPage.mainEntity['@id']).toBe(article['@id']);

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
  // The listing is not paginated, so the markup reports the whole count but
  // samples the rows, rather than shipping every one of them twice.
  expect(list.itemListElement.length).toBe(100);
  expect(list.itemListElement[0].position).toBe(1);
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
    expect(body).toContain(`<loc>${new URL(path, 'http://127.0.0.1:3000')}<`);
  }
  for (const path of ['/admin', '/api/', '/sign-in', '/install', '/update']) {
    expect(body).not.toContain(`${path}</loc>`);
  }
});
