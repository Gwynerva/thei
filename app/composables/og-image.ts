import { hash } from '#layers/thei/shared/utils/hash';

/**
 * The address of the card a link to this page previews as.
 *
 * The version in the query is not read by the server — it exists because link
 * previewers cache by address and ignore cache headers, so a changed title or
 * a new picture has to arrive as a new address. It is built from what the page
 * already knows: the things the card is drawn from.
 */
export function useOgImage(
  kind:
    | 'site'
    | 'service'
    | 'project'
    | 'stage'
    | 'section'
    | 'event'
    | 'page'
    | 'diary'
    | 'tag',
  id: MaybeRefOrGetter<string | undefined>,
  parts: MaybeRefOrGetter<(string | number | undefined)[]>,
) {
  // The site's own name and icon are part of every card, so a change to
  // either has to change the address too.
  const { data } = useNuxtData<{
    displayName: string;
    favicon?: { version: string };
  }>('admin-profile');
  return computed(() => {
    const identity = toValue(id);
    if (kind !== 'site' && !identity) return undefined;
    const site = data.value;
    const version = hash(
      [
        ...toValue(parts).map((part) => String(part ?? '')),
        site?.displayName ?? '',
        site?.favicon?.version ?? '',
      ].join('|'),
      10,
    );
    const path =
      kind === 'site'
        ? '/og/site.png'
        : `/og/${kind}/${encodeURIComponent(identity!)}.png`;
    return `${path}?v=${version}`;
  });
}
