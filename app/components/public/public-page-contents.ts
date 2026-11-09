import type { PublicRelatedCounts } from '#layers/thei/shared/api/public';
import type { ContentHeading } from '#layers/thei/app/components/content/content-headings';
import { publicExcerptsHeading } from './PublicExcerptsBlock.vue';
import { publicOwnerNotesHeading } from './PublicOwnerNotes.vue';
import {
  publicRelatedHeading,
  publicRelatedTotal,
} from './PublicRelatedBlock.vue';

/**
 * The blocks under the text of a diary entry or an event that belong in
 * its contents: the excerpts about it, what it is related to — a visitor
 * sees both — then the owner's notes, which nobody else gets at all. Its
 * own excerpts are listed under the contents on their own.
 */
export function publicBelowTextContents(page: {
  excerptsAbout: { total: number };
  related: PublicRelatedCounts;
  notes?: { blocks: readonly unknown[] } | null;
}): ContentHeading[] {
  return [
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
