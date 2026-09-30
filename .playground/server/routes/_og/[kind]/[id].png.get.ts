import { composeOgCard } from '#layers/thei/server/thei/og/compose';
import { resolveOgContent } from '#layers/thei/server/thei/og/content';
import {
  OG_LAYOUT_NAMES,
  type OgLayoutName,
} from '#layers/thei/server/thei/og/design';
import { OG_TONES, type OgTone } from '#layers/thei/server/thei/og/palette';
import { renderOgPng } from '#layers/thei/server/thei/og/render';
import { parseOgTarget } from '#layers/thei/server/thei/og/targets';

/**
 * A card drawn fresh, past the cache, for the playground's own gallery of
 * real cards: `?layout=` and `?tone=` draw it in any layout and tone, to
 * compare. Playground-only — an installed site has no such route — and only
 * for the owner.
 */
export default defineEventHandler(async (event) => {
  if (!(await THEI_SERVER.isAdmin(event)))
    throw createError({ statusCode: 404 });
  const target = parseOgTarget(
    getRouterParam(event, 'kind') ?? '',
    (getRouterParam(event, 'id.png') ?? '').replace(/\.png$/, ''),
  );
  if (!target) throw createError({ statusCode: 404 });
  const content = await resolveOgContent(target);
  if (!content) throw createError({ statusCode: 404 });
  const query = getQuery(event);
  const layout = OG_LAYOUT_NAMES.includes(query.layout as OgLayoutName)
    ? (query.layout as OgLayoutName)
    : undefined;
  const tone = OG_TONES.includes(query.tone as OgTone)
    ? (query.tone as OgTone)
    : undefined;
  const card = await composeOgCard(content, {
    ...(layout ? { layout } : {}),
    ...(tone ? { tone } : {}),
  });
  setHeader(event, 'Content-Type', 'image/png');
  setHeader(event, 'Cache-Control', 'no-store');
  setHeader(
    event,
    'X-Og-Design',
    `${card.design.layout} ${card.design.tone}; ${Object.values(card.stacks)
      .flatMap((stack) => stack.steps)
      .join(', ')}`,
  );
  return renderOgPng(card.node);
});
