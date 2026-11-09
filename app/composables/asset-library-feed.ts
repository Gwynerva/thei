import {
  assetSourceKey,
  type AssetLibraryEntry,
  type AssetLibraryPlace,
} from '#layers/thei/shared/asset-library';

/**
 * The library's run as `AssetLibraryFeed` shows it: the entries it has read
 * so far, page by page, and the places and months they stand in.
 */

export interface LibraryFeedPlaceGroup {
  /** The place, as `assetSourceKey` names it. */
  key: string;
  /**
   * The place on its day, which tells its groups apart: files nothing holds
   * stand at the day of each upload, one place on many days of a month.
   */
  id: string;
  place: AssetLibraryPlace;
  entries: AssetLibraryEntry[];
}
export interface LibraryFeedMonthGroup {
  /** `YYYY-MM`, or empty for no day. */
  key: string;
  count: number;
  places: LibraryFeedPlaceGroup[];
}

/** A file in a place: what the run shows once. */
const entryKey = (entry: AssetLibraryEntry) =>
  `${assetSourceKey(entry.place)} ${entry.asset.assetUuid}`;

/**
 * Of fetched entries, the ones not shown yet. The run is read a page at a
 * time by its offset, and an upload or a save between two pages moves it:
 * a file in a place may come again, and would stand twice.
 */
export function libraryFeedNewEntries(
  shown: readonly AssetLibraryEntry[],
  fetched: readonly AssetLibraryEntry[],
): AssetLibraryEntry[] {
  const keys = new Set(shown.map(entryKey));
  return fetched.filter((entry) => {
    const key = entryKey(entry);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

/** The places the search names, each once with its files, before the run. */
export function libraryFeedNamed(
  entries: readonly AssetLibraryEntry[],
): LibraryFeedPlaceGroup[] {
  const result: LibraryFeedPlaceGroup[] = [];
  for (const entry of entries) {
    if (!entry.place.named) continue;
    const key = assetSourceKey(entry.place);
    let place = result.find((each) => each.key === key);
    if (!place) {
      place = { key, id: key, place: entry.place, entries: [] };
      result.push(place);
    }
    place.entries.push(entry);
  }
  return result;
}

/** The run by months, each with its places on their days in turn. */
export function libraryFeedMonths(
  entries: readonly AssetLibraryEntry[],
): LibraryFeedMonthGroup[] {
  const result: LibraryFeedMonthGroup[] = [];
  for (const entry of entries) {
    if (entry.place.named) continue;
    const key = entry.place.date?.slice(0, 7) ?? '';
    let month = result.at(-1);
    if (!month || month.key !== key) {
      month = { key, count: 0, places: [] };
      result.push(month);
    }
    month.count++;
    const placeKey = assetSourceKey(entry.place);
    const id = `${placeKey} ${entry.place.date ?? ''}`;
    let place = month.places.at(-1);
    if (!place || place.id !== id) {
      place = { key: placeKey, id, place: entry.place, entries: [] };
      month.places.push(place);
    }
    place.entries.push(entry);
  }
  return result;
}
