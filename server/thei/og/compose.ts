import { analyzePicture } from './artwork';
import { chooseDesign, type OgDesign } from './design';
import type { OgFittedStack } from './fit';
import { OG_LAYOUTS } from './layouts';
import type { OgCardContent } from './model';
import { ogPalette } from './palette';
import type { OgShownPicture } from './picture';
import type { OgNode } from './render';

export interface OgComposedCard {
  node: OgNode;
  design: OgDesign;
  stacks: Record<string, OgFittedStack>;
}

/**
 * A card's content, drawn: its pictures looked at, a layout and a tone
 * chosen for it, a palette built from its accent, and the layout laid out.
 *
 * A picture that cannot be read is left out as if it were never there, so a
 * broken file costs a card its picture, not the card.
 */
export async function composeOgCard(
  content: OgCardContent,
  override: Partial<OgDesign> = {},
): Promise<OgComposedCard> {
  const shown = async (
    value: OgCardContent['picture'],
  ): Promise<OgShownPicture | undefined> => {
    const analysis = value ? await analyzePicture(value) : undefined;
    return value && analysis ? { picture: value, analysis } : undefined;
  };
  const [picture, banner] = await Promise.all([
    shown(content.picture),
    shown(content.banner),
  ]);
  const tiles = (
    await Promise.all(
      content.tiles.map(async (tile) => {
        const analysis = await analyzePicture(tile);
        return analysis ? { picture: tile, analysis } : undefined;
      }),
    )
  ).filter((tile): tile is OgShownPicture => Boolean(tile));

  const design = chooseDesign(
    content,
    picture?.analysis,
    tiles.length,
    override,
  );
  const palette = ogPalette(content.accent, design.tone, {
    duotoneDirection: design.duotoneDirection,
  });
  const result = await OG_LAYOUTS[design.layout]({
    content,
    design,
    palette,
    picture,
    banner,
    tiles,
  });
  return { ...result, design };
}
