import {
  isPublicSecret,
  type PublicEntityLink,
} from '#layers/thei/shared/api/public';
import { relationEntityIcon } from '#layers/thei/shared/relation-display';
import type { IconName } from '#thei/icons';
import { entityCardFromLink, entityLinkName } from './entity-cards';

/**
 * What an excerpt is about, as the line over its title names it
 * (`PublicPageParent`): the one entity's chip, leading to it and showing its
 * card. None once the subject is deleted; one the reader may not open is its
 * codename, leading nowhere.
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
    title: entityLinkName(link, 'abbreviated'),
    ...(secret ? {} : { href: link.href }),
    iconMedia: link.iconMedia,
    icon: relationEntityIcon(link.entityType ?? 'project') as IconName,
    card: entityCardFromLink(link),
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
