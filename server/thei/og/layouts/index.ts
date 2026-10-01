import type { OgLayoutName } from '../design';
import { calendar } from './calendar';
import { collection } from './collection';
import type { OgLayout } from './common';
import { home } from './home';
import { life } from './life';
import { media } from './media';
import { page } from './page';
import { poster } from './poster';
import { project } from './project';
import { tag } from './tag';
import { tags } from './tags';

export const OG_LAYOUTS: Record<OgLayoutName, OgLayout> = {
  project,
  media,
  calendar,
  page,
  tag,
  poster,
  home,
  life,
  tags,
  collection,
};
