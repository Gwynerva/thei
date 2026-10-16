import { and, desc, inArray, isNotNull, notInArray } from 'drizzle-orm';
import type { AssetType } from '#layers/thei/shared/asset';
import type { ActionTarget } from '../../actions/target';

/**
 * The files of the library as the checks look at them: a family at a time —
 * the original and every variant made of it share one description — named
 * by the file a model is shown, the original where it is kept. A run about
 * entities looks at the files they hold: placed on them or in their texts.
 */

export interface FileFamily {
  familyUuid: string;
  /** The file a model is shown and a proposal names. */
  assetUuid: string;
  type: AssetType;
  /** The bytes the family was made from: what its description is of. */
  originalHash: string;
  touchedAt: number;
  /** Its description; empty while it has none. */
  description: string;
  /** Whether it is placed in the archive, not only brought into a session. */
  placed: boolean;
}

/** The families of these entities' files, or of the files named. */
function familiesInScope(scope: readonly ActionTarget[]): Set<string> {
  const { db, schema } = THEI_SERVER.useDb();
  const families = new Set<string>();
  const files = scope
    .filter((key) => key.kind === 'asset')
    .map((key) => key.id);
  const entities = scope.filter((key) => key.kind !== 'asset');
  const holders: { type: string; id: string }[] = entities.map((key) => ({
    type: key.kind,
    id: key.id,
  }));
  if (entities.length) {
    const texts = db
      .select({
        contentUuid: schema.content.contentUuid,
        ownerType: schema.content.ownerType,
        ownerId: schema.content.ownerId,
      })
      .from(schema.content)
      .where(
        inArray(
          schema.content.ownerId,
          entities.map((key) => key.id),
        ),
      )
      .all() as { contentUuid: string; ownerType: string; ownerId: string }[];
    for (const text of texts)
      if (
        entities.some(
          (key) => key.kind === text.ownerType && key.id === text.ownerId,
        )
      )
        holders.push({ type: 'content', id: text.contentUuid });
  }
  const held = holders.length
    ? (db
        .select({
          assetUuid: schema.assetUsages.assetUuid,
          containerType: schema.assetUsages.containerType,
          containerId: schema.assetUsages.containerId,
        })
        .from(schema.assetUsages)
        .where(
          inArray(
            schema.assetUsages.containerId,
            holders.map((holder) => holder.id),
          ),
        )
        .all() as {
        assetUuid: string;
        containerType: string;
        containerId: string;
      }[])
    : [];
  const placed = [
    ...files,
    ...held
      .filter((row) =>
        holders.some(
          (holder) =>
            holder.type === row.containerType && holder.id === row.containerId,
        ),
      )
      .map((row) => row.assetUuid),
  ];
  if (!placed.length) return families;
  for (const row of db
    .select({ familyUuid: schema.assets.familyUuid })
    .from(schema.assets)
    .where(inArray(schema.assets.assetUuid, placed))
    .all() as { familyUuid: string }[])
    families.add(row.familyUuid);
  return families;
}

/** The library's families, the latest touched first; of the scope's only. */
export function fileFamilies(scope?: readonly ActionTarget[]): FileFamily[] {
  const { db, schema } = THEI_SERVER.useDb();
  const wanted = scope ? familiesInScope(scope) : undefined;
  if (wanted && !wanted.size) return [];
  const rows = db
    .select({
      assetUuid: schema.assets.assetUuid,
      familyUuid: schema.assets.familyUuid,
      settingsKey: schema.assets.settingsKey,
      contentHash: schema.assets.contentHash,
      type: schema.assets.type,
      touchedAt: schema.assets.touchedAt,
    })
    .from(schema.assets)
    .where(
      and(
        // An engine's own preview is no file of the library.
        isNotNull(schema.assets.settings),
        ...(wanted ? [inArray(schema.assets.familyUuid, [...wanted])] : []),
      ),
    )
    .orderBy(desc(schema.assets.touchedAt))
    .all() as {
    assetUuid: string;
    familyUuid: string;
    settingsKey: string;
    contentHash: string;
    type: AssetType;
    touchedAt: number;
  }[];
  const descriptions = new Map(
    (
      db
        .select({
          familyUuid: schema.assetDescriptions.familyUuid,
          text: schema.assetDescriptions.text,
        })
        .from(schema.assetDescriptions)
        .all() as { familyUuid: string; text: string }[]
    ).map((row) => [row.familyUuid, row.text]),
  );
  const placed = new Set(
    (
      db
        .select({ assetUuid: schema.assetUsages.assetUuid })
        .from(schema.assetUsages)
        .where(
          // A preview of a file, a file of a session: not the archive's.
          notInArray(schema.assetUsages.containerType, ['asset', 'ai-session']),
        )
        .all() as { assetUuid: string }[]
    ).map((row) => row.assetUuid),
  );
  const families = new Map<string, FileFamily>();
  for (const row of rows) {
    let family = families.get(row.familyUuid);
    if (!family)
      families.set(
        row.familyUuid,
        (family = {
          familyUuid: row.familyUuid,
          assetUuid: row.assetUuid,
          type: row.type,
          // Without its original kept, the family is named for its bytes.
          originalHash: row.familyUuid,
          touchedAt: row.touchedAt,
          description: descriptions.get(row.familyUuid) ?? '',
          placed: false,
        }),
      );
    if (placed.has(row.assetUuid)) family.placed = true;
    if (row.settingsKey === 'original') {
      family.assetUuid = row.assetUuid;
      family.type = row.type;
      family.originalHash = row.contentHash;
    }
    family.touchedAt = Math.max(family.touchedAt, row.touchedAt);
  }
  return [...families.values()].sort(
    (left, right) => right.touchedAt - left.touchedAt,
  );
}
