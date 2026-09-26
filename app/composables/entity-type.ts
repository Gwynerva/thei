import type { ContentEntityType } from '#layers/thei/shared/content-link';

/** What a kind of entity is called, for a tooltip or a badge. */
export function entityTypeLabel(type: ContentEntityType): string {
  const value = phrase.value;
  return {
    project: value.project,
    'project-stage': value.project_stage,
    'project-section': value.content_section,
    event: value.event,
    'diary-entry': value.diary_entry,
    page: value.page,
    tag: value.tag,
  }[type];
}

/**
 * The name to show for a linked entity. A diary entry has no title and is
 * called by its day, so its `date` is written out as one.
 */
export function entityDisplayTitle(entity: {
  title: string;
  date?: string;
}): string {
  return entity.date
    ? formatAbsolutePublicDate(entity.date, language.value.code)
    : entity.title;
}
