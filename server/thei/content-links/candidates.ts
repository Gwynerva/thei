import { theiLinkUrl } from '#layers/thei/shared/content-edit-markdown/links';
import { contentPlaceLabel } from '#layers/thei/shared/content-headings';
import type { ContentEntityOutline } from '#layers/thei/shared/admin/content-entity-outline';
import { suggestContentEntities } from '#layers/thei/shared/admin/content-entity-search';
import { type ContentLinkTarget } from '#layers/thei/shared/content-link-locate';
import { normalizeTermText, stemTerm } from '#layers/thei/shared/text-terms';
import { letterSimilarity } from '#layers/thei/shared/text-similarity';
import { entityPageText } from '../entity-kinds';
import { listContentEntities } from '../content-entities';
import { anchorsByBlock, blocksThatHad } from './anchor-ledger';

/**
 * Where a broken link may lead instead, best first: for a heading no longer
 * there, the heading it became — its block remembers its anchors — then one
 * named like it, one named as the link's words, the same heading moved into
 * a section of the project, and the whole entity; for an entity gone, the
 * entities the link's words name, and at last the words without the link.
 */

export type LinkCandidateWhy =
  'renamed' | 'similar' | 'same-words' | 'moved' | 'whole' | 'named' | 'unlink';

export interface LinkCandidate {
  /** `thei:<kind>/<id>#place`, or none: the words without the link. */
  to: string | null;
  /** How it reads: the entity, and the heading. */
  title: string;
  why: LinkCandidateWhy;
}

/** How alike a lost anchor and a heading's anchor are, enough to offer. */
const SIMILAR = 0.6;
const MOST = 4;

function words(value: string) {
  return normalizeTermText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function target(
  outline: ContentEntityOutline,
  fragment?: string,
): ContentLinkTarget {
  return {
    entityType: outline.entityType,
    entityId: outline.entityId,
    ...(fragment ? { fragment } : {}),
  };
}

/**
 * For a heading no longer there in `outline`: the headings that may be the
 * one meant, then the entity as a whole.
 */
export async function anchorCandidates(
  outline: ContentEntityOutline,
  fragment: string,
  linkWords: string,
  sectionOutline: (id: string) => Promise<ContentEntityOutline | undefined>,
): Promise<LinkCandidate[]> {
  const found: LinkCandidate[] = [];
  const offered = new Set<string>();
  const offer = (
    to: ContentLinkTarget,
    title: string,
    why: LinkCandidateWhy,
  ) => {
    const ref = theiLinkUrl(to);
    if (offered.has(ref)) return;
    offered.add(ref);
    found.push({ to: ref, title, why });
  };
  const named = (heading: string) => `${outline.title} › ${heading}`;

  // The heading it became: the block that had the anchor has another now.
  const owner = outline.entityType;
  const slot = owner === 'tag' ? undefined : entityPageText(owner)?.slot;
  if (owner !== 'tag' && slot) {
    const field = await THEI_SERVER.content.buildFieldValue(
      owner,
      outline.entityId,
      slot,
    );
    const now = anchorsByBlock(field?.data);
    for (const row of blocksThatHad(
      { ownerType: owner, ownerId: outline.entityId, slot },
      fragment,
    )) {
      const became = now.get(row.blockId);
      if (became && became.anchor !== fragment)
        offer(target(outline, became.anchor), named(became.title), 'renamed');
    }
  }

  const lost = contentPlaceLabel(fragment);
  for (const heading of outline.headings)
    if (letterSimilarity(lost.toLowerCase(), heading.id) >= SIMILAR)
      offer(target(outline, heading.id), named(heading.title), 'similar');

  const linkTerms = words(linkWords).join(' ');
  if (linkTerms)
    for (const heading of outline.headings)
      if (words(heading.title).join(' ') === linkTerms)
        offer(target(outline, heading.id), named(heading.title), 'same-words');

  // Moved into a section of the project: the same anchor there.
  for (const section of outline.sections ?? []) {
    const inside = await sectionOutline(section.entityId);
    const same = inside?.headings.find((heading) => heading.id === fragment);
    if (inside && same)
      offer(
        target(inside, same.id),
        `${outline.title} › ${inside.title} › ${same.title}`,
        'moved',
      );
  }

  // The whole entity always stays among them, last.
  const headings = found.slice(0, MOST - 1);
  const whole = theiLinkUrl(target(outline));
  return headings.some((candidate) => candidate.to === whole)
    ? headings
    : [...headings, { to: whole, title: outline.title, why: 'whole' }];
}

/** Every entity a link may lead to, read once in a scan. */
export type ContentEntityRecords = () => ReturnType<typeof listContentEntities>;

export function recordsCache(): ContentEntityRecords {
  let pending: ReturnType<typeof listContentEntities> | undefined;
  return () =>
    (pending ??= listContentEntities(
      new Set(['project', 'project-section', 'event', 'page', 'tag']),
    ));
}

/**
 * For an entity gone: the entities the link's words name — by title or
 * synonym — then, for a link of words, the words without the link; a link
 * block is never taken off.
 */
export async function entityCandidates(
  linkWords: string,
  kind: 'inline' | 'card',
  records: ContentEntityRecords,
): Promise<LinkCandidate[]> {
  const found: LinkCandidate[] = [];
  // By the forms of the words, as the suggester found them: «в музее» names
  // «Музей». A letter alone — «в», «и» — names nothing.
  const terms = new Set(
    words(linkWords)
      .filter((word) => word.length > 1)
      .map(stemTerm),
  );
  if (terms.size) {
    for (const record of suggestContentEntities(
      await records(),
      linkWords,
      MOST,
    ))
      if (
        [record.title, ...(record.synonyms ?? [])].some((name) =>
          words(name).some((word) => terms.has(stemTerm(word))),
        )
      )
        found.push({
          to: theiLinkUrl(record),
          title: record.title,
          why: 'named',
        });
  }
  const named = found.slice(0, kind === 'card' ? MOST : MOST - 1);
  return kind === 'card'
    ? named
    : [...named, { to: null, title: linkWords, why: 'unlink' }];
}
