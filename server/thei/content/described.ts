import { and, eq, inArray } from 'drizzle-orm';
import type { ContentSlot } from '#layers/thei/shared/content';
import {
  CONTENT_OPENING_LENGTH,
  contentOpening,
} from '#layers/thei/shared/content-opening';

/**
 * The kinds an owner may leave without a summary, and the text each is
 * described by then. A project, an event and a page are not saved without
 * one; a diary entry has none and is described by its lead.
 */
const BODY_SLOTS = {
  'project-section': 'project-section-body',
  excerpt: 'excerpt-body',
} as const satisfies Record<string, ContentSlot>;

export type DescribedKind = keyof typeof BODY_SLOTS;

/**
 * What describes a section or an excerpt wherever it is described — a card,
 * a link, a find, a preview: its summary, or else how its text begins, as
 * much of it as the reader may see (`contentOpening`), and nothing where they
 * may see no word of it. The text is read only where there is no summary. As
 * typed: whoever shows it formats it.
 *
 * `includePrivate` is the reader's side of the text, decided as for the text
 * itself: a section's by its project, an excerpt's by its parent.
 */
export async function describedSummary(
  kind: DescribedKind,
  id: string,
  summary: string,
  includePrivate: boolean,
  limit = CONTENT_OPENING_LENGTH,
): Promise<string> {
  if (summary.trim()) return summary;
  const body = await THEI_SERVER.content.findByOwner(
    kind,
    id,
    BODY_SLOTS[kind],
  );
  return opening(body?.data, includePrivate, limit);
}

/**
 * The same for many of one kind, their texts read in one query: by id, what
 * describes each.
 */
export function describedSummaries(
  kind: DescribedKind,
  entities: readonly { id: string; summary: string }[],
  includePrivate: boolean,
  limit = CONTENT_OPENING_LENGTH,
): Map<string, string> {
  const bare = entities
    .filter((entity) => !entity.summary.trim())
    .map((entity) => entity.id);
  const { db, schema } = THEI_SERVER.useDb();
  const bodies = new Map(
    bare.length
      ? db
          .select({
            ownerId: schema.content.ownerId,
            data: schema.content.data,
          })
          .from(schema.content)
          .where(
            and(
              eq(schema.content.ownerType, kind),
              eq(schema.content.slot, BODY_SLOTS[kind]),
              inArray(schema.content.ownerId, bare),
            ),
          )
          .all()
          .map((row) => [row.ownerId, row.data] as const)
      : [],
  );
  return new Map(
    entities.map((entity) => [
      entity.id,
      entity.summary.trim()
        ? entity.summary
        : opening(bodies.get(entity.id), includePrivate, limit),
    ]),
  );
}

function opening(
  data: Parameters<typeof contentOpening>[0],
  includePrivate: boolean,
  limit: number,
) {
  return contentOpening(
    data,
    {
      includePrivate,
      privateLabel: THEI_SERVER.phrase.content_private_section,
    },
    limit,
  );
}
