import { scrollIntoSight } from '#layers/thei/app/modals/layer-motion';
import {
  isLandingPlaceHash,
  landingHash,
  parseLandingHash,
  type LandingTarget,
} from '#layers/thei/shared/landing';

/**
 * Landing where a link led on its page (`shared/landing.ts`): a find of the
 * search, a heading of the contents, a part of the page, a status of the
 * feed, a file's window. The place is brought out of whatever hides it, lit
 * up for a moment, and the words found are marked in it.
 *
 * What hides a place takes part in two ways:
 *
 * - A part of the page that keeps the place out of it — the rest of a list
 *   cut short, the history of statuses or of avatars, another tab or page of
 *   relations — brings it in when asked: `useLandingReveal`.
 * - A part that holds the place hidden — a spoiler, a gallery on another
 *   slide — hears the `theilanding` event the landing sends from the place,
 *   with the target, and shows it. A closed `<details>` is opened here.
 *
 * On a phone, what the sidebar holds is in its sheet, which opens for it.
 * Words that stand in no visible text — a hint, a link's note, a file's
 * description or caption — bring up the hint, the card of the link or the
 * file's window, where they are read; words in a line cut short, such as a
 * relation's note, bring up the hint that says the line whole.
 *
 * An anchor — the id of an element, a heading — is scrolled to by the router,
 * as ever; the landing brings it in and scrolls only when it was hidden, or
 * when its id reads as a place the router leaves alone. A place of a file
 * named open has its window opened on it, the way a press of the page opens
 * it, and the address keeps the place: the window writes its own while it is
 * open. Going back or forth in the history lands nowhere: the page is put
 * where it was, with nothing lit.
 */
const LANDING_EVENT = 'theilanding';

type Revealer = (target: LandingTarget) => unknown;
const revealers = new Set<Revealer>();
let openSheet: (() => void) | undefined;

/** A part of the page that brings a place in when a link lands on it. */
export function useLandingReveal(revealer: Revealer) {
  onMounted(() => revealers.add(revealer));
  onBeforeUnmount(() => revealers.delete(revealer));
}

/** The sheet that holds the sidebar on a phone: opened for a place in it. */
export function useLandingSheet(open: () => void) {
  onMounted(() => (openSheet = open));
  onBeforeUnmount(() => {
    if (openSheet === open) openSheet = undefined;
  });
}

/**
 * Whether blocks of a text hold the block a target names, at any depth: a
 * private section holds blocks of its own.
 */
export function holdsLandingBlock(
  blocks: readonly unknown[],
  target: LandingTarget,
): boolean {
  if (!target.block) return false;
  return blocks.some((raw) => {
    const block = raw as { id?: string; data?: { blocks?: unknown[] } };
    return (
      block.id === target.block ||
      (Array.isArray(block.data?.blocks) &&
        holdsLandingBlock(block.data.blocks, target))
    );
  });
}

const HIGHLIGHT = 'landing-words';
/** As long as the place stays lit: its fading in `app/styles/content.css`. */
const LIT_MS = 6000;
/** How far the light reaches past the place, in pixels. */
const LIGHT_PAD = 6;
const frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function attribute(name: string, value: string) {
  return `[${name}="${CSS.escape(value)}"]`;
}

/** Where on the page a target stands, by what each part marks itself with. */
function selectorOf(target: LandingTarget): string | undefined {
  if (target.anchor) return attribute('id', target.anchor);
  if (target.block) return attribute('data-block', target.block);
  if (target.file)
    return `${attribute('data-landing-zone', target.zone ?? '')} ${attribute('data-file', target.file)}`;
  if (target.relation)
    return attribute('data-relation-href', target.relation.href);
  if (target.link) return attribute('data-link', target.link);
  if (target.status) return attribute('data-status-date', target.status);
  if (target.avatar) return attribute('data-avatar', target.avatar);
  if (target.zone) return attribute('data-landing-zone', target.zone);
  return undefined;
}

