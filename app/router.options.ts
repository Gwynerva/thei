import type { RouterConfig } from 'nuxt/schema';
// Nuxt's own scroll behaviour, which this file would otherwise replace whole.
import nuxtRouterOptions from '#app/../pages/runtime/router.options';
import { parseLandingHash } from '#layers/thei/shared/search/landing';

const nuxtScrollBehavior = nuxtRouterOptions.scrollBehavior!;

/**
 * Nuxt's scroll behaviour, but for the hash of a find of the search
 * (`shared/search/landing.ts`). It names its place by what the page marks it
 * with, not by an id, so the router looking for an element by it finds none;
 * the landing brings the place into view itself
 * (`app/composables/search-landing.ts`). Another page starts at its top, as
 * it would with no hash, and on the same page the window stays where it is.
 */
export default <RouterConfig>{
  scrollBehavior(to, from, savedPosition) {
    if (!to.hash || !parseLandingHash(to.hash))
      return nuxtScrollBehavior(to, from, savedPosition);
    if (to.path.replace(/\/$/, '') === from.path.replace(/\/$/, ''))
      return false;
    return nuxtScrollBehavior({ ...to, hash: '' }, from, savedPosition);
  },
};
