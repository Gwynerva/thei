import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { EntityKey } from '../../entity-kinds';
import type { McpEntityView } from '../../mcp/entities';
import { entityFingerprint } from '../digests';
import { findSession } from '../sessions/store';

/**
 * What a template's runs have read. The model of a template's session
 * decides from the request what to read; each entity it reads in full is
 * noted as it was then — a fingerprint of the entity, and a hash of each
 * paragraph of its texts — and once its turn went through, the template
 * keeps that as read. A later run may then ask of an entity only what
 * changed since, and of a changed text get only the changed paragraphs,
 * with a little around them. A turn that failed keeps nothing.
 */

type MarkRow = typeof import('../../db/schema/ai').aiTemplateMarks.$inferSelect;

/** One entity as a turn read it. */
interface ReadItem {
  key: EntityKey;
  fingerprint: string;
  /** Hashes of its texts' paragraphs, by text: `name:hash`. */
  blocks: string[];
}

/**
 * What the turn now running in each template's session has read, by
 * `kind:id`. A turn lives in one process: if it dies, the turn failed, and
 * nothing is kept — as it should be.
 */
const turnReads = new Map<string, Map<string, ReadItem>>();

/** What a template last read of each entity, by `kind:id`. */
export function marksOf(templateId: string): Map<string, MarkRow> {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select()
    .from(schema.aiTemplateMarks)
    .where(eq(schema.aiTemplateMarks.templateId, templateId))
    .all() as MarkRow[];
  return new Map(rows.map((row) => [`${row.entityType}:${row.entityId}`, row]));
}

export function markOf(
  templateId: string,
  key: EntityKey,
): MarkRow | undefined {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.aiTemplateMarks)
    .where(
      and(
        eq(schema.aiTemplateMarks.templateId, templateId),
        eq(schema.aiTemplateMarks.entityType, key.kind as never),
        eq(schema.aiTemplateMarks.entityId, key.id),
      ),
    )
    .get() as MarkRow | undefined;
}

/** A paragraph's hash: its words, the spacing set aside. */
export function paragraphHash(text: string): string {
  return createHash('sha1')
    .update(text.replace(/\s+/g, ' ').trim())
    .digest('hex')
    .slice(0, 12);
}

/** A text's paragraphs, as editing Markdown cuts them: at an empty line. */
export function paragraphsOf(markdown: string): string[] {
  return markdown
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The hashes of an entity's paragraphs, each with its text's name. */
export function blocksOf(view: McpEntityView): string[] {
  return view.texts.flatMap((text) =>
    paragraphsOf(text.markdown).map(
      (part) => `${text.name}:${paragraphHash(part)}`,
    ),
  );
}

/**
 * Notes an entity the model of a template's session read in full, as it
 * was then. Any other session is no template's: nothing is noted.
 */
export function noteTemplateRead(
  sessionUuid: string,
  key: EntityKey,
  view: McpEntityView,
) {
  if (!findSession(sessionUuid)?.templateId) return;
  const fingerprint = entityFingerprint(key);
  if (!fingerprint) return;
  let reads = turnReads.get(sessionUuid);
  if (!reads) turnReads.set(sessionUuid, (reads = new Map()));
  reads.set(`${key.kind}:${key.id}`, {
    key,
    fingerprint,
    blocks: blocksOf(view),
  });
}

/**
 * Takes what a turn of a template's session read: kept as read when the
 * turn went through, let go when it did not.
 */
export function takeTemplateReads(sessionUuid: string): ReadItem[] {
  const reads = turnReads.get(sessionUuid);
  turnReads.delete(sessionUuid);
  return reads ? [...reads.values()] : [];
}

/** Keeps what a turn read as the template's own, as it was when read. */
export function markRead(
  templateId: string,
  items: ReadItem[],
  now = Date.now(),
) {
  if (!items.length) return;
  const { db, schema } = THEI_SERVER.useDb();
  db.transaction((tx) => {
    for (const item of items) {
      tx.insert(schema.aiTemplateMarks)
        .values({
          templateId,
          entityType: item.key.kind as never,
          entityId: item.key.id,
          fingerprint: item.fingerprint,
          blocks: item.blocks,
          at: now,
        })
        .onConflictDoUpdate({
          target: [
            schema.aiTemplateMarks.templateId,
            schema.aiTemplateMarks.entityType,
            schema.aiTemplateMarks.entityId,
          ],
          set: { fingerprint: item.fingerprint, blocks: item.blocks, at: now },
        })
        .run();
    }
  });
}

/**
 * Of a text, only what changed since a template last read the entity: the
 * paragraphs whose hashes it did not keep, with the paragraph before and
 * after each, the rest left out with a mark.
 */
export function changedParts(
  markdown: string,
  name: string,
  kept: Set<string>,
): string {
  const parts = paragraphsOf(markdown);
  const changed = parts.map(
    (part) => !kept.has(`${name}:${paragraphHash(part)}`),
  );
  if (!changed.some(Boolean)) return '_(unchanged)_';
  const shown = parts.map(
    (_, index) => changed[index] || changed[index - 1] || changed[index + 1],
  );
  const out: string[] = [];
  let skipped = false;
  parts.forEach((part, index) => {
    if (shown[index]) {
      if (skipped) out.push('…');
      skipped = false;
      out.push(part);
    } else skipped = true;
  });
  if (skipped) out.push('…');
  return out.join('\n\n');
}