/** The place of a hash without its words, as an element's id would read. */
function hashId(hash: string) {
  const place = hash.replace(/^#/u, '').split(':~:')[0] ?? '';
  try {
    return decodeURIComponent(place);
  } catch {
    return place;
  }
}

/**
 * An element the page names by the very words of the hash is what it means
 * — a heading whose anchor happens to read as a block — unless it is a part
 * of the page, which the hash names as such already.
 */
function byOwnId(target: LandingTarget, hash: string): LandingTarget {
  if (target.anchor) return target;
  const id = hashId(hash);
  const element = id ? document.getElementById(id) : null;
  return element && !element.hasAttribute('data-landing-zone')
    ? { anchor: id, words: target.words }
    : target;
}

function shown(element: Element) {
  return element.getClientRects().length > 0;
}

/** The place itself, the one in sight first; inside `root` when given. */
function locate(target: LandingTarget, root: ParentNode = document) {
  const selector = selectorOf(target);
  if (!selector) return undefined;
  const found = [...root.querySelectorAll(selector)];
  return found.find(shown) ?? found[0];
}

/**
 * Where the words stand first in the page's own text, for a target that
 * names no place: the block holding them, or the element.
 */
function locateWords(words: string[]) {
  const main = document.querySelector('main') ?? document.body;
  const first = ranges(main, words)[0];
  const parent = first?.startContainer.parentElement;
  return parent?.closest('[data-block]') ?? parent ?? undefined;
}

/** Within a block, the file a target names, once the block shows it. */
function fileWithin(block: Element, file: string | undefined) {
  if (!file) return block;
  const inner = [...block.querySelectorAll(attribute('data-file', file))];
  return inner.find(shown) ?? block;
}

/** What a press opens the place's window with. */
function openerOf(place: Element) {
  return place.matches('[data-opens-viewer]')
    ? (place as HTMLElement)
    : (place.querySelector<HTMLElement>('[data-opens-viewer]') ?? undefined);
}

async function revealAll(target: LandingTarget) {
  await Promise.all(
    [...revealers].map(async (revealer) => {
      try {
        await revealer(target);
      } catch {
        // A part that could not bring its place in leaves it where it is.
      }
    }),
  );
}

function openAncestors(element: Element) {
  for (
    let details = element.closest('details');
    details;
    details = details.parentElement?.closest('details') ?? null
  )
    details.open = true;
}

/** Text in sight: not only for screen readers, not hidden. */
function visibleText(node: Node) {
  const parent = node.parentElement;
  return Boolean(
    parent &&
    !parent.closest('.sr-only, [aria-hidden="true"], [inert], [hidden]') &&
    shown(parent),
  );
}

/** Every place the words stand in the visible text of an element. */
function ranges(element: Element, words: string[]): Range[] {
  const found: Range[] = [];
  const wanted = words.map((word) => word.toLocaleLowerCase());
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!visibleText(node)) continue;
    const text = (node.textContent ?? '').toLocaleLowerCase();
    for (const word of wanted)
      for (
        let at = text.indexOf(word);
        at !== -1 && found.length < 50;
        at = text.indexOf(word, at + word.length)
      ) {
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + word.length);
        found.push(range);
      }
  }
  return found;
}

type WordHolders = readonly (readonly [selector: string, name: string])[];

/** What holds the words where no text shows them: a hint, a link's note. */
const WORDS_IN: WordHolders = [
  ['abbr[data-content-hint]', 'data-content-hint'],
  ['a[data-content-note]', 'data-content-note'],
  ['[data-link-note]', 'data-link-note'],
];

/**
 * What says whole, in its hint, a line the page cuts short — a relation's
 * note beside the entity it is about: the hint shows only while the line
 * is cut (`data-title-popup-clipped`).
 */
const CUT_SHORT: WordHolders = [
  ['[data-title-popup-clipped]', 'data-title-popup'],
];

function holderOfWords(
  element: Element,
  words: string[],
  holders: WordHolders = WORDS_IN,
) {
  const wanted = words.map((word) => word.toLocaleLowerCase());
  for (const [selector, name] of holders) {
    const all = [
      ...(element.matches(selector) ? [element] : []),
      ...element.querySelectorAll(selector),
    ];
    const holder = all.find((candidate) => {
      const value = candidate.getAttribute(name)?.toLocaleLowerCase() ?? '';
      return wanted.some((word) => value.includes(word));
    });
    if (holder) return holder;
  }
  return undefined;
}

