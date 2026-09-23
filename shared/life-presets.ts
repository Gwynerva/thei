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

/**
 * The readings of one project's chronology that are pages of their own.
 *
 * A project's stages and its sections each used to have a list of their own;
 * those addresses now open the project's chronology through the matching
 * filter, and the two that are worth indexing keep a line in the sitemap.
 * Related events redirect too, but as a way in, not as a page to index.
 */
export interface ProjectTimelinePreset {
  id: 'stages' | 'sections' | 'events';
  /** The old address segment, `/projects/<x>/<segment>/`. */
  segment: string;
  filter: readonly LifeEntityKind[];
  /** Whether the filtered chronology is a page of its own in the sitemap. */
  listed: boolean;
}

export const PROJECT_TIMELINE_PRESETS: ProjectTimelinePreset[] = [
  { id: 'stages', segment: 'stages', filter: ['project-stage'], listed: true },
  {
    id: 'sections',
    segment: 'sections',
    filter: ['project-section'],
    listed: true,
  },
  { id: 'events', segment: 'events', filter: ['event'], listed: false },
];

/** The listed project preset a filter is, if it is one. */
export function projectTimelinePreset(
  filter: readonly LifeEntityKind[] | undefined,
): ProjectTimelinePreset | undefined {
  if (filter?.length !== 1) return undefined;
  return PROJECT_TIMELINE_PRESETS.find(
    (preset) => preset.listed && preset.filter[0] === filter[0],
  );
}
