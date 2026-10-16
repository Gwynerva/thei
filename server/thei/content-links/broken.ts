import { theiLinkUrl } from '#layers/thei/shared/content-edit-markdown/links';
import { asc, gt } from 'drizzle-orm';
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
 */
export async function scanBrokenLinks(
  options: { cursor?: string; limit?: number; budget?: number } = {},
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
      .where(gt(schema.content.contentUuid, cursor))
      .orderBy(asc(schema.content.contentUuid))
      .limit(Math.min(50, budget - read))
      .all();
    if (!rows.length) return { links };
    for (const row of rows) {
      read++;
      cursor = row.contentUuid;
      const kind = row.ownerType as EntityKind;
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
