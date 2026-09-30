import {
  getCurrentScope,
  onScopeDispose,
  reactive,
  shallowReactive,
} from 'vue';
import {
  externalLinkHostLooksComplete,
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
          // Only the record: a block or a list entry it arrived with carries
          // the owner's own words about the link too, which belong to that
          // one place and not to every card showing the address.
          links.set(link.url, {
            url: link.url,
            title: link.title,
            description: link.description,
            faviconMedia: link.faviconMedia,
            status: link.status ?? 'complete',
            touchedAt: link.touchedAt,
          });
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
 * An address being entered, with the preview that goes with it. Setting the
 * text only validates it and shows a record the page already knows; the site
 * is read on `commit` — once typing pauses (`useExternalLinkTyping`), or when
 * the address is done — or on an explicit `refresh`.
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
  /**
   * Reads the site, unless this draft already has for the address.
   *
   * By default the address is done — left, confirmed or pasted — and the
   * field is tidied to the address as stored. With `typing` the person is
   * still at it: an address whose host is not finished yet, or one the page
   * already knows, is not read, and the text is never touched, so an answer
   * landing mid-word cannot move what is being typed.
   */
  commit(options?: { typing?: boolean }): Promise<ExternalLink | undefined>;
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
    // The answer of a read for another address is thrown away when it comes,
    // so nothing may wait for it: coming back to that address reads anew.
    pending = undefined;
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

  /** The field shows the address as the site stores it, if it is still this one. */
  function show(address: string, link: ExternalLink | undefined) {
    if (link && target === address) state.url = link.url;
    return link;
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
      if (!state.preview)
        show(address, await read(address, () => store.lookup(address)));
    },
    async commit({ typing = false } = {}) {
      const address = target;
      if (!address) return undefined;
      if (
        typing &&
        address !== committed &&
        (state.preview || !externalLinkHostLooksComplete(state.url))
      )
        return state.preview;
      const link =
        address === committed
          ? state.preview
          : // Read after a pause and then confirmed: one read, not two.
            pending?.address === address
            ? await pending.result
            : await read(address, () => store.refresh(address));
      return typing ? link : show(address, link);
    },
    async refresh() {
      const address = target;
      if (!address) return undefined;
      return show(address, await read(address, () => store.refresh(address)));
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

/** How long typing into an address must pause before the site is read. */
export const EXTERNAL_LINK_TYPING_DELAY_MS = 600;

/**
 * Reads an address as it is typed into a field: `onInput` goes on the field's
 * `input` event, and `settle` — the field's own "the address is done" — runs
 * once typing pauses, with `typing: true`. A paste or a drop puts in a whole
 * address at once, so it settles right away and as done.
 *
 * Only the person's input starts it. An address the page sets itself — a
 * stored link, a restored draft — fires no `input` event and is never read
 * by it.
 */
export function useExternalLinkTyping(
  settle: (options: { typing: boolean }) => unknown,
  delay = EXTERNAL_LINK_TYPING_DELAY_MS,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  function cancel() {
    clearTimeout(timer);
    timer = undefined;
  }

  function schedule(typing: boolean, wait: number) {
    // A plain timer rather than a debounced call: it never waits for the
    // previous read to finish, so the pause is always measured from the last
    // keystroke.
    timer = setTimeout(() => {
      timer = undefined;
      void Promise.resolve(settle({ typing })).catch(() => {});
    }, wait);
  }

  function onInput(event: Event) {
    cancel();
    const { inputType, isComposing } = event as Partial<InputEvent>;
    // Text being composed is not typed yet; the input that ends the
    // composition schedules the read.
    if (isComposing) return;
    // The text is in the field once the event has run, so even an address
    // put in whole is read on the next task, not from inside the event.
    if (inputType === 'insertFromPaste' || inputType === 'insertFromDrop')
      schedule(false, 0);
    else schedule(true, delay);
  }

  if (getCurrentScope()) onScopeDispose(cancel);
  return { onInput, cancel };
}
