import { lookup } from 'node:dns/promises';
import {
  isIP,
  setDefaultAutoSelectFamily,
  setDefaultAutoSelectFamilyAttemptTimeout,
} from 'node:net';
import { load } from 'cheerio';
import { getPreviewFromContent } from 'link-preview-js';
import {
  EXTERNAL_LINK_PREVIEW_TIMEOUT,
  externalLinkHostname,
  normalizeExternalLinkUrl,
  truncateExternalLinkText,
  type ExternalLink,
} from '#layers/thei/shared/external-link';
import {
  convertExternalLinkFavicon,
  externalLinkMedia,
  externalLinkPreviewMedia,
  prepareExternalLinkFavicon,
  upsertExternalLink,
  writeExternalLinkFavicon,
} from './repository';

const MAX_FAVICON_BYTES = 2 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 1_500_000;
const MAX_REDIRECTS = 4;
const MAX_FAVICON_CANDIDATES = 5;
const DOCUMENT_BUDGET_MS = 6_000;
const FAVICON_DISCOVERY_BUDGET_MS = 500;
const DIRECT_FAVICON_ATTEMPT_MS = 700;
const USER_AGENT =
  'Mozilla/5.0 (compatible; TheiLinkPreview/1.0; +https://github.com/Gwynerva/thei)';
const GOOGLE_FAVICON_ENDPOINT = 'https://www.google.com/s2/favicons';

setDefaultAutoSelectFamily(true);
setDefaultAutoSelectFamilyAttemptTimeout(250);

export async function refreshExternalLink(
  rawUrl: unknown,
): Promise<ExternalLink> {
  const { result } = await collectExternalLink(rawUrl);
  return result;
}

export async function persistExternalLink(
  rawUrl: unknown,
): Promise<ExternalLink> {
  const { result, favicon } = await collectExternalLink(rawUrl);
  const { faviconKey, accentHue } = await writeExternalLinkFavicon(
    result.url,
    favicon,
  );
  const persisted = {
    ...result,
    faviconMedia: externalLinkMedia(faviconKey, accentHue, result.touchedAt),
  };
  upsertExternalLink({
    url: persisted.url,
    title: persisted.title,
    description: persisted.description,
    faviconKey,
    accentHue,
    touchedAt: persisted.touchedAt,
  });
  return persisted;
}

async function collectExternalLink(rawUrl: unknown) {
  const url = normalizeExternalLinkUrl(rawUrl);
  const deadline = Date.now() + EXTERNAL_LINK_PREVIEW_TIMEOUT;

  let preview: any;
  let document:
    { data: string; headers: Record<string, string>; url: string } | undefined;
  try {
    await withDeadline(assertPublicUrl(new URL(url)), deadline);
    document = await fetchDocument(
      url,
      0,
      Math.min(deadline, Date.now() + DOCUMENT_BUDGET_MS),
    );
    preview = await getPreviewFromContent(document);
  } catch {
    preview = undefined;
  }

  const discoveredFavicons = document
    ? await discoverFavicons(
        document,
        Math.min(deadline, Date.now() + FAVICON_DISCOVERY_BUDGET_MS),
      ).catch(() => [])
    : [];
  const favicon = await fetchFirstFavicon(
    [...discoveredFavicons, ...(preview?.favicons ?? [])],
    url,
    deadline,
  ).catch(() => undefined);
  const prepared = await prepareExternalLinkFavicon(favicon);
  const touchedAt = Date.now();
  const result: ExternalLink = {
    url,
    title:
      truncateExternalLinkText(preview?.title) ?? externalLinkHostname(url),
    description: truncateExternalLinkText(preview?.description),
    faviconMedia: externalLinkPreviewMedia(prepared.buffer, prepared.accentHue),
    hasFavicon: document != null && favicon != null,
    touchedAt,
    previewStatus: document ? 'complete' : 'fallback',
  };
  return { result, favicon };
}

async function fetchFirstFavicon(
  values: unknown,
  pageUrl: string,
  deadline: number,
): Promise<Buffer | undefined> {
  const uniqueCandidates = externalLinkFaviconCandidates(values, pageUrl);
  for (const [index, value] of uniqueCandidates.entries()) {
    if (Date.now() >= deadline) break;
    if (typeof value !== 'string') continue;
    try {
      const attemptDeadline =
        index === uniqueCandidates.length - 1
          ? deadline
          : Math.min(deadline, Date.now() + DIRECT_FAVICON_ATTEMPT_MS);
      const source = await fetchBinary(
        value.startsWith('data:') ? value : new URL(value, pageUrl).href,
        0,
        attemptDeadline,
      );
      await convertExternalLinkFavicon(source);
      return source;
    } catch {
      // Try the next advertised favicon.
    }
  }
  return undefined;
}

