import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { load } from 'cheerio';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async (hostname: string) => {
    if (hostname === 'internal.test')
      return [{ address: '10.0.0.5', family: 4 }];
    if (hostname === 'missing.test')
      throw Object.assign(new Error('getaddrinfo ENOTFOUND missing.test'), {
        code: 'ENOTFOUND',
      });
    return [{ address: '93.184.216.34', family: 4 }];
  }),
}));

import {
  collectExternalLink,
  decodeHtml,
  discoverFavicons,
  EXTERNAL_LINK_SERVICES,
  extractDocumentMeta,
  faviconCandidates,
  isReservedAddress,
} from '../../server/thei/external-links/fetch';

type Handler = (
  url: string,
  init: RequestInit,
) => Response | Promise<Response> | undefined;

const calls: Array<{ url: string; userAgent: string }> = [];

function stubFetch(handler: Handler) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = String(input);
      const headers = new Headers(init.headers);
      calls.push({ url, userAgent: headers.get('user-agent') ?? '' });
      return (await handler(url, init)) ?? new Response('', { status: 404 });
    }),
  );
}

function page(
  body: string | Uint8Array,
  contentType = 'text/html; charset=utf-8',
) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': contentType },
  });
}

async function icon() {
  return new Response(
    await sharp({
      create: { width: 16, height: 16, channels: 4, background: '#ff0000' },
    })
      .png()
      .toBuffer(),
    { status: 200, headers: { 'content-type': 'image/png' } },
  );
}

const urls = (pattern: RegExp) =>
  calls.filter((call) => pattern.test(call.url)).map((call) => call.url);

