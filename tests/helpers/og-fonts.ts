import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { vi } from 'vitest';

const require = createRequire(import.meta.url);

/**
 * The card fonts, read straight out of the package the build copies them
 * from, behind the same server-asset storage the server reads — so tests
 * measure and draw with exactly the metrics a site uses.
 */
export function stubOgFonts() {
  vi.stubGlobal('useStorage', () => ({
    getItemRaw: (name: string) =>
      readFile(require.resolve(`@fontsource/noto-sans/files/${name}`)).catch(
        () => null,
      ),
  }));
}
