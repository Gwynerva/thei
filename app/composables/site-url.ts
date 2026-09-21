import {
  normalizeBasePath,
  resolveSiteUrl,
  withSiteBase,
  withoutSiteBase,
} from '#layers/thei/shared/site-url';

/**
 * The address absolute links on this page are built from.
 *
 * The origin is carried in the payload rather than fetched, because every
 * public page needs it during `setup` to write `rel=canonical` and the JSON-LD
 * graph. It falls back to the request's own origin, which is what an instance
 * that has not configured an address wants — and on the client that is
 * `window.location`, so a hydrated page agrees with the server-rendered one.
 *
 * Paths in data never carry the base path (see `shared/site-url.ts`):
 * - the router adds it on its own to `TheiLink` and `navigateTo`;
 * - `path()` adds it for DOM attributes the router does not own — `src`,
 *   plain `href`, `fetch`/XHR, `location`;
 * - `resolve()` builds the absolute URL.
 */
export function useSiteUrl() {
  const configured = useState<string>('site-origin');
  const requestUrl = useRequestURL();
  const base = currentBase();
  const origin = computed(() => configured.value || requestUrl.origin);
  return {
    origin,
    base,
    path: sitePath,
    strip: (path: string) => withoutSiteBase(path, base),
    resolve: (path: string) =>
      resolveSiteUrl(origin.value, withSiteBase(path, base)),
  };
}

/**
 * The base path of this build.
 *
 * Remembered after the first read, because the runtime config is reachable
 * only from a Nuxt context, while paths are also built from places that run
 * outside one — a computed resolved while the head is rendered, an event
 * handler, a plain module. The value cannot change while the process lives,
 * so remembering it is exact rather than merely convenient.
 */
let cachedBase = '/';

function currentBase(): string {
  try {
    cachedBase = normalizeBasePath(useRuntimeConfig().app.baseURL);
  } catch {
    // Outside a Nuxt context: keep whatever the last read established.
  }
  return cachedBase;
}

/**
 * `useSiteUrl().path` for places outside a component's setup, such as event
 * handlers and plain modules.
 */
export function sitePath(path: string): string;
export function sitePath(path: string | undefined): string | undefined;
export function sitePath(path: string | undefined): string | undefined {
  if (!path) return path;
  // Anything already absolute — an external link, a data URI — is left alone.
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(path)) return path;
  return withSiteBase(path, currentBase());
}
