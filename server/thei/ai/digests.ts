import { createHash } from 'node:crypto';
import { and, eq, max } from 'drizzle-orm';
import { refuse as fail } from '../entity-patch/text';
import { entityVersion, type EntityKey } from '../entity-kinds';

/**
 * A model's own few lines about an entity, kept as a cache: written after a
 * full read, and read in its place while the entity reads the same — the
 * fingerprint is of its version and of its texts'. Once the entity changes
 * the digest is stale; it stays to be read, said to be stale, until the next
 * full read writes it anew. Without one, what is read is the plain digest
 * line the archive makes of every entity (`digestLine`).
 */

export const AI_DIGEST_MAX = 800;

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
  return createHash('sha256')
    .update(`${key.kind}:${key.id}@${version}/${texts?.at ?? 0}`)
    .digest('hex')
    .slice(0, 16);
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
