import { iconsHref } from '#thei/icons';
import { sitePath } from './site-url';

/**
 * Icons start as references into `/icons.svg`, which the browser fetches like
 * any other resource. Once the app is mounted the sprite is copied into the
 * document itself, so an icon rendered later — the error page after the
 * connection dropped, for one — never depends on the network again.
 */
const iconSpriteInlined = shallowRef(false);

/** Symbol ids are namespaced so they cannot collide with heading anchors. */
const INLINE_ICON_PREFIX = 'thei-icon-';

export function iconSpriteHref(name: string): string {
  return iconSpriteInlined.value
    ? `#${INLINE_ICON_PREFIX}${name}`
    : `${sitePath(iconsHref)}#${name}`;
}

export async function inlineIconSprite(): Promise<void> {
  if (import.meta.server || iconSpriteInlined.value) return;
  try {
    const response = await fetch(sitePath(iconsHref));
    if (!response.ok) return;
    const template = document.createElement('template');
    template.innerHTML = (await response.text()).replace(
      /<symbol id="/g,
      `<symbol id="${INLINE_ICON_PREFIX}`,
    );
    const sprite = template.content.querySelector('svg');
    if (!sprite) return;
    sprite.setAttribute('aria-hidden', 'true');
    sprite.setAttribute('hidden', '');
    sprite.dataset.theiIconSprite = '';
    document.querySelector('[data-thei-icon-sprite]')?.remove();
    document.body.prepend(sprite);
    iconSpriteInlined.value = true;
  } catch {
    // Offline before the sprite ever arrived: icons keep their network
    // references and load whenever the connection returns.
  }
}
