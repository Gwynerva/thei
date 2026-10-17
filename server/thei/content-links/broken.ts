import { theiLinkUrl } from '#layers/thei/shared/content-edit-markdown/links';
import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import type { ContentEntityOutline } from '#layers/thei/shared/admin/content-entity-outline';
import type { ContentOutputData } from '#layers/thei/shared/content';
import {
  contentPlaceLabel,
  isFixedContentPlace,
} from '#layers/thei/shared/content-headings';
import {
  decodeLinkFragment,
  type ContentEntityType,
} from '#layers/thei/shared/content-link';
import {
  contentLinkAt,
  locateContentEntityLinks,
  type ContentLinkTarget,
} from '#layers/thei/shared/content-link-locate';
import { entityFace, entityTextOfSlot, type EntityKind } from '../entity-kinds';
import { entityOutline } from './anchors';
import {
  anchorCandidates,
  entityCandidates,
  recordsCache,
  type ContentEntityRecords,
  type LinkCandidate,
} from './candidates';

/**
 * The links of the archive's texts to its own entities that lead nowhere
 * now: to an entity gone, or to a heading its page no longer has. A place
 * the page always has, or a passage of text (`:~:text=`), is never broken.
 * The whole archive is read every time: a link breaks when its target
 * changes, not its text.
 */

export type BrokenLinkProblem = 'entity-gone' | 'heading-gone';

export interface BrokenLink {
  /** The text it stands in: its entity's ref and title, and the text's name. */
  in: { ref: string; title: string; text: string };
  link: {
    id: string;
    kind: 'inline' | 'card';
    words: string;
    /** Where it leads now: `thei:<kind>/<id>#place`. */
    to: string;
    private: boolean;
  };
  problem: BrokenLinkProblem;
  /** What it named, as a reader would read its place. */
  named?: string;
  candidates: LinkCandidate[];
}

/** What each target is, asked once in a scan. */
export function outlineCache() {
  const known = new Map<string, Promise<ContentEntityOutline | undefined>>();
  return (type: ContentEntityType, id: string) => {
    const key = `${type}:${id}`;
    let pending = known.get(key);
    if (!pending) {
      pending = entityOutline(type, id);
      known.set(key, pending);
    }
    return pending;
  };
}

type Outlines = ReturnType<typeof outlineCache>;

/** Why a link leads nowhere, if it does. */
export async function linkProblem(
  target: ContentLinkTarget,
  outlines: Outlines,
): Promise<BrokenLinkProblem | undefined> {
  const outline = await outlines(target.entityType, target.entityId);
  if (!outline) return 'entity-gone';
  const fragment = target.fragment;
  if (!fragment || isFixedContentPlace(fragment)) return undefined;
  return outline.headings.some(
    (heading) =>
      heading.id === fragment || heading.id === decodeLinkFragment(fragment),
  )
    ? undefined
    : 'heading-gone';
}

/** Where a broken link may lead instead, best first. */
export async function linkCandidates(
  link: ContentLinkTarget & { words: string; kind: 'inline' | 'card' },
  problem: BrokenLinkProblem,
  outlines: Outlines,
  records: ContentEntityRecords,
): Promise<LinkCandidate[]> {
  if (problem === 'entity-gone')
    return entityCandidates(link.words, link.kind, records);
  const outline = await outlines(link.entityType, link.entityId);
  return outline
    ? anchorCandidates(outline, link.fragment ?? '', link.words, (id) =>
        outlines('project-section', id),
      )
    : [];
}

/** The broken links of one text, with where each may lead instead. */
async function brokenIn(
  data: ContentOutputData,
  place: BrokenLink['in'],
  outlines: Outlines,
  records: ContentEntityRecords,
): Promise<BrokenLink[]> {
  const found: BrokenLink[] = [];
  for (const link of locateContentEntityLinks(data)) {
    const problem = await linkProblem(link, outlines);
    if (!problem) continue;
    found.push({
      in: place,
      link: {
        id: link.id,
        kind: link.kind,
        words: link.words,
        to: theiLinkUrl(link),
        private: link.private,
      },
      problem,
      ...(link.fragment ? { named: contentPlaceLabel(link.fragment) } : {}),
      candidates: await linkCandidates(link, problem, outlines, records),
    });
  }
  return found;
}

/**
 * The broken links of the archive, a page at a time: texts are read in a
 * steady order from after `cursor`, until `limit` links are found or
 * `budget` texts are read; `next` goes on from there, none at the end.
 * `owners` reads only the texts of these entities.
 */