export function externalLinkFaviconCandidates(
  values: unknown,
  pageUrl: string,
) {
  const fallbacks = [
    new URL('/favicon.ico', pageUrl).href,
    new URL('/favicon.svg', pageUrl).href,
    googleFaviconUrl(pageUrl),
  ];
  const pageCandidates = Array.isArray(values)
    ? values.filter((value): value is string => typeof value === 'string')
    : [];
  const reservedPageSlots = Math.max(
    0,
    MAX_FAVICON_CANDIDATES - fallbacks.length,
  );

  return Array.from(
    new Set([...pageCandidates.slice(0, reservedPageSlots), ...fallbacks]),
  ).slice(0, MAX_FAVICON_CANDIDATES);
}

export function googleFaviconUrl(pageUrl: string) {
  const endpoint = new URL(GOOGLE_FAVICON_ENDPOINT);
  endpoint.searchParams.set('domain_url', pageUrl);
  endpoint.searchParams.set('sz', '64');
  return endpoint.href;
}

export async function discoverFavicons(
  document: {
    data: string;
    headers: Record<string, string>;
    url: string;
  },
  deadline = Date.now() + EXTERNAL_LINK_PREVIEW_TIMEOUT,
) {
  const $ = load(document.data);
  const candidates: Array<{ url: string; score: number }> = [];
  const add = (value: string | undefined, score = 100) => {
    if (!value) return;
    try {
      candidates.push({
        url: value.startsWith('data:')
          ? value
          : new URL(value, document.url).href,
        score,
      });
    } catch {
      // Ignore malformed icon declarations.
    }
  };

  $('link[href]').each((_, element) => {
    const rel = ($(element).attr('rel') ?? '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (
      rel.includes('icon') ||
      rel.includes('shortcut') ||
      rel.includes('apple-touch-icon') ||
      rel.includes('mask-icon') ||
      rel.includes('fluid-icon')
    ) {
      add($(element).attr('href'), iconSizeScore($(element).attr('sizes')));
    }
  });

  $('meta[content]').each((_, element) => {
    const name = (
      $(element).attr('name') ??
      $(element).attr('property') ??
      ''
    ).toLowerCase();
    if (
      name === 'msapplication-tileimage' ||
      /^msapplication-square\d+x\d+logo$/.test(name)
    ) {
      add($(element).attr('content'), 60);
    }
  });

  const headerLink = document.headers.link;
  if (headerLink) {
    for (const match of headerLink.matchAll(
      /<([^>]+)>\s*;\s*rel\s*=\s*"?([^";,]+)"?/gi,
    )) {
      if (match[2]?.toLowerCase().split(/\s+/).includes('icon')) {
        add(match[1], 70);
      }
    }
  }

  const manifestHref = $('link[rel~="manifest"]').attr('href');
  if (manifestHref) {
    try {
      const manifestUrl = new URL(manifestHref, document.url).href;
      const manifest = await fetchJson(manifestUrl, 0, deadline);
      if (Array.isArray(manifest.icons)) {
        for (const icon of manifest.icons) {
          if (!icon || typeof icon !== 'object') continue;
          const source = (icon as { src?: unknown }).src;
          if (typeof source !== 'string') continue;
          add(
            new URL(source, manifestUrl).href,
            iconSizeScore((icon as { sizes?: unknown }).sizes),
          );
        }
      }
    } catch {
      // A broken manifest must not discard document icons.
    }
  }

  return candidates
    .sort((left, right) => left.score - right.score)
    .map((candidate) => candidate.url);
}

function iconSizeScore(value: unknown) {
  if (typeof value !== 'string') return 100;
  if (value.toLowerCase().includes('any')) return 5;
  const sizes = Array.from(value.matchAll(/(\d+)x(\d+)/gi))
    .map((match) => Math.min(Number(match[1]), Number(match[2])))
    .filter((size) => Number.isFinite(size) && size > 0);
  if (!sizes.length) return 100;
  return (
    Math.min(...sizes.map((size) => Math.abs(size - 48))) +
    (sizes.some((size) => size >= 48) ? 0 : 40)
  );
}

async function fetchJson(
  value: string,
  redirects: number,
  deadline: number,
): Promise<any> {
  if (redirects > MAX_REDIRECTS) throw new Error('Too many redirects');
  const url = new URL(normalizeExternalLinkUrl(value));
  await withDeadline(assertPublicUrl(url), deadline);
  const response = await fetch(url, {
    redirect: 'manual',
    signal: deadlineSignal(deadline),
    headers: {
      accept: 'application/manifest+json,application/json',
      'user-agent': USER_AGENT,
    },
  });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) throw new Error('Invalid redirect');
    return fetchJson(new URL(location, url).href, redirects + 1, deadline);
  }
  if (!response.ok) throw new Error('Manifest request failed');
  return JSON.parse(
    new TextDecoder().decode(await readLimited(response, 256_000)),
  );
}

