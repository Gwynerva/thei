import type { AssetPlacement } from '../../../shared/asset-library';
import {
  CONTENT_ENTITY_TYPES,
  type ContentEntityType,
} from '../../../shared/content-link';
import { OWNER } from '../access-links/viewer';
import { findContentEntity } from '../content-entities';

function isContentEntity(type: string): type is ContentEntityType {
  return (CONTENT_ENTITY_TYPES as readonly string[]).includes(type);
}

/**
 * The places a file is used in, each with the picture that stands for it —
 * its icon, its banner, the first picture of its body — as the file's window
 * shows them, at the right edge of each place's chip. One lookup per place,
 * however many times the file is placed there; a place with no picture of
 * its own, or not an entity at all, goes without.
 */
export async function withPlaceMedia(
  placements: AssetPlacement[],
): Promise<AssetPlacement[]> {
  const pictures = new Map<
    string,
    Promise<AssetPlacement['source']['media']>
  >();
  for (const { source } of placements) {
    const key = `${source.type}:${source.id}`;
    if (pictures.has(key) || !isContentEntity(source.type)) continue;
    const type = source.type;
    pictures.set(
      key,
      findContentEntity({ entityType: type, entityId: source.id }, OWNER)
        .then((record) => record?.media('admin', true))
        .catch(() => undefined),
    );
  }
  return Promise.all(
    placements.map(async (placement) => {
      const media = await pictures.get(
        `${placement.source.type}:${placement.source.id}`,
      );
      return media
        ? { ...placement, source: { ...placement.source, media } }
        : placement;
    }),
  );
}