export async function scanBrokenLinks(
  options: {
    cursor?: string;
    limit?: number;
    budget?: number;
    owners?: { kind: EntityKind; id: string }[];
  } = {},
): Promise<{ links: BrokenLink[]; next?: string }> {
  const { db, schema } = THEI_SERVER.useDb();
  const limit = options.limit ?? 20;
  const budget = options.budget ?? 500;
  const outlines = outlineCache();
  const records = recordsCache();
  const links: BrokenLink[] = [];
  let cursor = options.cursor ?? '';
  let read = 0;
  while (read < budget && links.length < limit) {
    const rows = db
      .select({
        contentUuid: schema.content.contentUuid,
        ownerType: schema.content.ownerType,
        ownerId: schema.content.ownerId,
        slot: schema.content.slot,
        data: schema.content.data,
      })
      .from(schema.content)
      .where(
        and(
          gt(schema.content.contentUuid, cursor),
          ...(options.owners
            ? [
                inArray(
                  schema.content.ownerId,
                  options.owners.map((owner) => owner.id),
                ),
              ]
            : []),
        ),
      )
      .orderBy(asc(schema.content.contentUuid))
      .limit(Math.min(50, budget - read))
      .all();
    if (!rows.length) return { links };
    for (const row of rows) {
      read++;
      cursor = row.contentUuid;
      const kind = row.ownerType as EntityKind;
      if (
        options.owners &&
        !options.owners.some(
          (owner) => owner.kind === kind && owner.id === row.ownerId,
        )
      )
        continue;
      const text = entityTextOfSlot(kind, row.slot);
      const face = text && entityFace({ kind, id: row.ownerId });
      if (!text || !face) continue;
      links.push(
        ...(await brokenIn(
          row.data,
          { ref: face.ref, title: face.title, text: text.name },
          outlines,
          records,
        )),
      );
      if (links.length >= limit) break;
    }
  }
  return { links, next: cursor };
}

/**
 * One link of a text as it stands now, and why it leads nowhere — nothing
 * when no link stands at that place.
 */
export async function brokenLinkAt(data: ContentOutputData, id: string) {
  const link = contentLinkAt(data, id);
  if (!link) return undefined;
  const outlines = outlineCache();
  return { link, problem: await linkProblem(link, outlines), outlines };
}

/** A link of an entity's texts, as a model is told of it to mend or drop. */
export interface EntityLink {
  /** The text's name. */
  text: string;
  id: string;
  kind: 'inline' | 'card';
  words: string;
  /** Where it leads: `thei:<kind>/<id>#place`, and how that place reads. */
  to: string;
  title?: string;
  problem?: BrokenLinkProblem;
  /** It leads to an entity linked already earlier in its part of the text. */
  repeat: boolean;
  private: boolean;
}

/** How a place a link leads to reads: the entity, and the place inside it. */
export async function linkTargetTitle(
  target: ContentLinkTarget,
  outlines: Outlines,
): Promise<string> {
  const outline = await outlines(target.entityType, target.entityId);
  if (!outline) return '';
  const fragment = target.fragment;
  if (!fragment) return outline.title;
  const heading = outline.headings.find((item) => item.id === fragment);
  return `${outline.title} › ${heading?.title ?? contentPlaceLabel(fragment)}`;
}

/**
 * Every link of an entity's texts to the site's own entities, in the order
 * they stand: where each leads, whether it leads nowhere, and whether it
 * repeats a link to the same entity earlier in its part of the text — from
 * one heading of the second level to the next — where a link stands once.
 */
export async function entityLinks(owner: {
  kind: EntityKind;
  id: string;
}): Promise<EntityLink[]> {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select({ slot: schema.content.slot, data: schema.content.data })
    .from(schema.content)
    .where(
      and(
        eq(schema.content.ownerType, owner.kind as never),
        eq(schema.content.ownerId, owner.id),
      ),
    )
    .all() as { slot: string; data: ContentOutputData }[];
  const outlines = outlineCache();
  const found: EntityLink[] = [];
  for (const row of rows) {
    const text = entityTextOfSlot(owner.kind, row.slot);
    if (!text) continue;
    const partOf: number[] = [];
    row.data.blocks.forEach((block, index) => {
      const opens =
        block.type === 'header' &&
        (block.data as { level?: number }).level === 2;
      partOf[index] = (partOf[index - 1] ?? 0) + (opens ? 1 : 0);
    });
    const seen = new Set<string>();
    for (const link of locateContentEntityLinks(row.data)) {
      const entity = `${partOf[link.block]}:${link.entityType}:${link.entityId}`;
      const problem = await linkProblem(link, outlines);
      const title = await linkTargetTitle(link, outlines);
      found.push({
        text: text.name,
        id: link.id,
        kind: link.kind,
        words: link.words,
        to: theiLinkUrl(link),
        ...(title ? { title } : {}),
        ...(problem ? { problem } : {}),
        repeat: link.kind === 'inline' && seen.has(entity),
        private: link.private,
      });
      seen.add(entity);
    }
  }
  return found;
}
