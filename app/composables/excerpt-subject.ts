import {
  isPublicSecret,
  type PublicEntityLink,
} from '#layers/thei/shared/api/public';
import { relationEntityIcon } from '#layers/thei/shared/relation-display';
import type { IconName } from '#thei/icons';

/**
 * What an excerpt is about, by name: a diary entry by its day, shortened;
 * one the reader may not open by its codename.
 */
export function publicExcerptSubjectName(link: PublicEntityLink): string {
  return isPublicSecret(link)
    ? link.title
    : entityListName(link, 'abbreviated');
}

/**
 * What an excerpt is about, as the line over its title names it
 * (`PublicPageParent` with its arrow): the one entity's token and name,
 * leading to it. None once the subject is deleted; one the reader may not
 * open is its codename, leading nowhere.
 */
export function publicExcerptSubjectLine(
  links: PublicEntityLink[],
  label?: string,
) {
  const link = links[0];
  if (!link) return undefined;
  const secret = isPublicSecret(link);
  return {
    ...(label ? { label } : {}),
    title: publicExcerptSubjectName(link),
    ...(secret ? {} : { href: link.href }),
    iconMedia: link.iconMedia,
    icon: relationEntityIcon(link.entityType ?? 'project') as IconName,
    ...(link.relationType
      ? {
          relation: {
            type: link.relationType,
            ...('note' in link && link.note ? { note: link.note } : {}),
          },
        }
      : {}),
  };
}
