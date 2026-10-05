import {
  PUBLIC_SEARCH_PRESETS,
  publicSearchPresetHref,
} from '#layers/thei/shared/public-search';
import { LIFE_PRESETS, lifePresetHref } from '#layers/thei/shared/life-presets';
import { getRequestPath } from '../thei/request';
import { sitePath } from '../thei/site-url';

/**
 * Short addresses for the search configurations that are pages in their own
 * right: `/projects/`, `/events/`, `/showcase/`, `/cv/`.
 *
 * They redirect rather than render. The configuration on `/search/` stays the
 * one canonical address, so a crawler following either of them indexes one
 * page rather than two identical ones — and a person who guesses the short
 * address still lands where they meant to.
 *
 * A middleware rather than a route file, because these paths sit among the
 * Vue routes (`/projects/<something>` is a page) and answering them here keeps
 * the site's URL shape in one place.
 */
export default defineEventHandler((event) => {
  const path = getRequestPath(event);
  const normalized = path.endsWith('/') ? path : `${path}/`;
  const preset = PUBLIC_SEARCH_PRESETS.find(
    (candidate) => candidate.path === normalized,
  );
  if (preset)
    return sendRedirect(event, sitePath(publicSearchPresetHref(preset)), 301);
  // The same door, for the readings of the chronology that are destinations:
  // `/diary/` is the diary, while `/diary/<day>/` is one entry in it.
  const life = LIFE_PRESETS.find((candidate) => candidate.path === normalized);
  if (life) return sendRedirect(event, sitePath(lifePresetHref(life)), 301);
});
