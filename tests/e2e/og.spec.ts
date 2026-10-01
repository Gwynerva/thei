import {
  expect,
  request as playwright,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { E2E_ORIGIN } from './fixture-url';

/**
 * Open Graph cards in a production build: every kind of page names its own
 * card, the card is a 1200×630 picture, a private page has none, and an edit
 * that changes what a card shows gives it a new address.
 *
 * A production build carries only the files it traces; the card needs its
 * fonts (all 24 of them — a missing one fails the card rather than drawing
 * boxes), HarfBuzz's wasm and the build-time signature, so drawing one here
 * proves they made it into `.output`.
 */
const adminState = fileURLToPath(
  new URL('./.artifacts/admin.json', import.meta.url),
);

async function admin() {
  return playwright.newContext({
    baseURL: E2E_ORIGIN,
    storageState: adminState,
  });
}

async function cardOf(page: Page, path: string) {
  await page.goto(path);
  const image = await page
    .locator('meta[property="og:image"]')
    .getAttribute('content');
  const alt = await page
    .locator('meta[property="og:image:alt"]')
    .getAttribute('content');
  return { url: new URL(image!), alt: alt! };
}

async function expectPicture(request: APIRequestContext, url: URL) {
  const response = await request.get(`${url.pathname}${url.search}`);
  expect(response.status(), url.pathname).toBe(200);
  expect(response.headers()['content-type'], url.pathname).toBe('image/png');
  const body = await response.body();
  // A PNG's size sits in its first chunk, right after the signature.
  expect(
    { width: body.readUInt32BE(16), height: body.readUInt32BE(20) },
    url.pathname,
  ).toEqual({ width: 1200, height: 630 });
  return response;
}

const stamp = Date.now();
const content = {
  data: {
    blocks: [{ type: 'paragraph', data: { text: 'Written for the card.' } }],
  },
};

test('every kind of page previews as its own card', async ({
  page,
  request,
}) => {
  const owner = await admin();
  const child = {
    title: 'A part',
    summary: 'Of the whole',
    humanReadableSlug: 'part',
    isPrivate: false,
    content,
  };
  const project = await (
    await owner.post('/api/admin/projects', {
      data: {
        // Latin Extended, Greek and Vietnamese: the fonts for all three
        // must have made it into the build.
        title: 'Zażółć gęślą jaźń · Ελληνικά · Tiếng Việt',
        summary: 'A project with parts.',
        access: 'public',
        humanReadableSlug: 'og-project',
        publicId: `ogp${stamp}`,
        showcase: true,
        cv: false,
        descriptionContent: content,
        tags: [{ title: `og-tag-${stamp}` }],
        contentSections: [
          { ...child, isStage: false, publicId: `ogsec${stamp}` },
        ],
        stages: [
          {
            ...child,
            isStage: true,
            publicId: `ogst${stamp}`,
            periods: [{ startDate: '2025-05-01', endDate: '2025-08-31' }],
          },
        ],
      },
    })
  ).json();
  expect(project.type, JSON.stringify(project)).toBe('success');
  const event = await (
    await owner.post('/api/admin/events', {
      data: {
        title: 'A day worth a card',
        summary: 'Remembered for its card.',
        access: 'public',
        humanReadableSlug: 'og-event',
        publicId: `oge${stamp}`,
        content,
        periods: [{ startDate: '2024-06-14', endDate: '2024-06-14' }],
      },
    })
  ).json();
  expect(event.type, JSON.stringify(event)).toBe('success');
  // Any day far enough from the others not to be taken.
  const day = `2011-0${1 + (stamp % 9)}-1${stamp % 10}`;
  const diary = await (
    await owner.post('/api/admin/diary', {
      data: { date: day, access: 'public', content },
    })
  ).json();
  expect(diary.type, JSON.stringify(diary)).toBe('success');
  const stored = await (
    await owner.get(`/api/admin/projects/${project.projectUuid}`)
  ).json();
  await owner.dispose();

  const tag = stored.tags[0];
  const pages: [string, string][] = [
    ['/', '/og/site.png'],
    ['/life/', '/og/service/life.png'],
    ['/life/?f=diary-entry', '/og/service/diary.png'],
    ['/rewind/', '/og/service/rewind.png'],
    ['/search/', '/og/service/search.png'],
    ['/tags/', '/og/service/tags.png'],
    ['/pages/', '/og/service/pages.png'],
    ['/pages/page-0/', '/og/page/page-0.png'],
    [`/projects/og-project-ogp${stamp}/`, `/og/project/ogp${stamp}.png`],
    [
      `/projects/og-project-ogp${stamp}/stages/part-ogst${stamp}/`,
      `/og/stage/ogst${stamp}.png`,
    ],
    [
      `/projects/og-project-ogp${stamp}/sections/part-ogsec${stamp}/`,
      `/og/section/ogsec${stamp}.png`,
    ],
    [`/events/og-event-oge${stamp}/`, `/og/event/oge${stamp}.png`],
    [`/diary/${day}/`, `/og/diary/${day}.png`],
    [`/tags/${tag.slug}-${tag.publicId}/`, `/og/tag/${tag.publicId}.png`],
  ];
  for (const [path, card] of pages) {
    const { url, alt } = await cardOf(page, path);
    expect(url.pathname, path).toBe(card);
    expect(url.searchParams.get('v'), path).toMatch(/^[0-9a-f]{12}$/);
    expect(alt, path).toBeTruthy();
    await expectPicture(request, url);
  }
});

test('a private project has no card, and its address draws none', async ({
  request,
}) => {
  const owner = await admin();
  const publicId = `ogx${stamp}`;
  const created = await (
    await owner.post('/api/admin/projects', {
      data: {
        title: 'Nobody sees this',
        summary: 'Kept to oneself.',
        access: 'private',
        humanReadableSlug: 'hidden',
        publicId,
        showcase: false,
        cv: false,
        descriptionContent: content,
        contentSections: [],
        stages: [],
      },
    })
  ).json();
  await owner.dispose();
  expect(created.type, JSON.stringify(created)).toBe('success');
  expect((await request.get(`/og/project/${publicId}.png`)).status()).toBe(
    404,
  );
  expect((await request.get(`/api/og/project/${publicId}`)).status()).toBe(
    404,
  );
});

test('an edit that changes a card gives it a new address', async ({
  page,
  request,
}) => {
  const owner = await admin();
  const publicId = `ogv${stamp}`;
  const data = {
    title: 'Before the edit',
    summary: 'A card about to change.',
    access: 'public',
    humanReadableSlug: 'og-versioned',
    publicId,
    content,
    periods: [{ startDate: '2023-03-01', endDate: '2023-03-01' }],
  };
  const created = await (
    await owner.post('/api/admin/events', { data })
  ).json();
  expect(created.type, JSON.stringify(created)).toBe('success');
  const path = `/events/og-versioned-${publicId}/`;
  const before = await cardOf(page, path);
  const first = await expectPicture(request, before.url);

  expect(
    await (
      await owner.put(`/api/admin/events/${created.eventUuid}`, {
        data: { ...data, title: 'After the edit' },
      })
    ).json(),
  ).toMatchObject({ type: 'success' });
  await owner.dispose();

  const after = await cardOf(page, path);
  expect(after.url.searchParams.get('v')).not.toBe(
    before.url.searchParams.get('v'),
  );
  expect(after.alt).toContain('After');
  const second = await expectPicture(request, after.url);
  expect(second.headers().etag).not.toBe(first.headers().etag);
  // An address already shared keeps answering, with the current picture.
  const old = await expectPicture(request, before.url);
  expect(old.headers().etag).toBe(second.headers().etag);
});
