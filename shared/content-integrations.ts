/**
 * Integration blocks: a pasted address a richer, interactive form exists for.
 *
 * Each provider recognises its own addresses and owns the data it stores. The
 * editor offers every provider's pattern for paste; an address no provider
 * claims falls through to the ordinary external link block. Adding a provider
 * means adding an entry here and a player to `ContentIntegration.vue`.
 */

export interface ContentIntegrationProvider<
  TData extends { provider: string } = { provider: string },
> {
  id: TData['provider'];
  /**
   * Matches exactly the addresses `parse` accepts. Editor.js decides by this
   * pattern alone which tool receives a paste, so a looser pattern would turn
   * an address the provider cannot play into a broken block instead of a link.
   */
  pattern: RegExp;
  parse(url: string): TData | undefined;
  /** Validates stored data; throws on anything the provider cannot render. */
  normalize(data: Record<string, unknown>): TData;
  /** The address the integration stands for, shown wherever links are listed. */
  canonicalUrl(data: TData): string;
}

export type YouTubeIntegrationData = {
  provider: 'youtube';
  videoId: string;
  /** Start offset in whole seconds. */
  start?: number;
};

export type ContentIntegrationData = YouTubeIntegrationData;

const YOUTUBE_ID = /^[\w-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

/** `90`, `90s`, `1m30s`, `1h2m3s` → seconds. */
function parseYouTubeTime(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+s?$/.test(value)) return Number.parseInt(value, 10) || undefined;
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match || !match[0]) return undefined;
  const seconds =
    Number(match[1] ?? 0) * 3600 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3] ?? 0);
  return seconds || undefined;
}

export const youtubeIntegration: ContentIntegrationProvider<YouTubeIntegrationData> =
  {
    id: 'youtube',
    pattern:
      /^https?:\/\/(?:(?:(?:www|m|music)\.)?youtube\.com\/(?:watch\/?\?(?:[^\s#]*&)?v=[\w-]{11}|(?:shorts|embed|live|v)\/[\w-]{11})|(?:www\.)?youtube-nocookie\.com\/embed\/[\w-]{11}|youtu\.be\/[\w-]{11})(?:[?&/#][^\s]*)?$/i,
    parse(value) {
      let url: URL;
      try {
        url = new URL(value.trim());
      } catch {
        return undefined;
      }
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
      const host = url.hostname.toLowerCase();
      const segments = url.pathname.split('/').filter(Boolean);
      let videoId: string | undefined;
      if (host === 'youtu.be') {
        videoId = segments[0];
      } else if (YOUTUBE_HOSTS.has(host)) {
        if (segments[0] === 'watch') videoId = url.searchParams.get('v') ?? '';
        else if (['shorts', 'embed', 'live', 'v'].includes(segments[0] ?? ''))
          videoId = segments[1];
      }
      if (!videoId || !YOUTUBE_ID.test(videoId)) return undefined;
      const start = parseYouTubeTime(
        url.searchParams.get('t') ?? url.searchParams.get('start'),
      );
      return { provider: 'youtube', videoId, ...(start ? { start } : {}) };
    },
    normalize(data) {
      const videoId = data.videoId;
      if (typeof videoId !== 'string' || !YOUTUBE_ID.test(videoId))
        throw new Error('Invalid YouTube video');
      const start =
        typeof data.start === 'number' &&
        Number.isInteger(data.start) &&
        data.start > 0
          ? data.start
          : undefined;
      return { provider: 'youtube', videoId, ...(start ? { start } : {}) };
    },
    canonicalUrl(data) {
      const url = new URL('https://www.youtube.com/watch');
      url.searchParams.set('v', data.videoId);
      if (data.start) url.searchParams.set('t', `${data.start}s`);
      return url.href;
    },
  };

export const CONTENT_INTEGRATIONS: ContentIntegrationProvider<ContentIntegrationData>[] =
  [youtubeIntegration];

function findProvider(id: unknown) {
  return CONTENT_INTEGRATIONS.find((provider) => provider.id === id);
}

/** The integration a pasted address becomes, if any provider claims it. */
export function matchContentIntegration(
  url: unknown,
): ContentIntegrationData | undefined {
  if (typeof url !== 'string') return undefined;
  for (const provider of CONTENT_INTEGRATIONS) {
    if (!provider.pattern.test(url.trim())) continue;
    const data = provider.parse(url);
    if (data) return data;
  }
  return undefined;
}

export function normalizeContentIntegration(
  value: unknown,
): ContentIntegrationData {
  const data =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const provider = findProvider(data.provider);
  if (!provider) throw new Error('Unsupported integration');
  return provider.normalize(data);
}

export function contentIntegrationUrl(value: unknown): string | undefined {
  try {
    const data = normalizeContentIntegration(value);
    return findProvider(data.provider)!.canonicalUrl(data);
  } catch {
    return undefined;
  }
}

/** Editor.js paste patterns, one per provider. */
export function contentIntegrationPastePatterns(): Record<string, RegExp> {
  return Object.fromEntries(
    CONTENT_INTEGRATIONS.map((provider) => [provider.id, provider.pattern]),
  );
}
