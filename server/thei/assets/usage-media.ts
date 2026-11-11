import type {
  AssetLibraryEntry,
  AssetLibraryFeedResponse,
  AssetPlacement,
  AssetSource,
} from '../../../shared/asset-library';
import {
  CONTENT_ENTITY_TYPES,
  type ContentEntityType,
} from '../../../shared/content-link';
import { OWNER } from '../access-links/viewer';
import { findContentEntity } from '../content-entities';

function isContentEntity(type: string): type is ContentEntityType {
  return (CONTENT_ENTITY_TYPES as readonly string[]).includes(type);
}

function sourceKey(source: Pick<AssetSource, 'type' | 'id'>) {
  return `${source.type}:${source.id}`;
}

/**
 * The picture that stands for each place — its icon, its banner, the first
 * picture of its body — by the place's key. One lookup per place, however
 * many times it is named; a place with no picture of its own, or not an
 * entity at all, goes without.
 */
async function placePictures(
  sources: AssetSource[],
): Promise<Map<string, AssetSource['media']>> {
  const pictures = new Map<string, Promise<AssetSource['media']>>();
  for (const source of sources) {
    const key = sourceKey(source);
    if (pictures.has(key) || !isContentEntity(source.type)) continue;
    const type = source.type;
    pictures.set(
      key,
      findContentEntity({ entityType: type, entityId: source.id }, OWNER)
        .then((record) => record?.media('admin', true))
        .catch(() => undefined),
    );
  }
  return new Map(
    await Promise.all(
      [...pictures].map(async ([key, media]) => [key, await media] as const),
    ),
  );
}

function withPicture<T extends AssetSource>(
  source: T,
  pictures: Map<string, AssetSource['media']>,
): T {
  const media = pictures.get(sourceKey(source));
  return media ? { ...source, media } : source;
}

/**
 * The places a file is used in, each with the picture that stands for it, as
 * the file's window shows them, at the right edge of each place's chip.
 */
export async function withPlaceMedia(
  placements: AssetPlacement[],
): Promise<AssetPlacement[]> {
  const pictures = await placePictures(placements.map((each) => each.source));
  return placements.map((placement) => {
    const source = withPicture(placement.source, pictures);
    return source === placement.source ? placement : { ...placement, source };
  });
}

/**
 * A page of the library's run, each place of it — those of what is being
 * edited too — with the picture that stands for it: the line that names a place over its files shows it at its right
 * edge.
 */
export async function withFeedPlaceMedia(
  feed: AssetLibraryFeedResponse,
): Promise<AssetLibraryFeedResponse> {
  const here = feed.here ?? [];
  const pictures = await placePictures(
    [...feed.entries, ...here].map((each) => each.place),
  );
  const pictured = (entry: AssetLibraryEntry) => {
    const place = withPicture(entry.place, pictures);
    return place === entry.place ? entry : { ...entry, place };
  };
  return {
    ...feed,
    entries: feed.entries.map(pictured),
    ...(feed.here ? { here: here.map(pictured) } : {}),
  };
}
