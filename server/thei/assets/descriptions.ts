import { and, eq, inArray, isNotNull, notExists } from 'drizzle-orm';
import {
  ASSET_DESCRIPTION_MAX,
  cleanAssetDescription,
  type AssetDescription,
} from '#layers/thei/shared/asset-description';

/**
 * A file's description, kept once for its family: the original and every
 * variant made of it describe the same thing, so it is read and written by
 * any file of the family. A save names the version it was made over and is
 * refused when another landed since; an empty one takes the description
 * away. It goes with the last file of its family.
 */

/** A save made over a description that changed since it was read. */
export class AssetDescriptionConflict extends Error {
  constructor(readonly current: AssetDescription) {
    super('The description was changed elsewhere in the meantime.');
    this.name = 'AssetDescriptionConflict';
  }
}

/** A description the save cannot keep. */
export class AssetDescriptionInvalid extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetDescriptionInvalid';
  }
}

/**
 * The family of a library file, or nothing for one that is not there. An
 * engine's own helper file — a preview — has no description of its own.
 */
export function assetFamilyOf(
  assetUuid: string,
  tx?: any,
): { assetUuid: string; familyUuid: string } | undefined {
  const { db, schema } = THEI_SERVER.useDb();
  const row = (tx ?? db)
    .select({
      assetUuid: schema.assets.assetUuid,
      familyUuid: schema.assets.familyUuid,
    })
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.assetUuid, assetUuid),
        isNotNull(schema.assets.settings),
      ),
    )
    .get() as { assetUuid: string; familyUuid: string } | undefined;
  return row;
}

/** A library file of the family, any: what its description is read through. */
export function fileOfFamily(familyUuid: string): string | undefined {
  const { db, schema } = THEI_SERVER.useDb();
  const row = db
    .select({ assetUuid: schema.assets.assetUuid })
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.familyUuid, familyUuid),
        isNotNull(schema.assets.settings),
      ),
    )
    .get() as { assetUuid: string } | undefined;
  return row?.assetUuid;
}

/** Whether any file of the family is still in the library. */
export function familyExists(familyUuid: string, tx?: any): boolean {
  const { db, schema } = THEI_SERVER.useDb();
  return Boolean(
    (tx ?? db)
      .select({ assetUuid: schema.assets.assetUuid })
      .from(schema.assets)
      .where(eq(schema.assets.familyUuid, familyUuid))
      .get(),
  );
}

/** A family's description; empty, at no version, while it has none. */
export function readFamilyDescription(
  familyUuid: string,
  tx?: any,
): AssetDescription {
  const { db, schema } = THEI_SERVER.useDb();
  const row = (tx ?? db)
    .select({
      text: schema.assetDescriptions.text,
      updatedAt: schema.assetDescriptions.updatedAt,
    })
    .from(schema.assetDescriptions)
    .where(eq(schema.assetDescriptions.familyUuid, familyUuid))
    .get() as { text: string; updatedAt: number } | undefined;
  return row ?? { text: '', updatedAt: null };
}

/** The descriptions of these families, by family; those with none left out. */
export function readFamilyDescriptions(
  familyUuids: readonly string[],
): Map<string, string> {
  const unique = [...new Set(familyUuids)];
  if (!unique.length) return new Map();
  const { db, schema } = THEI_SERVER.useDb();
  return new Map(
    db
      .select({
        familyUuid: schema.assetDescriptions.familyUuid,
        text: schema.assetDescriptions.text,
      })
      .from(schema.assetDescriptions)
      .where(inArray(schema.assetDescriptions.familyUuid, unique))
      .all()
      .map((row: { familyUuid: string; text: string }) => [
        row.familyUuid,
        row.text,
      ]),
  );
}

/** A file's description, read through its family; none for a file not there. */
export function readAssetDescription(
  assetUuid: string,
): (AssetDescription & { familyUuid: string }) | undefined {
  const family = assetFamilyOf(assetUuid);
  if (!family) return undefined;
  return {
    ...readFamilyDescription(family.familyUuid),
    familyUuid: family.familyUuid,
  };
}

/** The description of a file as stored, by the file: what a page shows. */
export function describedText(asset: { familyUuid: string }): string {
  return readFamilyDescription(asset.familyUuid).text;
}

export interface WriteAssetDescriptionOptions {
  /** The version it was written over: `null` for a file that had none. */
  expectedUpdatedAt: number | null;
  /** Runs inside the save's transaction, once the description is written. */
  onWrite?: (tx: any, schema: any, written: AssetDescription) => void;
  now?: number;
}

/**
 * Saves a file's description for its whole family, over the version it was
 * read at: a change landed since is refused with what it is now. Empty, the
 * description goes. Returns it as kept.
 */
export function writeAssetDescription(
  assetUuid: string,
  text: string,
  options: WriteAssetDescriptionOptions,
): AssetDescription & { familyUuid: string } {
  const value = cleanAssetDescription(text);
  if (value.length > ASSET_DESCRIPTION_MAX)
    throw new AssetDescriptionInvalid(
      `A description is at most ${ASSET_DESCRIPTION_MAX} characters.`,
    );
  const { db, schema } = THEI_SERVER.useDb();
  const now = options.now ?? Date.now();
  return db.transaction((tx) => {
    const family = assetFamilyOf(assetUuid, tx);
    if (!family)
      throw new AssetDescriptionInvalid(`There is no file ${assetUuid}.`);
    const current = readFamilyDescription(family.familyUuid, tx);
    if (current.updatedAt !== options.expectedUpdatedAt)
      throw new AssetDescriptionConflict(current);
    // A save that changes nothing keeps the version it was made over.
    let written: AssetDescription = current;
    if (value !== current.text) {
      // Two saves in one millisecond are still two versions.
      const at = Math.max(now, (current.updatedAt ?? 0) + 1);
      if (!value) {
        tx.delete(schema.assetDescriptions)
          .where(eq(schema.assetDescriptions.familyUuid, family.familyUuid))
          .run();
        written = { text: '', updatedAt: null };
      } else {
        tx.insert(schema.assetDescriptions)
          .values({ familyUuid: family.familyUuid, text: value, updatedAt: at })
          .onConflictDoUpdate({
            target: schema.assetDescriptions.familyUuid,
            set: { text: value, updatedAt: at },
          })
          .run();
        written = { text: value, updatedAt: at };
      }
    }
    options.onWrite?.(tx, schema, written);
    return { ...written, familyUuid: family.familyUuid };
  });
}

/**
 * Takes away the descriptions of these families once no file of them is
 * left, inside `tx`: called wherever a row of `assets` is deleted.
 */
export function forgetFamilyDescriptions(
  tx: any,
  schema: any,
  familyUuids: readonly string[],
) {
  const unique = [...new Set(familyUuids)];
  if (!unique.length) return;
  tx.delete(schema.assetDescriptions)
    .where(
      and(
        inArray(schema.assetDescriptions.familyUuid, unique),
        notExists(
          tx
            .select({ assetUuid: schema.assets.assetUuid })
            .from(schema.assets)
            .where(
              eq(schema.assets.familyUuid, schema.assetDescriptions.familyUuid),
            ),
        ),
      ),
    )
    .run();
}
