import type { OgImageKind } from '#layers/thei/shared/og-url';
import type { OgServiceId } from './model';

/**
 * What a shared link can be a picture of.
 *
 * Only what a stranger can open gets a card. A private project has none: the
 * card would preview something the visitor is about to be refused, and its
 * title alone would say more than the 404 does. The admin panel has none
 * either — it is not a place anyone shares a link to.
 */
export type OgTargetKind = OgImageKind;

export const OG_TARGET_KINDS: OgTargetKind[] = [
  'site',
  'service',
  'project',
  'section',
  'event',
  'page',
  'diary',
  'tag',
];

/**
 * The pages that are not one entity: the chronology and its diary view,
 * the rewind, the search and each of its presets — `projects`, `events`,
 * `showcase`, `cv`, with `search` for the one of everything — and the
 * directories.
 */
export const OG_SERVICE_IDS: OgServiceId[] = [
  'life',
  'diary',
  'rewind',
  'search',
  'projects',
  'events',
  'showcase',
  'cv',
  'tags',
  'pages',
];

export interface OgTarget {
  kind: OgTargetKind;
  /** Public id, slug, date or service name; `site` for the site card. */
  id: string;
}

export function parseOgTarget(kind: string, id: string): OgTarget | undefined {
  if (!OG_TARGET_KINDS.includes(kind as OgTargetKind) || !id) return undefined;
  if (kind === 'site') return id === 'site' ? { kind, id } : undefined;
  if (kind === 'service' && !OG_SERVICE_IDS.includes(id as OgServiceId))
    return undefined;
  return { kind: kind as OgTargetKind, id };
}
