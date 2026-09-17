import type { IconName } from '#thei/icons';
import { iconSpriteHref } from '../../composables/icon-sprite';

export function editorIcon(name: IconName) {
  return `<svg aria-hidden="true" width="20" height="20" fill="currentColor"><use href="${iconSpriteHref(name)}"></use></svg>`;
}
