import { sn } from 'unslash';
import { readFileSync } from 'node:fs';
import { transformSync } from 'oxc-transform';
import { theiPath } from '#thei/static';

// Compiled once while the server boots, never on the render path: an update
// replaces the engine directory underneath a running process, and a render must
// never depend on that directory still being intact.
const source = readFileSync(sn(theiPath, '/app/scripts/visuals.ts'), 'utf-8');
const { code } = transformSync('visuals.ts', source);
const visualsScript = `(()=>{${code.replace(/^export\s+/gm, '')}})()`;

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('render:html', (html) => {
    html.head.push(`<script>${visualsScript}</script>`);
  });
});
