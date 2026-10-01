import type { ComputedRef, MaybeRefOrGetter } from 'vue';
import {
  buildOgInfoPath,
  type OgImageInfo,
  type OgImageTarget,
} from '#layers/thei/shared/og-url';

/**
 * The card a link to this page previews as: its address and a description
 * of it, or nothing where the page has no card.
 *
 * The server builds both from what the card shows, so the version in the
 * address changes exactly when the picture does — previewers cache by
 * address and ignore cache headers, so that is how a new title or a new
 * picture reaches them. Fetched while the page renders on the server, so it
 * is in the head the first time a crawler reads it; a page reached by a
 * click in the browser asks for nothing, since no previewer reads its head.
 */
export function useOgImage(
  target: MaybeRefOrGetter<OgImageTarget | undefined>,
): ComputedRef<OgImageInfo | undefined> {
  const key = () => {
    const value = toValue(target);
    return value ? `og:${value.kind}:${value.id}` : 'og:none';
  };
  const { data } = useAsyncData(
    key,
    async () => {
      const value = toValue(target);
      if (!value || import.meta.client) return null;
      return $fetch<OgImageInfo>(buildOgInfoPath(value)).catch(() => null);
    },
    { dedupe: 'defer' },
  );
  return computed(() => data.value ?? undefined);
}
