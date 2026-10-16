import { and, desc, eq, lt } from 'drizzle-orm';
import { contentHeadingAnchors } from '#layers/thei/shared/content-headings';
import type {
  ContentOutputData,
  ContentOwnerType,
  ContentSlot,
} from '#layers/thei/shared/content';
import { isContentEntityType } from '#layers/thei/shared/content-link';
import { entityPageText } from '../entity-kinds';

/**
 * The anchors a page's headings have had (`content-anchors`): written as its
 * text is saved, read to mend a link to a heading renamed since.
 */

/** The rows a text keeps, its newest. */
export const CONTENT_ANCHOR_LIMIT = 300;

interface Field {
  ownerType: ContentOwnerType;
  ownerId: string;
  slot: ContentSlot;
}

/** Only the text of a page a link may lead to has headings to remember. */
function isPageText(field: Field) {
  return (
    isContentEntityType(field.ownerType) &&
    entityPageText(field.ownerType)?.slot === field.slot
  );
}

/** The anchors of a text's headings, each with its block. */
function anchorsOf(data: ContentOutputData | null | undefined) {
  if (!data) return [];
  return contentHeadingAnchors(data, THEI_SERVER.language.slugify).flatMap(
    (heading) => {
      // A heading is a block of its own among the text's blocks.
      const block = /^\d+$/.test(heading.path)
        ? data.blocks[Number(heading.path)]
        : undefined;
      return block?.id
        ? [{ anchor: heading.id, blockId: block.id, title: heading.title }]
        : [];
    },
  );
}

/**
 * Remembers the anchors of a text as it was and as it is saved, in the
 * transaction that saves it. The text saved is seen last, so its words are
 * the ones kept for an anchor both have.
 */
export function recordContentAnchors(
  tx: any,
  schema: any,
  field: Field,
  texts: readonly (ContentOutputData | null | undefined)[],
  now: number,
) {
  if (!isPageText(field)) return;
  const rows = new Map<string, ReturnType<typeof anchorsOf>[number]>();
  for (const text of texts)
    for (const row of anchorsOf(text))
      rows.set(`${row.anchor}\n${row.blockId}`, row);
  if (!rows.size) return;
  for (const row of rows.values())
    tx.insert(schema.contentAnchors)
      .values({ ...field, ...row, seenAt: now })
      .onConflictDoUpdate({
        target: [
          schema.contentAnchors.ownerType,
          schema.contentAnchors.ownerId,
          schema.contentAnchors.slot,
          schema.contentAnchors.anchor,
          schema.contentAnchors.blockId,
        ],
        set: { title: row.title, seenAt: now },
      })
      .run();
  const ofField = and(
    eq(schema.contentAnchors.ownerType, field.ownerType),
    eq(schema.contentAnchors.ownerId, field.ownerId),
    eq(schema.contentAnchors.slot, field.slot),
  );
  // The oldest go once a text has had more than it keeps.
  const last = tx
    .select({ seenAt: schema.contentAnchors.seenAt })
    .from(schema.contentAnchors)
    .where(ofField)
    .orderBy(desc(schema.contentAnchors.seenAt))
    .limit(1)
    .offset(CONTENT_ANCHOR_LIMIT - 1)
    .get();
  if (last)
    tx.delete(schema.contentAnchors)
      .where(and(ofField, lt(schema.contentAnchors.seenAt, last.seenAt)))
      .run();
}

/** Forgets the anchors of an owner's texts, with the texts. */
export function forgetContentAnchors(
  tx: any,
  schema: any,
  ownerType: ContentOwnerType,
  ownerId: string,
) {
  tx.delete(schema.contentAnchors)
    .where(
      and(
        eq(schema.contentAnchors.ownerType, ownerType),
        eq(schema.contentAnchors.ownerId, ownerId),
      ),
    )
    .run();
}

/** The blocks that had an anchor in a text, newest first. */
export function blocksThatHad(field: Field, anchor: string) {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select({
      blockId: schema.contentAnchors.blockId,
      title: schema.contentAnchors.title,
      seenAt: schema.contentAnchors.seenAt,
    })
    .from(schema.contentAnchors)
    .where(
      and(
        eq(schema.contentAnchors.ownerType, field.ownerType),
        eq(schema.contentAnchors.ownerId, field.ownerId),
        eq(schema.contentAnchors.slot, field.slot),
        eq(schema.contentAnchors.anchor, anchor),
      ),
    )
    .orderBy(desc(schema.contentAnchors.seenAt))
    .all();
}

/** The anchor each heading block of a text has now, by its block. */
export function anchorsByBlock(data: ContentOutputData | null | undefined) {
  return new Map(
    anchorsOf(data).map((row) => [
      row.blockId,
      { anchor: row.anchor, title: row.title },
    ]),
  );
}
