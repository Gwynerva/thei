import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { load, type CheerioAPI } from 'cheerio';
import {
  externalLinkHostname,
  normalizeExternalLinkUrl,
  truncateExternalLinkText,
  type ExternalLinkStatus,
} from '#layers/thei/shared/external-link';
import { convertExternalLinkFavicon } from './favicon';

/** The whole read, fallbacks included, has to finish within this. */
export const EXTERNAL_LINK_FETCH_TIMEOUT = 15_000;
const DOCUMENT_BUDGET_MS = 6_000;
const BROWSER_RETRY_BUDGET_MS = 2_500;
const ARCHIVE_LOOKUP_BUDGET_MS = 2_500;
const ARCHIVE_DOCUMENT_BUDGET_MS = 5_000;
const MANIFEST_BUDGET_MS = 500;
const FAVICON_ATTEMPT_MS = 700;
const MAX_DOCUMENT_BYTES = 1_500_000;
const MAX_MANIFEST_BYTES = 256_000;
const MAX_FAVICON_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const MAX_PAGE_FAVICON_CANDIDATES = 2;
const CHARSET_SNIFF_BYTES = 2048;
/** Answers that mean "not to a bot", worth one more try as a browser. */
const BROWSER_RETRY_STATUSES = new Set([403, 429, 503]);

const BOT_USER_AGENT =
  'Mozilla/5.0 (compatible; TheiLinkPreview/1.0; +https://github.com/Gwynerva/thei)';
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * The third parties asked when the site itself does not answer, and what
 * each of them is told. The archive cannot work without the page address;
 * the icon services are given the hostname and nothing else.
 */
