import { sn } from 'unslash';
import { readFileSync } from 'node:fs';
import { transformSync } from 'oxc-transform';
import { theiPath } from '#thei/static';

let visualsScript = '';

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('render:html', (html) => {
    if (!visualsScript) {
      const src = readFileSync(
        sn(theiPath, '/app/scripts/visuals.ts'),
        'utf-8',
      );
      const { code } = transformSync('visuals.ts', src);
      const stripped = code.replace(/^export\s+/gm, '');
      visualsScript = `(()=>{${stripped}})()`;
    }
    html.head.push(`<script>${visualsScript}</script>`);
  });
});
