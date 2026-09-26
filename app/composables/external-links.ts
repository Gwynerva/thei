import { reactive, shallowReactive } from 'vue';
import {
  normalizeExternalLinkUrl,
  type ExternalLink,
} from '#layers/thei/shared/external-link';

export type ExternalLinkFetcher = (
  url: string,
  options: {
    method?: 'POST';
    query?: Record<string, string>;
    body?: Record<string, unknown>;
  },
) => Promise<ExternalLink>;

/**
 * The records of external links a page knows about, shared by every card,
 * chip and editor on it, so an address is asked about at most once and a
 * refresh made in one place shows everywhere.
 */
export interface ExternalLinkStore {
  /** Remembers records that arrived with the page's own data. */
  seed(links: Iterable<Partial<ExternalLink> | null | undefined>): void;
  get(url: string): ExternalLink | undefined;
  /**
   * The stored record. A link the site has never seen is read once and
   * kept; nothing is requested during server rendering.
   */
  lookup(url: string): Promise<ExternalLink | undefined>;
  /**
   * Reads the site again and stores what it says: for a link that was just
   * put in, or one the person asked to refresh.
   */
  refresh(url: string): Promise<ExternalLink>;
  clear(): void;
}

export function createExternalLinkStore(
  fetcher: ExternalLinkFetcher,
  { canRequest = true } = {},
): ExternalLinkStore {
  const links = shallowReactive(new Map<string, ExternalLink>());
  const pending = new Map<string, Promise<ExternalLink>>();

  function remember(link: ExternalLink) {
    links.set(link.url, link);
    return link;
  }

  /** One request per address and kind at a time; later callers join it. */
  function once(key: string, send: () => Promise<ExternalLink>) {
    let request = pending.get(key);
    if (!request) {
      const started: Promise<ExternalLink> = send()
        .then(remember)
        .finally(() => {
          if (pending.get(key) === started) pending.delete(key);
        });
      pending.set(key, started);
      request = started;
    }
    return request;
  }

  return {
    seed(values) {
      for (const link of values) {
        if (
          link &&
          typeof link.url === 'string' &&
          link.faviconMedia &&
          typeof link.touchedAt === 'number'
        )
          links.set(link.url, link as ExternalLink);
      }
    },
    get: (url) => links.get(url),
    async lookup(url) {
      const known = links.get(url);
      if (known || !canRequest) return known;
      return await once(`lookup ${url}`, () =>
        fetcher('/api/admin/external-links', { query: { url } }),
      );
    },
    refresh(url) {
      return once(`refresh ${url}`, () =>
        fetcher('/api/admin/external-links', { method: 'POST', body: { url } }),
      );
    },
    clear: () => links.clear(),
  };
}

const appStores = new WeakMap<object, ExternalLinkStore>();

/** One store per app, forgotten when the page changes, like the link resolver. */
export function useExternalLinks(): ExternalLinkStore {
  const nuxtApp = useNuxtApp();
  let store = appStores.get(nuxtApp);
  if (!store) {
    const created = createExternalLinkStore(
      (url, options) => $fetch<ExternalLink>(url, options),
      { canRequest: import.meta.client },
    );
    appStores.set(nuxtApp, created);
    if (import.meta.client) nuxtApp.hook('page:start', () => created.clear());
    store = created;
  }
  return store;
}

/**
 * An address being entered, with the preview that goes with it. Typing
 * changes nothing but the text and whether it is a valid address; the site
 * is read when the address is done — `commit` — or on an explicit `refresh`.
 */
export interface ExternalLinkDraft {
  /** The field's text. Setting it validates and shows a known record at once. */
  url: string;
  readonly preview: ExternalLink | undefined;
  readonly loading: boolean;
  readonly error: string | undefined;
  /**
   * Shows a link that already exists. Nothing is read unless the site has
   * never seen it, and then only once.
   */
  open(url: string): Promise<void>;
  /** The address is done being entered: reads the site, unless this draft already has for it. */
  commit(): Promise<ExternalLink | undefined>;
  /** Reads the site again. */
  refresh(): Promise<ExternalLink | undefined>;
  reset(): void;
}

export function createExternalLinkDraft(
  store: ExternalLinkStore,
  options: { errorText: () => string },
): ExternalLinkDraft {
  const state = reactive({
    url: '',
    preview: undefined as ExternalLink | undefined,
    loading: false,
    error: undefined as string | undefined,
  });
  /** The normalized address the draft is about. */
  let target: string | undefined;
  /** The address this draft has already shown or read the record of. */
  let committed: string | undefined;
  /** A read still under way, so that asking twice sends once. */
  let pending:
    { address: string; result: Promise<ExternalLink | undefined> } | undefined;
  let version = 0;

  function retarget(url: string | undefined) {
    target = url;
    version += 1;
    state.loading = false;
    // A record the site already has shows at once; nothing is requested.
    state.preview = url ? store.get(url) : undefined;
  }

  function setUrl(raw: string) {
    state.url = raw;
    if (!raw.trim()) {
      retarget(undefined);
      state.error = undefined;
      return;
    }
    let normalized: string;
    try {
      normalized = normalizeExternalLinkUrl(raw);
    } catch (cause) {
      retarget(undefined);
      state.error =
        cause instanceof Error ? cause.message : options.errorText();
      return;
    }
    state.error = undefined;
    if (normalized !== target) retarget(normalized);
  }

  function read(url: string, send: () => Promise<ExternalLink | undefined>) {
    const current = ++version;
    state.loading = true;
    state.error = undefined;
    const result = (async () => {
      try {
        const link = await send();
        if (current !== version) return undefined;
        if (link) {
          state.preview = link;
          state.url = link.url;
          committed = url;
        }
        return link;
      } catch (cause: unknown) {
        if (current !== version) return undefined;
        state.error =
          (cause as { data?: { statusMessage?: string } } | undefined)?.data
            ?.statusMessage ?? options.errorText();
        return undefined;
      } finally {
        if (current === version) {
          state.loading = false;
          pending = undefined;
        }
      }
    })();
    pending = { address: url, result };
    return result;
  }

  return {
    get url() {
      return state.url;
    },
    set url(value: string) {
      setUrl(value);
    },
    get preview() {
      return state.preview;
    },
    get loading() {
      return state.loading;
    },
    get error() {
      return state.error;
    },
    async open(url) {
      setUrl(url);
      const address = target;
      if (!address) return;
      committed = address;
      if (!state.preview) await read(address, () => store.lookup(address));
    },
    async commit() {
      const address = target;
      if (!address || address === committed) return state.preview;
      // Pasted and then confirmed with Enter: one read, not two.
      if (pending?.address === address) return await pending.result;
      return await read(address, () => store.refresh(address));
    },
    async refresh() {
      const address = target;
      if (!address) return undefined;
      return await read(address, () => store.refresh(address));
    },
    reset() {
      state.url = '';
      retarget(undefined);
      state.error = undefined;
      committed = undefined;
      pending = undefined;
    },
  };
}
