import { resolveSiteUrl } from '#layers/thei/shared/site-url';

/**
 * The address absolute links on this page are built from.
 *
 * Carried in the payload rather than fetched, because every public page needs
 * it during `setup` to write `rel=canonical` and the JSON-LD graph. Falls back
 * to the request's own origin, which is what an instance that has not
 * configured an address wants — and on the client that is `window.location`,
 * so a hydrated page agrees with the server-rendered one.
 */
export function useSiteUrl() {
  const configured = useState<string>('site-origin');
  const requestUrl = useRequestURL();
  const origin = computed(() => configured.value || requestUrl.origin);
  return {
    origin,
    resolve: (path: string) => resolveSiteUrl(origin.value, path),
  };
}
