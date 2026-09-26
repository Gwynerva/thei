import type { TagRecommendationReason } from '#layers/thei/shared/tag-recommendation';

/**
 * Why a tag is suggested, one `[label, detail]` pair per kind of evidence:
 * «В тексте: поезд, вокзал», «Похоже на: …», «Связано с: …», «Часто вместе
 * с: …». Shared by the recommended chips of a form and the tag's own page.
 */
export function tagReasonLines(
  reasons: TagRecommendationReason[] | undefined,
): Array<[label: string, detail: string]> {
  const value = phrase.value;
  return (reasons ?? []).map((reason) => {
    if (reason.kind === 'text')
      return [value.tag_reason_text, reason.terms.join(', ')];
    if (reason.kind === 'together')
      return [value.tag_reason_together, reason.tags.join(', ')];
    return [
      reason.kind === 'similar'
        ? value.tag_reason_similar
        : value.tag_reason_related,
      reason.entities.map((entity) => entity.title).join(', '),
    ];
  });
}

/** The reasons as one line of plain text, for a screen reader or a list. */
export function tagReasonText(
  reasons: TagRecommendationReason[] | undefined,
): string {
  return tagReasonLines(reasons)
    .map(([label, detail]) => `${label}: ${detail}`)
    .join(' · ');
}