export const EXTERNAL_LINK_SERVICES = {
  /** Receives the full page URL. */
  archiveAvailability(url: string) {
    const endpoint = new URL('https://archive.org/wayback/available');
    endpoint.searchParams.set('url', url);
    return endpoint.href;
  },
  /**
   * Receives the full page URL. `id_` asks for the page as it was captured,
   * without the archive's own toolbar wrapped around it.
   */
  archiveSnapshot(timestamp: string, url: string) {
    return `https://web.archive.org/web/${timestamp}id_/${url}`;
  },
  /** Receives the hostname only. */
  duckDuckGoFavicon(hostname: string) {
    return `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
  },
  /** Receives the hostname only. */
  googleFavicon(hostname: string) {
    const endpoint = new URL('https://www.google.com/s2/favicons');
    endpoint.searchParams.set('domain', hostname);
    endpoint.searchParams.set('sz', '64');
    return endpoint.href;
  },
};

export interface CollectedExternalLink {
  url: string;
  title?: string;
  description?: string;
  /** The icon as fetched; the repository converts and stores it. */
  favicon?: Buffer;
  status: ExternalLinkStatus;
}

/**
 * Why a fetch did not produce a page. `blocked` is the one that must never
 * be worked around: a host the guard refused is not sent to anyone else.
 */
export type ExternalLinkFetchFailure =
  'blocked' | 'unreachable' | 'unsupported';

export class ExternalLinkFetchError extends Error {
  constructor(
    public readonly kind: ExternalLinkFetchFailure,
    message: string,
  ) {
    super(message);
  }
}

interface FetchedDocument {
  $: CheerioAPI;
  headers: Headers;
  url: string;
}

type DocumentOutcome =
  | { kind: 'ok'; document: FetchedDocument }
  | { kind: 'refused'; status: number }
  | { kind: ExternalLinkFetchFailure };

/**
 * Reads what a link should show. Never throws for anything the remote side
 * does: a site that cannot be read yields its hostname and a `fallback`
 * status, and only a malformed address is an error.
 */
export async function collectExternalLink(
  rawUrl: unknown,
): Promise<CollectedExternalLink> {
  const url = normalizeExternalLinkUrl(rawUrl);
  const hostname = new URL(url).hostname;
  const deadline = Date.now() + EXTERNAL_LINK_FETCH_TIMEOUT;
  const outcome = await readDocument(url, deadline);

  if (outcome.kind === 'blocked') {
    return { url, title: externalLinkHostname(url), status: 'fallback' };
  }

  if (outcome.kind === 'ok') {
    const meta = extractDocumentMeta(outcome.document.$);
    const declared = await discoverFavicons(
      outcome.document,
      Math.min(deadline, Date.now() + MANIFEST_BUDGET_MS),
    ).catch(() => []);
    const favicon = await fetchFirstFavicon(
      faviconCandidates(declared, url, { site: true }),
      url,
      deadline,
    );
    return {
      url,
      title: meta.title ?? externalLinkHostname(url),
      description: meta.description,
      favicon,
      status: 'complete',
    };
  }

  // No page from the site. Its icons and an archived copy of the page are
  // looked for at the same time, so a slow archive costs nothing extra. A
  // site that answered with something other than a page is up: it keeps
  // its own icons and needs no archive.
  const answered = outcome.kind !== 'unreachable';
  const [archived, favicon] = await Promise.all([
    outcome.kind === 'unsupported'
      ? undefined
      : readArchivedDocument(url, deadline),
    fetchFirstFavicon(
      faviconCandidates([], url, { site: answered }),
      url,
      deadline,
    ),
  ]);
  const meta = archived ? extractDocumentMeta(archived.$) : {};
  return {
    url,
    title: meta.title ?? externalLinkHostname(url),
    description: meta.description,
    favicon,
    status:
      outcome.kind === 'unsupported'
        ? 'complete'
        : archived
          ? 'archived'
          : 'fallback',
  };
}

async function readDocument(
  url: string,
  deadline: number,
): Promise<DocumentOutcome> {
  const first = await requestDocument(
    url,
    BOT_USER_AGENT,
    Math.min(deadline, Date.now() + DOCUMENT_BUDGET_MS),
  );
  if (first.kind !== 'refused' || !BROWSER_RETRY_STATUSES.has(first.status))
    return first;
  const second = await requestDocument(
    url,
    BROWSER_USER_AGENT,
    Math.min(deadline, Date.now() + BROWSER_RETRY_BUDGET_MS),
  );
  return second.kind === 'ok' ? second : first;
}

async function requestDocument(
  url: string,
  userAgent: string,
  deadline: number,
): Promise<DocumentOutcome> {
  let response: GuardedResponse;
  try {
    response = await fetchGuarded(url, {
      accept: 'text/html,application/xhtml+xml',
      maxBytes: MAX_DOCUMENT_BYTES,
      deadline,
      userAgent,
    });
  } catch (error) {
    return { kind: failureKind(error) };
  }
  if (!response.ok) return { kind: 'refused', status: response.status };
  const contentType = response.headers.get('content-type') ?? '';
  if (!isHtml(contentType)) return { kind: 'unsupported' };
  return {
    kind: 'ok',
    document: {
      $: load(decodeHtml(response.bytes, contentType)),
      headers: response.headers,
      url: response.url,
    },
  };
}

async function readArchivedDocument(
  url: string,
  deadline: number,
): Promise<FetchedDocument | undefined> {
  try {
    const availability = await fetchGuarded(
      EXTERNAL_LINK_SERVICES.archiveAvailability(url),
      {
        accept: 'application/json',
        maxBytes: MAX_MANIFEST_BYTES,
        deadline: Math.min(deadline, Date.now() + ARCHIVE_LOOKUP_BUDGET_MS),
      },
    );
    if (!availability.ok) return undefined;
    const closest = JSON.parse(new TextDecoder().decode(availability.bytes))
      ?.archived_snapshots?.closest;
    if (!closest?.available || typeof closest.timestamp !== 'string')
      return undefined;
    const outcome = await requestDocument(
      EXTERNAL_LINK_SERVICES.archiveSnapshot(closest.timestamp, url),
      BOT_USER_AGENT,
      Math.min(deadline, Date.now() + ARCHIVE_DOCUMENT_BUDGET_MS),
    );
    return outcome.kind === 'ok' ? outcome.document : undefined;
  } catch {
    return undefined;
  }
}

function isHtml(contentType: string) {
  const type = contentType.toLowerCase();
  return type.includes('text/html') || type.includes('application/xhtml+xml');
}

/**
 * The page's own bytes as text. The header names the charset when the server
 * knows it; otherwise the document usually says so in its first lines, and a
 * page that says nothing is read as UTF-8.
 */
export function decodeHtml(bytes: Uint8Array, contentType: string): string {
  const declared =
    charsetFromContentType(contentType) ?? sniffDocumentCharset(bytes);
  if (declared) {
    try {
      return new TextDecoder(declared).decode(bytes);
    } catch {
      // Not a charset this runtime knows; the default will have to do.
    }
  }
  return new TextDecoder().decode(bytes);
}

function charsetFromContentType(value: string) {
  return /charset=["']?([^;"'\s]+)/i.exec(value)?.[1];
}

function sniffDocumentCharset(bytes: Uint8Array) {
  const head = new TextDecoder('latin1').decode(
    bytes.subarray(0, CHARSET_SNIFF_BYTES),
  );
  return /<meta[^>]*charset=["']?([^;"'\s>]+)/i.exec(head)?.[1];
}

/** Title and description as the page advertises them, in order of intent. */
export function extractDocumentMeta($: CheerioAPI): {
  title?: string;
  description?: string;
} {
  const values = new Map<string, string>();
  $('meta[content]').each((_, element) => {
    const key = (
      $(element).attr('property') ??
      $(element).attr('name') ??
      ''
    ).toLowerCase();
    const content = $(element).attr('content');
    if (key && content !== undefined && !values.has(key))
      values.set(key, content);
  });
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = truncateExternalLinkText(values.get(key));
      if (value) return value;
    }
    return undefined;
  };
  return {
    title:
      pick('og:title', 'twitter:title') ??
      truncateExternalLinkText($('title').first().text()),
    description: pick('og:description', 'twitter:description', 'description'),
  };
}

/**
 * Every icon the page declares, best first: the ones closest to the stored
 * size come before the rest, and a web manifest's icons join them when it
 * can be read within the budget.
 */
export async function discoverFavicons(
  document: FetchedDocument,
  deadline = Date.now() + MANIFEST_BUDGET_MS,
): Promise<string[]> {
  const { $ } = document;
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

  const headerLink = document.headers.get('link');
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
      const manifest = await fetchGuarded(manifestUrl, {
        accept: 'application/manifest+json,application/json',
        maxBytes: MAX_MANIFEST_BYTES,
        deadline,
      });
      const icons = manifest.ok
        ? JSON.parse(new TextDecoder().decode(manifest.bytes))?.icons
        : undefined;
      if (Array.isArray(icons)) {
        for (const icon of icons) {
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

/**
 * Where to look for an icon, in order: what the page declares, the two
 * places every site keeps one, then the services that keep a copy. A site
 * that could not be reached is not asked for its own icons either.
 */
export function faviconCandidates(
  declared: string[],
  pageUrl: string,
  { site }: { site: boolean },
): string[] {
  const hostname = new URL(pageUrl).hostname;
  return Array.from(
    new Set([
      ...declared.slice(0, MAX_PAGE_FAVICON_CANDIDATES),
      ...(site
        ? [
            new URL('/favicon.ico', pageUrl).href,
            new URL('/favicon.svg', pageUrl).href,
          ]
        : []),
      EXTERNAL_LINK_SERVICES.duckDuckGoFavicon(hostname),
      EXTERNAL_LINK_SERVICES.googleFavicon(hostname),
    ]),
  );
}

async function fetchFirstFavicon(
  candidates: string[],
  pageUrl: string,
  deadline: number,
): Promise<Buffer | undefined> {
  for (const [index, candidate] of candidates.entries()) {
    if (Date.now() >= deadline) break;
    try {
      const attemptDeadline =
        index === candidates.length - 1
          ? deadline
          : Math.min(deadline, Date.now() + FAVICON_ATTEMPT_MS);
      const source = candidate.startsWith('data:')
        ? decodeImageDataUrl(candidate)
        : await fetchBinary(
            new URL(candidate, pageUrl).href,
            MAX_FAVICON_BYTES,
            attemptDeadline,
          );
      // Converting is the only reliable test that these bytes are an image.
      await convertExternalLinkFavicon(source);
      return source;
    } catch {
      // Try the next candidate.
    }
  }
  return undefined;
}

async function fetchBinary(url: string, maxBytes: number, deadline: number) {
  const response = await fetchGuarded(url, {
    accept: 'image/*',
    maxBytes,
    deadline,
  });
  if (!response.ok) throw new Error('Favicon request failed');
  if (!response.bytes.length) throw new Error('Empty favicon');
  return Buffer.from(response.bytes);
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

export interface GuardedResponse {
  ok: boolean;
  status: number;
  headers: Headers;
  /** Where the response came from, after redirects. */
  url: string;
  /** Empty for a response that was not ok. */
  bytes: Uint8Array;
}

interface GuardedFetchOptions {
  accept: string;
  maxBytes: number;
  deadline: number;
  userAgent?: string;
}

/**
 * The one way anything here reaches the network. Redirects are followed by
 * hand so every hop passes the address guard, the body is read up to the
 * limit and no further, and the deadline bounds the whole exchange. Throws
 * an `ExternalLinkFetchError` that says which kind of failure it was.
 */
export async function fetchGuarded(
  value: string,
  {
    accept,
    maxBytes,
    deadline,
    userAgent = BOT_USER_AGENT,
  }: GuardedFetchOptions,
): Promise<GuardedResponse> {
  let url = guardedUrl(value);
  for (let redirects = 0; ; redirects += 1) {
    await withDeadline(assertPublicUrl(url), deadline);
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: deadlineSignal(deadline),
        headers: {
          accept,
          'accept-language': 'en,ru;q=0.9',
          'user-agent': userAgent,
        },
      });
    } catch (error) {
      throw new ExternalLinkFetchError(
        'unreachable',
        error instanceof Error ? error.message : 'Request failed',
      );
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => {});
      const location = response.headers.get('location');
      if (!location || redirects >= MAX_REDIRECTS)
        throw new ExternalLinkFetchError('unsupported', 'Bad redirect');
      url = guardedUrl(new URL(location, url).href);
      continue;
    }
    const finalUrl = response.url || url.href;
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return {
        ok: false,
        status: response.status,
        headers: response.headers,
        url: finalUrl,
        bytes: new Uint8Array(),
      };
    }
    return {
      ok: true,
      status: response.status,
      headers: response.headers,
      url: finalUrl,
      bytes: await readLimited(response, maxBytes),
    };
  }
}

function guardedUrl(value: string) {
  try {
    return new URL(normalizeExternalLinkUrl(value));
  } catch (error) {
    throw new ExternalLinkFetchError(
      'blocked',
      error instanceof Error ? error.message : 'Invalid URL',
    );
  }
}

function failureKind(error: unknown): ExternalLinkFetchFailure {
  return error instanceof ExternalLinkFetchError ? error.kind : 'unreachable';
}

async function readLimited(response: Response, limit: number) {
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > limit) {
    await response.body?.cancel().catch(() => {});
    throw new ExternalLinkFetchError('unsupported', 'Response too large');
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel().catch(() => {});
        throw new ExternalLinkFetchError('unsupported', 'Response too large');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ExternalLinkFetchError) throw error;
    throw new ExternalLinkFetchError(
      'unreachable',
      error instanceof Error ? error.message : 'Read failed',
    );
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
  if (remaining <= 0)
    throw new ExternalLinkFetchError('unreachable', 'Timed out');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new ExternalLinkFetchError('unreachable', 'Timed out')),
          remaining,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Refuses addresses that lead inside: the server must not be turned into a
 * way of reading its own network. Resolution happens here, so a name that
 * does not resolve is simply unreachable.
 */
export async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ExternalLinkFetchError('blocked', 'Unsupported URL protocol');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let records: Array<{ address: string }>;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    throw new ExternalLinkFetchError(
      'unreachable',
      error instanceof Error ? error.message : 'Name not found',
    );
  }
  if (
    !records.length ||
    records.some((record) => isReservedAddress(record.address))
  ) {
    throw new ExternalLinkFetchError(
      'blocked',
      'Private or reserved hosts are not allowed',
    );
  }
}

export function isReservedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const parts = address.split('.').map(Number);
    const [a, b, c] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b! >= 64 && b! <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a! >= 224
    );
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    const mappedIpv4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized)?.[1];
    if (mappedIpv4) return isReservedAddress(mappedIpv4);
    const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(
      normalized,
    );
    if (mappedHex) {
      const high = parseInt(mappedHex[1]!, 16);
      const low = parseInt(mappedHex[2]!, 16);
      return isReservedAddress(
        `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`,
      );
    }
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('64:ff9b:') ||
      normalized.startsWith('2002:') ||
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
