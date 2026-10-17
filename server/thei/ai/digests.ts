import { createHash } from 'node:crypto';
import { and, asc, eq, max } from 'drizzle-orm';
import { refuse as fail } from '../entity-patch/text';
import { entityVersion, type EntityKey } from '../entity-kinds';

/**
 * A model's own few lines about an entity, kept as a cache: written after a
 * full read, and read in its place while the entity reads the same — the
 * fingerprint is of its version and of its texts', and a tag's of what it
 * is on too. Once the entity changes the digest is stale; it stays to be
 * read, said to be stale, until the next full read writes it anew. Without
 * one, what is read is the plain digest line the archive makes of every
 * entity (`digestLine`).
 */

export const AI_DIGEST_MAX = 800;

/**
 * What a tag is on, which a read of it lists: tagging something moves the
 * version of that, not of the tag, so a tag's digest is kept against the
 * ends of its usages too. Read in the order of the key they are stored by.
 */
function tagUsageLine(tagUuid: string): string {
  const { db, schema } = THEI_SERVER.useDb();
  const t = schema.tagUsages;
  return db
    .select({ type: t.containerType, id: t.containerId })
    .from(t)
    .where(eq(t.tagUuid, tagUuid))
    .orderBy(asc(t.containerType), asc(t.containerId))
    .all()
    .map((usage) => `${usage.type}:${usage.id}`)
    .join(',');
}

/** What an entity is now, as a digest is kept against. */
export function entityFingerprint(key: EntityKey): string | undefined {
  const version = entityVersion(key);
  if (version === undefined) return undefined;
  const { db, schema } = THEI_SERVER.useDb();
  const texts = db
    .select({ at: max(schema.content.updatedAt) })
    .from(schema.content)
    .where(
      and(
        eq(schema.content.ownerType, key.kind as never),
        eq(schema.content.ownerId, key.id),
      ),
    )
    .get() as { at: number | null } | undefined;
  const hash = createHash('sha256').update(
    `${key.kind}:${key.id}@${version}/${texts?.at ?? 0}`,
  );
  if (key.kind === 'tag') hash.update(`/${tagUsageLine(key.id)}`);
  return hash.digest('hex').slice(0, 16);
}

export function digestOf(
  key: EntityKey,
): { text: string; fresh: boolean; model: string; at: number } | undefined {
  const { db, schema } = THEI_SERVER.useDb();
  const row = db
    .select()
    .from(schema.aiDigests)
    .where(
      and(
        eq(schema.aiDigests.entityType, key.kind as never),
        eq(schema.aiDigests.entityId, key.id),
      ),
    )
    .get();
  if (!row) return undefined;
  return {
    text: row.text,
    fresh: row.fingerprint === entityFingerprint(key),
    model: row.model,
    at: row.at,
  };
}

export function writeDigest(
  key: EntityKey,
  text: unknown,
  model: string,
  now = Date.now(),
) {
  const value =
    typeof text === 'string' ? text.replace(/[ \t]+/g, ' ').trim() : '';
  if (!value) fail('Write the digest: a few lines of what it is.');
  if (value.length > AI_DIGEST_MAX)
    fail(`A digest is a few lines: at most ${AI_DIGEST_MAX} characters.`);
  const fingerprint = entityFingerprint(key) ?? fail('It is gone.');
  const { db, schema } = THEI_SERVER.useDb();
  db.insert(schema.aiDigests)
    .values({
      entityType: key.kind as never,
      entityId: key.id,
      text: value,
      fingerprint,
      model,
      at: now,
    })
    .onConflictDoUpdate({
      target: [schema.aiDigests.entityType, schema.aiDigests.entityId],
      set: { text: value, fingerprint, model, at: now },
    })
    .run();
}