/**
 * The light over a place: a layer of its own laid over it, so a picture never
 * hides it, and letting every click through. It is fixed to the window and
 * follows the place frame by frame while it fades — the page scrolling, a
 * gallery turning, a sheet sliding up take it along — and it is put in the
 * place's dialog, if any, over which nothing of the body is drawn. Returns
 * what puts it out.
 */
function light(place: Element): () => void {
  const layer = document.createElement('div');
  layer.className = 'landing-light';
  layer.setAttribute('aria-hidden', 'true');
  const radius = parseFloat(getComputedStyle(place).borderTopLeftRadius) || 0;
  layer.style.borderRadius = `${radius + LIGHT_PAD}px`;
  (place.closest('dialog') ?? document.body).append(layer);
  let x = 0;
  let y = 0;
  let next = 0;
  const follow = () => {
    const at = place.getBoundingClientRect();
    layer.style.visibility = shown(place) ? '' : 'hidden';
    // Moved by how far it stands from the place, whatever its fixed position
    // is measured from: a dialog sliding in is a frame of its own.
    const now = layer.getBoundingClientRect();
    x += at.left - LIGHT_PAD - now.left;
    y += at.top - LIGHT_PAD - now.top;
    layer.style.translate = `${x}px ${y}px`;
    layer.style.width = `${at.width + 2 * LIGHT_PAD}px`;
    layer.style.height = `${at.height + 2 * LIGHT_PAD}px`;
    next = requestAnimationFrame(follow);
  };
  follow();
  return () => {
    cancelAnimationFrame(next);
    layer.remove();
  };
}

/** A pointer coming to rest on it: what shows its hint or its card. */
function hover(element: Element) {
  element.dispatchEvent(
    new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }),
  );
}

