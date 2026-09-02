import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');

describe('public view settings placement', () => {
  it('places the mode selector after font style in the same settings box', () => {
    const source = read('app/components/settings/SettingsVisualsBox.vue');
    const fontStyleIndex = source.indexOf('phrase.font_style');
    const publicViewIndex = source.indexOf('phrase.public_view_mode');

    expect(fontStyleIndex).toBeGreaterThan(-1);
    expect(publicViewIndex).toBeGreaterThan(fontStyleIndex);
    expect(source).toContain('<Field v-if="showPublicViewMode">');
    expect(source).toContain("icon: 'visibility'");
    expect(source).toContain("icon: 'visibility-off'");
    expect(source).toContain('phrase.public_view_admin_hint');
    expect(source).toContain('phrase.public_view_guest_hint');
  });

  it('enables the selector only from the authenticated public header', () => {
    const publicHeader = read('app/components/public/PublicHeader.vue');
    const installationVisuals = read(
      'app/components/settings/SettingsVisuals.vue',
    );

    expect(publicHeader).toContain(':show-public-view-mode="isAdmin"');
    expect(installationVisuals).toContain('<SettingsVisualsBox />');
    expect(installationVisuals).not.toContain('show-public-view-mode');
  });
});

function read(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}
