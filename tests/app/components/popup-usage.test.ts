import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every popup of Thei stands on one base (`docs/design/components/popups.md`):
 * `FloatingPopup` for what opens by an anchor, the title hint for hints, and
 * the layer that places the menus Editor.js draws itself. All of them are
 * placed by `popup-placement.ts`. A popup placed by hand, teleported by hand
 * or stacked at a height of its own would leave that base, so the sources
 * are read for the ways to do it.
 */
const root = fileURLToPath(new URL('../../..', import.meta.url));
const app = join(root, 'app');

const sources = readdirSync(app, { recursive: true, encoding: 'utf8' })
  .filter((path) => /\.(vue|ts|css)$/.test(path))
  .map((path) => join(app, path));

const name = (file: string) => relative(root, file).replaceAll('\\', '/');

function offenders(pattern: RegExp, allowed: readonly string[]) {
  return sources
    .filter((file) => !allowed.includes(name(file)))
    .filter((file) => pattern.test(readFileSync(file, 'utf8')))
    .map(name);
}

const PLACEMENT = 'app/composables/popup-placement.ts';
const EDITOR_LAYER = 'app/composables/editor-popover-layer.ts';
const POPUP = 'app/components/FloatingPopup.vue';
const HINT = 'app/components/TitlePopup.vue';

describe('popups', () => {
  it('are placed only by the placement core', () => {
    // Types may be named anywhere; what places a popup may not be used.
    expect(
      offenders(/import\s+\{[^}]*\}\s+from\s+'@floating-ui\//, [
        PLACEMENT,
        EDITOR_LAYER,
      ]),
    ).toEqual([]);
  });

  it('are teleported only by the popup and the hint', () => {
    expect(offenders(/<Teleport\b|teleport-?to/i, [POPUP, HINT])).toEqual([]);
  });

  it('stack only at the heights of the scale', () => {
    // The page's loading bar is drawn over everything, hints included.
    expect(
      offenders(/\bz-999[89]\b|z-index:\s*999[89]/, [
        POPUP,
        HINT,
        'app/components/TheiLoadingIndicator.vue',
      ]),
    ).toEqual([]);
  });
});
