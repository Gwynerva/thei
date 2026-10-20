import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type { LanguagePhrases } from '#layers/thei/shared/language/types';
import type { FieldOptions } from './FieldOptions.vue';

/**
 * Who may open an entity, as the options of its form's access field: anyone,
 * whoever has its link, or the owner alone. A diary entry is either public
 * or private (`withLinkOnly` false).
 */
export function accessOptions(
  phrase: LanguagePhrases,
  withLinkOnly = true,
): FieldOptions {
  return {
    [ProjectEventAccessLevel.Public]: {
      icon: 'lock-open',
      title: phrase.public,
    },
    ...(withLinkOnly
      ? {
          [ProjectEventAccessLevel.LinkOnly]: {
            icon: 'lock-partial',
            title: phrase.link_only,
          },
        }
      : {}),
    [ProjectEventAccessLevel.Private]: {
      icon: 'lock-close',
      title: phrase.private,
    },
  };
}
