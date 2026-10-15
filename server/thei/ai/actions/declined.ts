import { createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { AiRevisePart } from '#layers/thei/shared/ai-actions';
import type { EntityKey } from '../../entity-kinds';

/**
 * What the owner already said no to. A declined action is remembered by the
 * session it was declined in, for as long as that lives; «never offer again»
 * is a memory record, kept until the owner lets it go. Either way the same
 * proposal is refused — by its fingerprint — before it reaches the owner.
 */

export function fingerprintOf(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** One correction of a text edit, known apart: "keep as written" is per word. */
export function correctionFingerprint(
  key: EntityKey,
  text: string,
  correction: { find: string; replace: string },
): string {
  return fingerprintOf([
    key.kind,
    key.id,
    'correction',
    text,
    correction.find,
    correction.replace,
  ]);
}

/** Of these fingerprints, the ones the owner said never to offer again. */
export function neverOffered(fingerprints: string[]): Set<string> {
  if (!fingerprints.length) return new Set();
  const { db, schema } = THEI_SERVER.useDb();
  return new Set(
    db
      .select({ fingerprint: schema.aiMemory.fingerprint })
      .from(schema.aiMemory)
      .where(
        and(
          eq(schema.aiMemory.type, 'never'),
          inArray(schema.aiMemory.fingerprint, fingerprints),
        ),
      )
      .all()
      .flatMap((row) => (row.fingerprint ? [row.fingerprint] : [])),
  );
}

/** Of these fingerprints, the ones declined in a session that still lives. */
export function declinedLately(fingerprints: string[]): Set<string> {
  if (!fingerprints.length) return new Set();
  const { db, schema } = THEI_SERVER.useDb();
  return new Set(
    db
      .select({ fingerprint: schema.aiActions.fingerprint })
      .from(schema.aiActions)
      .where(
        and(
          eq(schema.aiActions.state, 'rejected'),
          inArray(schema.aiActions.fingerprint, fingerprints),
        ),
      )
      .all()
      .map((row) => row.fingerprint),
  );
}

/**
 * Corrections of a text the owner kept as written in a session that still
 * lives: each by its fingerprint.
 */
export function correctionsKeptLately(
  key: EntityKey,
  text: string,
): Set<string> {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select({
      payload: schema.aiActions.payload,
      parts: schema.aiActions.parts,
    })
    .from(schema.aiActions)
    .where(
      and(
        eq(schema.aiActions.targetType, key.kind as never),
        eq(schema.aiActions.targetId, key.id),
        eq(schema.aiActions.kind, 'revise'),
      ),
    )
    .all() as {
    payload: { text?: string; parts?: AiRevisePart[] };
    parts: { id: string; state: string }[] | null;
  }[];
  const kept = new Set<string>();
  for (const row of rows) {
    if (row.payload.text !== text) continue;
    const states = new Map(
      (row.parts ?? []).map((part) => [part.id, part.state]),
    );
    for (const part of row.payload.parts ?? [])
      if (part.type === 'correction' && states.get(part.id) === 'kept')
        kept.add(correctionFingerprint(key, text, part));
  }
  return kept;
}
