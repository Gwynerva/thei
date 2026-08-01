import type { MediaDescriptor } from './media';

export const EXTERNAL_LINK_TEXT_LIMIT = 300;
export const EXTERNAL_LINK_PREVIEW_TIMEOUT = 10_000;
export const EXTERNAL_LINK_ICON_PATH =
  'M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h560v-280h80v280q0 33-23.5 56.5T760-120H200Zm188-212-56-56 371-372H560v-80h280v280h-80v-143L388-332Z';

export type ExternalLinkPreviewStatus = 'complete' | 'fallback';

export interface ExternalLink {
  url: string;
  title?: string;
  description?: string;
  faviconMedia: MediaDescriptor;
  hasFavicon?: boolean;
  touchedAt: number;
  previewStatus?: ExternalLinkPreviewStatus;
}

export interface ProjectExternalLink extends ExternalLink {
  name: string;
  isPrivate: boolean;
}

export interface ProjectExternalLinkSaveItem {
  url: string;
  name: string;
  isPrivate: boolean;
  touchedAt?: number;
}

export type ProjectExternalLinkEditItem = ProjectExternalLinkSaveItem &
  Partial<Omit<ExternalLink, 'url'>>;

export function externalLinkHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

export function normalizeExternalLinkAccentHue(
  value: unknown,
): number | undefined {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < 360
    ? value
    : undefined;
}

export function normalizeExternalLinkUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid external link URL');
  const trimmed = value.trim();
  if (!trimmed) throw new Error('External link URL cannot be empty');

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Invalid external link URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('External link must use HTTP or HTTPS');
  }
  if (url.username || url.password) {
    throw new Error('External link cannot contain credentials');
  }
  return url.href;
}

export function truncateExternalLinkText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  const characters = Array.from(normalized);
  if (characters.length <= EXTERNAL_LINK_TEXT_LIMIT) return normalized;
  return `${characters.slice(0, EXTERNAL_LINK_TEXT_LIMIT - 1).join('')}…`;
}
