import { SiteAccessLevel } from '#layers/thei/shared/access-level';
import { getProfile } from '../../profile';
import type { OgCardContent, OgServiceId } from '../model';
import type { OgTarget } from '../targets';
import { drawableContent } from '../text';
import {
  diaryContent,
  eventContent,
  pageContent,
  sectionContent,
  projectContent,
  tagContent,
} from './entities';
import { homeContent, serviceContent } from './services';
import { ogSite } from './shared';

/**
 * What a shared link's card says, read as a stranger would read the page —
 * or nothing, where a stranger would be refused.
 *
 * A closed site publishes nothing, so nothing on it has a card.
 */
export async function resolveOgContent(
  target: OgTarget,
): Promise<OgCardContent | undefined> {
  if (THEI_SERVER.config.siteAccessLevel === SiteAccessLevel.Private)
    return undefined;
  const site = await ogSite(getProfile().displayName);
  let content: OgCardContent | undefined;
  switch (target.kind) {
    case 'site':
      content = await homeContent(site);
      break;
    case 'service':
      content = await serviceContent(target.id as OgServiceId, site);
      break;
    case 'project':
      content = await projectContent(target.id, site);
      break;
    case 'section':
      content = await sectionContent(target.id, site);
      break;
    case 'event':
      content = await eventContent(target.id, site);
      break;
    case 'diary':
      content = await diaryContent(target.id, site);
      break;
    case 'page':
      content = await pageContent(target.id, site);
      break;
    case 'tag':
      content = await tagContent(target.id, site);
      break;
  }
  if (!content) return undefined;
  // What the card is, in the site's words: the fallback headline for one
  // whose own cannot be drawn, and the start of what it is described as.
  const kind = content.chips[0]?.label ?? content.site.name;
  const drawable = drawableContent(content, kind);
  return {
    ...drawable,
    // The description of the picture is read, not drawn: it names the thing
    // in full, whatever script it is in.
    alt: THEI_SERVER.phrase.og_image_alt(kind, content.headline, site.name),
  };
}
