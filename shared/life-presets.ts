import { buildLifeUrl, type LifeEntityKind } from './life';

/**
 * A reading of the chronology that is a page in its own right.
 *
 * Most filters are a way of looking at the same feed, and every combination
 * pointing at itself would fill an index with near-duplicates — which is why
 * the feed canonicalises to its unfiltered self. A preset is the exception:
 * a filter the site treats as a destination, with its own name, its own
 * description and its own line in the sitemap.
 */
export interface LifePreset {
  id: 'diary';
  /** A short address that redirects here; the filtered feed stays canonical. */
  path: string;
  filter: readonly LifeEntityKind[];
  icon: 'thought';
}

export const LIFE_PRESETS: LifePreset[] = [
  { id: 'diary', path: '/diary/', filter: ['diary-entry'], icon: 'thought' },
];

/** The preset a filter is, if it is one at all. */
export function lifePreset(
  filter: readonly LifeEntityKind[] | undefined,
): LifePreset | undefined {
  if (!filter?.length) return undefined;
  return LIFE_PRESETS.find(
    (preset) =>
      preset.filter.length === filter.length &&
      preset.filter.every((kind) => filter.includes(kind)),
  );
}

/** The canonical address of a preset: the feed, read through its filter. */
export function lifePresetHref(preset: LifePreset): string {
  return buildLifeUrl({ filter: preset.filter });
}