export function usePageLanding() {
  const route = useRoute();
  const router = useRouter();
  let unlight: ReturnType<typeof setTimeout> | undefined;
  let putOut: (() => void) | undefined;
  let found: Element | undefined;
  let run = 0;

  function clear() {
    clearTimeout(unlight);
    putOut?.();
    putOut = undefined;
    found?.removeAttribute('data-landing-found');
    found = undefined;
    if (typeof CSS !== 'undefined' && 'highlights' in CSS)
      CSS.highlights.delete(HIGHLIGHT);
  }

  /**
   * The window of a place named open, opened as a press of the page opens
   * it. The address is put back to the place first, so the page under the
   * window — and a reload once it closes — names the file, not its window;
   * the window writes its own address while it is open (`useModalAddress`).
   */
  async function openWindow(
    target: LandingTarget,
    place: Element,
    traversal: boolean,
  ) {
    const opener = openerOf(place);
    if (!opener || activeModal.value) return false;
    const page = route.fullPath.replace(/#.*$/u, '');
    const rest = landingHash({ ...target, open: false });
    const next = rest ? `${page}#${rest}` : page;
    landed = router.resolve(next).fullPath;
    await router.replace(next);
    if (!traversal) scrollIntoSight(place, { instant: true });
    opener.click();
    return true;
  }

  async function land(hash: string, { first = false, traversal = false } = {}) {
    clear();
    const mine = ++run;
    const parsed = parseLandingHash(hash);
    if (!parsed || (traversal && !parsed.open)) return;
    await frame();
    if (mine !== run) return;
    const target = byOwnId(parsed, hash);

    // Brought into the page, and onto the phone's sheet when the sidebar
    // holds it there; what is still loading is waited for a little.
    let element: Element | undefined;
    for (let attempt = 0; attempt < 12 && mine === run; attempt++) {
      if (attempt === 0 || attempt === 6) await revealAll(target);
      element = selectorOf(target) ? locate(target) : locateWords(target.words);
      if (
        element &&
        !shown(element) &&
        element.closest('[data-public-aside]')
      ) {
        const sheet = document.querySelector('dialog[open]');
        const inSheet = sheet && locate(target, sheet);
        if (inSheet) element = inSheet;
        else if (openSheet && attempt === 0) {
          openSheet();
          await pause(350);
          await revealAll(target);
          continue;
        }
      }
      if (element) break;
      await pause(150);
    }
    if (!element || mine !== run) return;
    const hidden = !shown(element);

    // Shown where it was hidden: its details opened, its spoiler lifted,
    // its gallery turned to the file.
    openAncestors(element);
    element.dispatchEvent(
      new CustomEvent(LANDING_EVENT, { bubbles: true, detail: target }),
    );
    await frame();
    await frame();
    if (mine !== run) return;
    const place = target.block ? fileWithin(element, target.file) : element;

    if (target.open && (await openWindow(target, place, traversal))) return;
    if (traversal) return;

    if (target.anchor) {
      // The router has scrolled to it, unless it was hidden from it.
      if (hidden || isLandingPlaceHash(hash))
        scrollIntoSight(place, { block: 'start' });
    }
    // Opened afresh, the browser has scrolled to the words when it found
    // them; only where it did not is the place brought into view.
    else if (!first || window.scrollY === 0) scrollIntoSight(place);
    found = place;
    place.setAttribute('data-landing-found', '');
    putOut = light(place);
    unlight = setTimeout(() => {
      putOut?.();
      putOut = undefined;
    }, LIT_MS);

    if (!target.words.length) return;
    const marked = ranges(place, target.words);
    if (marked.length) {
      if ('highlights' in CSS)
        CSS.highlights.set(HIGHLIGHT, new Highlight(...marked));
      // Marked in a line cut short, they may stand past its end: its hint
      // says the line whole.
      const cut = holderOfWords(place, target.words, CUT_SHORT);
      if (!cut) return;
      await pause(450);
      if (mine === run) hover(cut);
      return;
    }
    // The words stand where no text shows them.
    await pause(450);
    if (mine !== run) return;
    const holder = holderOfWords(place, target.words);
    if (holder) {
      hover(holder);
      return;
    }
    const opener = openerOf(place);
    if (!opener) return;
    opener.click();
    // The words marked where the file's window says them.
    for (let wait = 0; wait < 10 && mine === run; wait++) {
      await pause(150);
      const dialog = document.querySelector('dialog[open]');
      const inWindow = dialog ? ranges(dialog, target.words) : [];
      if (inWindow.length) {
        if ('highlights' in CSS)
          CSS.highlights.set(HIGHLIGHT, new Highlight(...inWindow));
        return;
      }
    }
  }

  // Each address lands once: on the page loaded, then on each page the site
  // goes to — once it is in — or on a new hash of the same page. One reached
  // by going back or forth in the history is a traversal: its entry comes
  // with the state the router keeps in each, while a press of a plain link
  // to a hash comes to a new entry with none yet.
  const nuxtApp = useNuxtApp();
  let landed = '';
  let popping = false;
  let traversed: string | undefined;
  const popped = (event: PopStateEvent) => (popping = event.state !== null);
  function landOnce(first: boolean) {
    if (route.fullPath === landed) return;
    landed = route.fullPath;
    void land(route.hash, { first, traversal: traversed === route.fullPath });
  }

  /** A link to the place already in the address lands on it again. */
  function followedLink(event: MouseEvent) {
    if (!isPlainClick(event) || event.defaultPrevented) return;
    const link = (event.target as Element | null)?.closest?.('a[href]');
    if (!(link instanceof HTMLAnchorElement) || !link.hash) return;
    const { origin, pathname, search, hash } = window.location;
    if (
      link.origin === origin &&
      link.pathname === pathname &&
      link.search === search &&
      link.hash === hash
    )
      void land(link.hash);
  }

  let stopPageHook: (() => void) | undefined;
  // A run still on its way stops when the page is left: what it waited for
  // would be looked for, opened or clicked on the next one.
  const stopLeaving = router.beforeEach((to, from) => {
    if (to.path === from.path) return;
    run += 1;
    clear();
  });
  const stopAfter = router.afterEach((to) => {
    traversed = popping ? to.fullPath : undefined;
    popping = false;
  });
  onMounted(() => {
    landOnce(true);
    stopPageHook = nuxtApp.hook('page:finish', () => landOnce(false));
    window.addEventListener('click', followedLink, { capture: true });
    window.addEventListener('popstate', popped);
  });
  watch(
    () => route.hash,
    () => landOnce(false),
  );
  onBeforeUnmount(() => {
    run += 1;
    stopLeaving();
    stopAfter();
    stopPageHook?.();
    window.removeEventListener('click', followedLink, { capture: true });
    window.removeEventListener('popstate', popped);
    clear();
  });
}
