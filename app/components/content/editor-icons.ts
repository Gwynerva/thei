import { iconsHref, type IconName } from '#thei/icons';

export function editorIcon(name: IconName) {
  return `<svg aria-hidden="true" width="20" height="20" fill="currentColor"><use href="${iconsHref}#${name}"></use></svg>`;
}
