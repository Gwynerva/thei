import type { ReferenceElement } from '@floating-ui/vue';
import type { SearchResponse } from '#layers/thei/shared/search/api';
import { toDateString } from '#layers/thei/shared/date-range';
import { matchChord, matchSlash, useShortcut } from './shortcut';

/**
 * The one quick search of the site, the same for a visitor and the owner:
 * opened by the search icon of the header on a public page, by the admin
 * bar's in the admin, and by Ctrl+K (⌘K on a Mac) or "/" anywhere no modal is
 * in front. On the search page itself, those take the page's own field.
 */
const anchor = shallowRef<ReferenceElement | null>(null);

/** What opens the search, marked so a key can open it at the same place. */
export const SITE_SEARCH_ANCHOR = 'data-site-search';

export function useSiteSearch() {
  const open = useState('site-search-open', () => false);
  const route = useRoute();

  /** The search page's own field, when the search page is open. */
  function pageField() {
    return route.path === '/search/'
      ? document.querySelector<HTMLInputElement>('[data-search-page-field]')
      : null;
  }

  function show(from?: Element | null) {
    const field = pageField();
    if (field) {
      field.focus();
      field.select();
      return;
    }
    anchor.value = from ?? keyAnchor();
    open.value = true;
  }

  return { open, anchor: computed(() => anchor.value), show };
}

/**
 * Where the search opens when a key opened it: by the search button the page
 * shows, or, where none is shown, at the top of the window.
 */
function keyAnchor(): ReferenceElement {
  const button = [
    ...document.querySelectorAll<HTMLElement>(`[${SITE_SEARCH_ANCHOR}]`),
  ].find((element) => element.getClientRects().length > 0);
  if (button) return button;
  return {
    contextElement: document.body,
    getBoundingClientRect: () => {
      const x = window.innerWidth / 2;
      return new DOMRect(x, 48, 0, 0);
    },
  };
}

/** Ctrl+K and "/": once for the whole page, in the search popup. */
export function useSiteSearchKeys(onAgain: () => void) {
  const { open, show } = useSiteSearch();
  // Ctrl+K anywhere, in a field too, as the sites people know do it; again
  // while the search is open, it selects the query to type a new one.
  useShortcut(
    (event) => matchChord(event, { code: 'KeyK' }),
    () => (open.value ? onAgain() : show()),
    { allowInEditable: true, capture: true },
  );
  // "/" only where it types nothing.
  useShortcut(matchSlash, () => {
    if (!open.value) show();
  });
}

/** How long typing waits for a pause before the search goes out. */
const PAUSE_SHORT_MS = 300;
const PAUSE_MS = 150;

/**
 * The quick search's answers as the query is typed: each after a pause,
 * the one before cancelled, an answer that comes late to a newer query
 * dropped. The owner's search also hears which page they are on and what
 * day it is for them, for what it offers to do.
 */
export function useQuickSearch(
  text: Ref<string>,
  options: { enabled: Ref<boolean>; owner: Ref<boolean> },
) {
  const route = useRoute();
  const response = shallowRef<SearchResponse | null>(null);
  const loading = ref(false);
  const failed = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let version = 0;

  async function send(q: string) {
    controller?.abort();
    const mine = ++version;
    controller = new AbortController();
    loading.value = true;
    failed.value = false;
    try {
      const answer = await $fetch<SearchResponse>('/api/search', {
        query: {
          q,
          quick: '1',
          typing: '1',
          ...(options.owner.value
            ? { today: toDateString(new Date()), path: route.path }
            : {}),
        },
        signal: controller.signal,
        retry: 0,
      });
      if (mine === version) response.value = answer;
    } catch (caught) {
      if (mine !== version || controller.signal.aborted) return;
      // Too many at once: the next pause in typing asks again.
      const status = (caught as { statusCode?: number }).statusCode;
      if (status === 429) {
        timer = setTimeout(() => void send(q), 1000);
        return;
      }
      failed.value = true;
    } finally {
      if (mine === version) loading.value = false;
    }
  }

  function schedule(now = false) {
    clearTimeout(timer);
    const q = text.value.trim();
    const pause = now ? 0 : q.length < 3 ? PAUSE_SHORT_MS : PAUSE_MS;
    // Waiting shows from the key that started it, not from the request.
    loading.value = true;
    timer = setTimeout(() => void send(q), pause);
  }

  watch(text, () => schedule());
  watch(
    options.enabled,
    (enabled) => {
      if (enabled) schedule(true);
      else {
        clearTimeout(timer);
        controller?.abort();
        version++;
        loading.value = false;
      }
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    clearTimeout(timer);
    controller?.abort();
  });

  return { response, loading, failed, refresh: () => schedule(true) };
}
