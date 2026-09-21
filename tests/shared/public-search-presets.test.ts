import { describe, expect, it } from 'vitest';
import {
  parsePublicSearchFilters,
  PUBLIC_SEARCH_PRESETS,
  publicSearchPreset,
  publicSearchPresetHref,
} from '../../shared/public-search';

function filters(query: Record<string, string> = {}) {
  const { page: _page, ...rest } = parsePublicSearchFilters(query);
  return rest;
}

describe('public search presets', () => {
  it('names the configurations that are pages of their own', () => {
    expect(publicSearchPreset(filters())?.id).toBe('all');
    expect(publicSearchPreset(filters({ type: 'project' }))?.id).toBe(
      'projects',
    );
    expect(publicSearchPreset(filters({ type: 'event' }))?.id).toBe('events');
    expect(
      publicSearchPreset(filters({ type: 'project', showcase: '1' }))?.id,
    ).toBe('showcase');
    expect(publicSearchPreset(filters({ type: 'project', cv: '1' }))?.id).toBe(
      'cv',
    );
  });

  it('is not a preset once a search is involved', () => {
    expect(publicSearchPreset(filters({ q: 'anything' }))).toBeUndefined();
    expect(publicSearchPreset(filters({ tags: 'travel' }))).toBeUndefined();
    expect(publicSearchPreset(filters({ exclude: 'travel' }))).toBeUndefined();
    expect(publicSearchPreset(filters(), 2)).toBeUndefined();
  });

  it('is not a preset for a combination nobody named', () => {
    expect(
      publicSearchPreset(filters({ type: 'project', showcase: '1', cv: '1' })),
    ).toBeUndefined();
  });

  it('points every preset at the configuration itself', () => {
    expect(
      PUBLIC_SEARCH_PRESETS.map((preset) => [
        preset.id,
        publicSearchPresetHref(preset),
      ]),
    ).toEqual([
      ['all', '/search/'],
      ['projects', '/search/?type=project'],
      ['events', '/search/?type=event'],
      ['showcase', '/search/?type=project&showcase=1'],
      ['cv', '/search/?type=project&cv=1'],
    ]);
  });

  it('gives a short address only to the named ones', () => {
    expect(
      PUBLIC_SEARCH_PRESETS.filter((preset) => preset.path).map(
        (preset) => preset.path,
      ),
    ).toEqual(['/projects/', '/events/', '/showcase/', '/cv/']);
  });

  it('round-trips: a short address leads to its own preset', () => {
    for (const preset of PUBLIC_SEARCH_PRESETS) {
      const href = publicSearchPresetHref(preset);
      const query = Object.fromEntries(
        new URLSearchParams(href.split('?')[1] ?? ''),
      );
      expect(publicSearchPreset(filters(query))?.id).toBe(preset.id);
    }
  });
});
