import { buildDiaryUrl } from './diary-url';
import { buildEventUrl } from './event-url';
import { buildProjectUrl } from './project-url';
import type { ExcerptParentType } from './excerpt';

/** What an excerpt's address is built from: its parent's, and its own. */
export type ExcerptParentAddress =
  | { type: 'diary-entry'; date: string }
  | { type: 'event' | 'project'; humanReadableSlug: string; publicId: string };

export function buildExcerptParentUrl(parent: ExcerptParentAddress): string {
  switch (parent.type) {
    case 'diary-entry':
      return buildDiaryUrl(parent.date);
    case 'event':
      return buildEventUrl(parent.humanReadableSlug, parent.publicId);
    case 'project':
      return buildProjectUrl(parent.humanReadableSlug, parent.publicId);
  }
}

/**
 * An excerpt lives under its parent: `/diary/2024-03-02/excerpts/<slug>-<id>/`,
 * and the same under an event's or a project's address. The readable part is
 * optional, and ignored on the way in.
 */
export function buildExcerptUrl(
  parent: ExcerptParentAddress,
  humanReadableSlug: string,
  publicId: string,
): string {
  const part = humanReadableSlug
    ? `${humanReadableSlug}-${publicId}`
    : publicId;
  return `${buildExcerptParentUrl(parent)}excerpts/${part}/`;
}

/**
 * An excerpt's parent as the context its text is served in: an excerpt's
 * pictures come from under its parent's address, the way a section's come
 * from its project's.
 */
export function excerptParentContentEntity(parent: ExcerptParentAddress) {
  return parent.type === 'diary-entry'
    ? ({ type: 'diary-entry', date: parent.date } as const)
    : ({
        type: parent.type,
        humanReadableSlug: parent.humanReadableSlug,
        publicId: parent.publicId,
      } as const);
}

export function publicIdFromExcerptUrlPart(value: string): string {
  return value.slice(value.lastIndexOf('-') + 1);
}

/** The admin page an excerpt is edited on: its parent's form, opened on it. */
export function buildExcerptAdminPath(
  parentType: ExcerptParentType,
  parentId: string,
  publicId?: string,
): string {
  const folder =
    parentType === 'diary-entry'
      ? 'diary'
      : parentType === 'event'
        ? 'events'
        : 'projects';
  return `/admin/${folder}/${parentId}/edit/${publicId ? `?excerpt=${encodeURIComponent(publicId)}` : ''}`;
}