async function fetchDocument(
  value: string,
  redirects: number,
  deadline: number,
): Promise<{ data: string; headers: Record<string, string>; url: string }> {
  if (redirects > MAX_REDIRECTS) throw new Error('Too many redirects');
  const url = new URL(normalizeExternalLinkUrl(value));
  await withDeadline(assertPublicUrl(url), deadline);
  const response = await fetch(url, {
    redirect: 'manual',
    signal: deadlineSignal(deadline),
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'en,ru;q=0.9',
      'user-agent': USER_AGENT,
    },
  });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) throw new Error('Invalid redirect');
    return fetchDocument(new URL(location, url).href, redirects + 1, deadline);
  }
  if (!response.ok) throw new Error('Page request failed');
  const contentType = response.headers.get('content-type') ?? '';
  if (
    !contentType.toLowerCase().includes('text/html') &&
    !contentType.toLowerCase().includes('application/xhtml+xml')
  ) {
    throw new Error('Unsupported page type');
  }
  const bytes = await readLimited(response, MAX_DOCUMENT_BYTES);
  const charset =
    /charset=([^;\s]+)/i.exec(contentType)?.[1]?.replace(/["']/g, '') ??
    'utf-8';
  let data: string;
  try {
    data = new TextDecoder(charset).decode(bytes);
  } catch {
    data = new TextDecoder().decode(bytes);
  }
  return {
    data,
    headers: Object.fromEntries(response.headers.entries()),
    url: response.url || url.href,
  };
}

async function fetchBinary(
  value: string,
  redirects: number,
  deadline: number,
): Promise<Buffer> {
  if (value.startsWith('data:image/')) return decodeImageDataUrl(value);
  if (redirects > MAX_REDIRECTS) throw new Error('Too many redirects');
  const url = new URL(normalizeExternalLinkUrl(value));
  await withDeadline(assertPublicUrl(url), deadline);
  const response = await fetch(url, {
    redirect: 'manual',
    signal: deadlineSignal(deadline),
    headers: { accept: 'image/*', 'user-agent': USER_AGENT },
  });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) throw new Error('Invalid redirect');
    return fetchBinary(new URL(location, url).href, redirects + 1, deadline);
  }
  if (!response.ok) throw new Error('Favicon request failed');
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_FAVICON_BYTES) throw new Error('Favicon too large');
  const bytes = Buffer.from(await readLimited(response, MAX_FAVICON_BYTES));
  if (!bytes.length || bytes.length > MAX_FAVICON_BYTES) {
    throw new Error('Invalid favicon size');
  }
  return bytes;
}

function decodeImageDataUrl(value: string) {
  const match =
    /^data:image\/[^;,]+(?:;charset=[^;,]+)?(;base64)?,(.*)$/is.exec(value);
  if (!match) throw new Error('Invalid image data URL');
  const buffer = match[1]
    ? Buffer.from(match[2]!, 'base64')
    : Buffer.from(decodeURIComponent(match[2]!));
  if (!buffer.length || buffer.length > MAX_FAVICON_BYTES) {
    throw new Error('Invalid favicon size');
  }
  return buffer;
}

async function readLimited(response: Response, limit: number) {
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > limit) throw new Error('Response too large');
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) throw new Error('Response too large');
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function deadlineSignal(deadline: number) {
  return AbortSignal.timeout(Math.max(1, deadline - Date.now()));
}

async function withDeadline<T>(
  promise: Promise<T>,
  deadline: number,
): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('External link preview timed out');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('External link preview timed out')),
          remaining,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function assertPublicUrl(url: URL): Promise<string[]> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Unsupported URL protocol');
  }
  const records = await lookup(url.hostname, { all: true, verbatim: true });
  const addresses = records.map((record) => record.address);
  if (!addresses.length || addresses.some(isReservedAddress)) {
    throw new Error('Private or reserved hosts are not allowed');
  }
  return addresses;
}

export function isReservedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const parts = address.split('.').map(Number);
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b! >= 64 && b! <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && parts[2] === 2) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && parts[2] === 100) ||
      (a === 203 && b === 0 && parts[2] === 113) ||
      a! >= 224
    );
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    const mappedIpv4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized)?.[1];
    if (mappedIpv4) return isReservedAddress(mappedIpv4);
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('ff') ||
      normalized.startsWith('2001:db8:')
    );
  }
  return true;
}
