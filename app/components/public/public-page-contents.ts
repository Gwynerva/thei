import type {
  PublicExcerpt,
  PublicRelatedCounts,
} from '#layers/thei/shared/api/public';
import type { ContentHeading } from '#layers/thei/app/components/content/content-headings';
import { publicOwnExcerptContents } from './public-excerpt-contents';
import { publicExcerptsHeading } from './PublicExcerptsBlock.vue';
import { publicOwnerNotesHeading } from './PublicOwnerNotes.vue';
import {
  publicRelatedHeading,
  publicRelatedTotal,
} from './PublicRelatedBlock.vue';

/** A page's own excerpts as its contents list them, by what each is about. */
export function publicPageExcerptContents(
  excerpts: readonly PublicExcerpt[],
): ContentHeading[] {
  return publicOwnExcerptContents(excerpts, (link) =>
    entityLinkName(link, 'abbreviated'),
  );
}

/**
 * The blocks under the text of a diary entry or an event that belong in
 * its contents: its own excerpts, by what they are about, the excerpts
 * written elsewhere about it, what it is related to — a visitor sees these
 * — then the owner's notes, which nobody else gets at all.
 */
export function publicBelowTextContents(page: {
  excerpts: readonly PublicExcerpt[];
  excerptsAbout: { total: number };
  related: PublicRelatedCounts;
  notes?: { blocks: readonly unknown[] } | null;
}): ContentHeading[] {
  return [
    ...publicPageExcerptContents(page.excerpts),
    ...(page.excerptsAbout.total
      ? [publicExcerptsHeading(phrase.value.excerpts)]
      : []),
    ...(publicRelatedTotal(page.related)
      ? [publicRelatedHeading(phrase.value.related_entities)]
      : []),
    ...(page.notes?.blocks.length
      ? [publicOwnerNotesHeading(phrase.value.entity_notes)]
      : []),
  ];
}