beforeEach(() => {
  calls.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

describe('collecting a link', () => {
  it('reads the page the way it wants to be seen, and its own icon first', async () => {
    stubFetch((url) => {
      if (url === 'https://example.com/post')
        return page(`<html><head>
          <title>Plain title</title>
          <meta property="og:title" content="  Open Graph  title ">
          <meta name="twitter:description" content="From Twitter">
          <meta name="description" content="Generic">
          <link rel="icon" href="/brand.png">
        </head></html>`);
      if (url === 'https://example.com/brand.png') return icon();
      return undefined;
    });
    const link = await collectExternalLink('https://example.com/post');
    expect(link).toMatchObject({
      url: 'https://example.com/post',
      title: 'Open Graph title',
      description: 'From Twitter',
      status: 'complete',
    });
    expect(link.favicon).toBeInstanceOf(Buffer);
    expect(urls(/archive\.org|duckduckgo|google\.com/)).toEqual([]);
    expect(urls(/favicon\.ico/)).toEqual([]);
  });

  it('decodes a charset the page declares only in its own markup', async () => {
    const body = Buffer.concat([
      Buffer.from('<html><head><meta charset="windows-1251"><title>'),
      Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]),
      Buffer.from('</title></head></html>'),
    ]);
    stubFetch((url) =>
      url === 'https://example.com/' ? page(body, 'text/html') : undefined,
    );
    const link = await collectExternalLink('https://example.com/');
    expect(link.title).toBe('Привет');
    expect(link.status).toBe('complete');
  });

  it('keeps a site that answered with something other than a page, without asking the archive', async () => {
    stubFetch(async (url) => {
      if (url === 'https://example.com/paper.pdf')
        return page('%PDF-1.4', 'application/pdf');
      if (url === 'https://example.com/favicon.ico') return icon();
      return undefined;
    });
    const link = await collectExternalLink('https://example.com/paper.pdf');
    expect(link).toMatchObject({ title: 'example.com', status: 'complete' });
    expect(link.favicon).toBeInstanceOf(Buffer);
    expect(urls(/archive\.org/)).toEqual([]);
  });

  it('tries once more as a browser when a bot is turned away', async () => {
    stubFetch((url, init) => {
      const agent = new Headers(init.headers).get('user-agent') ?? '';
      if (url !== 'https://example.com/') return undefined;
      return agent.includes('TheiLinkPreview')
        ? new Response('no bots', { status: 403 })
        : page('<title>For browsers</title>');
    });
    const link = await collectExternalLink('https://example.com/');
    expect(link).toMatchObject({ title: 'For browsers', status: 'complete' });
    expect(
      calls.filter((call) => call.url === 'https://example.com/'),
    ).toHaveLength(2);
    expect(urls(/archive\.org/)).toEqual([]);
  });

  it('reads an archived copy when the site refuses, and says so', async () => {
    stubFetch(async (url) => {
      if (url === 'https://example.com/gone')
        return new Response('', { status: 403 });
      if (url.startsWith('https://archive.org/wayback/available'))
        return new Response(
          JSON.stringify({
            archived_snapshots: {
              closest: { available: true, timestamp: '20240101000000' },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      if (
        url ===
        'https://web.archive.org/web/20240101000000id_/https://example.com/gone'
      )
        return page(
          '<title>As it was</title><meta name="description" content="Kept by the archive">',
        );
      if (url === EXTERNAL_LINK_SERVICES.duckDuckGoFavicon('example.com'))
        return icon();
      return undefined;
    });
    const link = await collectExternalLink('https://example.com/gone');
    expect(link).toMatchObject({
      title: 'As it was',
      description: 'Kept by the archive',
      status: 'archived',
    });
    expect(link.favicon).toBeInstanceOf(Buffer);
    expect(
      new URL(urls(/archive\.org\/wayback/)[0]!).searchParams.get('url'),
    ).toBe('https://example.com/gone');
  });

  it('gives up quietly when nothing answers, with an icon from a service', async () => {
    stubFetch(async (url) => {
      if (url.startsWith('https://example.com/'))
        throw new TypeError('fetch failed');
      if (url.startsWith('https://archive.org/'))
        throw new TypeError('fetch failed');
      if (url === EXTERNAL_LINK_SERVICES.googleFavicon('example.com'))
        return icon();
      return undefined;
    });
    const link = await collectExternalLink('https://example.com/down');
    expect(link).toMatchObject({ title: 'example.com', status: 'fallback' });
    expect(link.description).toBeUndefined();
    expect(link.favicon).toBeInstanceOf(Buffer);
    // A site that could not be reached is not asked for its icons either.
    expect(urls(/example\.com\/favicon/)).toEqual([]);
  });

  it('never sends a guarded host anywhere else', async () => {
    stubFetch(() => undefined);
    const link = await collectExternalLink('http://internal.test/admin');
    expect(link).toMatchObject({ title: 'internal.test', status: 'fallback' });
    expect(calls).toEqual([]);
  });

  it('follows a redirect, but not into a guarded host', async () => {
    stubFetch((url) => {
      if (url === 'https://example.com/old')
        return new Response('', { status: 301, headers: { location: '/new' } });
      if (url === 'https://example.com/new')
        return page('<title>Moved here</title>');
      if (url === 'https://example.com/trap')
        return new Response('', {
          status: 302,
          headers: { location: 'http://internal.test/' },
        });
      return undefined;
    });
    expect(await collectExternalLink('https://example.com/old')).toMatchObject({
      title: 'Moved here',
      status: 'complete',
    });
    calls.length = 0;
    expect(await collectExternalLink('https://example.com/trap')).toMatchObject(
      {
        status: 'fallback',
      },
    );
    expect(urls(/internal\.test/)).toEqual([]);
  });

  it('does not read a page that says it is too large', async () => {
    stubFetch((url) =>
      url === 'https://example.com/huge'
        ? new Response('<title>Never read</title>', {
            status: 200,
            headers: {
              'content-type': 'text/html',
              'content-length': String(10_000_000),
            },
          })
        : undefined,
    );
    const link = await collectExternalLink('https://example.com/huge');
    expect(link.title).toBe('example.com');
  });

  it('treats a hostname that does not resolve as unreachable, and still asks the archive', async () => {
    stubFetch(() => undefined);
    const link = await collectExternalLink('https://missing.test/');
    expect(link.status).toBe('fallback');
    expect(urls(/^https:\/\/missing\.test/)).toEqual([]);
    expect(urls(/archive\.org\/wayback/)).toHaveLength(1);
  });
});

describe('the pieces', () => {
  it('asks the icon services for the hostname and nothing else', () => {
    const candidates = faviconCandidates(
      [
        'https://cdn.example.com/a.png',
        'https://cdn.example.com/b.png',
        'https://cdn.example.com/c.png',
      ],
      'https://www.example.com/private/page?token=secret',
      { site: true },
    );
    expect(candidates).toEqual([
      'https://cdn.example.com/a.png',
      'https://cdn.example.com/b.png',
      'https://www.example.com/favicon.ico',
      'https://www.example.com/favicon.svg',
      'https://icons.duckduckgo.com/ip3/www.example.com.ico',
      EXTERNAL_LINK_SERVICES.googleFavicon('www.example.com'),
    ]);
    const google = new URL(
      EXTERNAL_LINK_SERVICES.googleFavicon('www.example.com'),
    );
    expect(google.searchParams.get('domain')).toBe('www.example.com');
    expect(google.href).not.toContain('secret');
    expect(
      faviconCandidates([], 'https://example.com/', { site: false }),
    ).toEqual([
      'https://icons.duckduckgo.com/ip3/example.com.ico',
      EXTERNAL_LINK_SERVICES.googleFavicon('example.com'),
    ]);
  });

  it('prefers the header charset over the markup and survives an unknown one', () => {
    const bytes = new TextEncoder().encode(
      '<meta charset="latin1"><title>é</title>',
    );
    expect(decodeHtml(bytes, 'text/html; charset=utf-8')).toContain(
      '<title>é</title>',
    );
    expect(decodeHtml(bytes, 'text/html; charset=nonsense-9')).toContain(
      '<title>',
    );
  });

  it('takes the first of each kind of meta and falls back to the title element', () => {
    expect(
      extractDocumentMeta(
        load(
          `<meta name="og:description" content="first"><meta property="og:description" content="second"><title>  Only   title </title>`,
        ),
      ),
    ).toEqual({ title: 'Only title', description: 'first' });
    expect(extractDocumentMeta(load('<p>nothing</p>'))).toEqual({
      title: undefined,
      description: undefined,
    });
  });

  it('discovers and prioritizes declared relative favicon variants', async () => {
    const icons = await discoverFavicons({
      url: 'https://example.com/some/page',
      headers: new Headers({ link: '</header-icon.png>; rel="icon"' }),
      $: load(`<html><head>
        <link rel="icon" sizes="32x32" href="/icon-32.png">
        <link rel="shortcut icon" sizes="48x48" href="/icon-48.png">
        <link rel="icon" sizes="any" href="/icon.svg">
        <link rel="apple-touch-icon" href="/apple.png">
        <meta name="msapplication-TileImage" content="/tile.png">
      </head></html>`),
    });
    expect(icons[0]).toBe('https://example.com/icon-48.png');
    expect(icons).toContain('https://example.com/icon.svg');
    expect(icons).toContain('https://example.com/apple.png');
    expect(icons).toContain('https://example.com/tile.png');
    expect(icons).toContain('https://example.com/header-icon.png');
  });
});

describe('the address guard', () => {
  it.each([
    '127.0.0.1',
    '10.2.3.4',
    '169.254.1.1',
    '172.16.0.1',
    '192.168.1.1',
    '192.0.0.8',
    '192.0.2.1',
    '198.51.100.1',
    '203.0.113.1',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '64:ff9b::7f00:1',
    '2002:7f00:1::',
    'fd00::1',
    'fe80::1',
  ])('rejects reserved address %s', (address) => {
    expect(isReservedAddress(address)).toBe(true);
  });

  it.each(['1.1.1.1', '8.8.8.8', '192.0.32.8', '2606:4700:4700::1111'])(
    'allows public address %s',
    (address) => {
      expect(isReservedAddress(address)).toBe(false);
    },
  );
});
