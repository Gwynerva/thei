import {
  parseLandingHash,
  type LandingTarget,
} from '#layers/thei/shared/search/landing';

/**
 * Landing where a find of the search led (`shared/search/landing.ts`): the
 * place is brought out of whatever hides it, into the middle of the window,
 * lit up for a moment, and the words found are marked in it.
 *
 * What hides a place takes part in two ways:
 *
 * - A part of the page that keeps the place out of it — the rest of a list
 *   cut short, the history of statuses, another tab or page of relations —
 *   brings it in when asked: `useLandingReveal`.
 * - A part that holds the place hidden — a spoiler, a gallery on another
 *   slide — hears the `theilanding` event the landing sends from the place,
 *   with the target, and shows it. A closed `<details>` is opened here.
 *
 * On a phone, what the sidebar holds is in its sheet, which opens for it.
 * Words that stand in no visible text — a hint, a link's note, a file's
 * description or caption — bring up the hint, the card of the link or the
 * file's window, where they are read.
 */
export const LANDING_EVENT = 'theilanding';

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

const HIGHLIGHT = 'search-found';
const LIT_MS = 2400;
const frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function attribute(name: string, value: string) {
  return `[${name}="${CSS.escape(value)}"]`;
}

/** Where on the page a target stands, by what each part marks itself with. */
function selectorOf(target: LandingTarget): string | undefined {
  if (target.block) return attribute('data-block', target.block);
  if (target.file) return attribute('data-file', target.file);
  if (target.relation)
    return attribute('data-relation-href', target.relation.href);
  if (target.link) return attribute('data-link', target.link);
  if (target.status) return attribute('data-status-date', target.status);
  if (target.zone) return attribute('data-landing-zone', target.zone);
  return undefined;
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

/** What holds the words where no text shows them: a hint, a link's note. */
const WORDS_IN = [
  ['abbr[data-content-hint]', 'data-content-hint'],
  ['a[data-content-note]', 'data-content-note'],
  ['[data-link-note]', 'data-link-note'],
] as const;

function holderOfWords(element: Element, words: string[]) {
  const wanted = words.map((word) => word.toLocaleLowerCase());
  for (const [selector, name] of WORDS_IN) {
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

/** A pointer coming to rest on it: what shows its hint or its card. */
function hover(element: Element) {
  element.dispatchEvent(
    new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }),
  );
}

export function useSearchLanding() {
  const route = useRoute();
  let unlight: ReturnType<typeof setTimeout> | undefined;
  let found: Element | undefined;
  let run = 0;

  function clear() {
    clearTimeout(unlight);
    found?.removeAttribute('data-search-landing');
    found?.removeAttribute('data-search-found');
    found = undefined;
    if (typeof CSS !== 'undefined' && 'highlights' in CSS)
      CSS.highlights.delete(HIGHLIGHT);
  }

  async function land(hash: string, first: boolean) {
    clear();
    const mine = ++run;
    const target = parseLandingHash(hash);
    if (!target) return;
    await frame();

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

    // Opened afresh, the browser has scrolled to the words when it found
    // them; only where it did not is the place brought into view.
    if (!first || window.scrollY === 0)
      place.scrollIntoView({
        block: 'center',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      });
    found = place;
    place.setAttribute('data-search-found', '');
    place.setAttribute('data-search-landing', '');
    unlight = setTimeout(
      () => place.removeAttribute('data-search-landing'),
      LIT_MS,
    );

    if (!target.words.length) return;
    const marked = ranges(place, target.words);
    if (marked.length) {
      if ('highlights' in CSS)
        CSS.highlights.set(HIGHLIGHT, new Highlight(...marked));
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
    const opener = place.matches('[data-opens-viewer]')
      ? place
      : place.querySelector<HTMLElement>('[data-opens-viewer]');
    if (!opener) return;
    (opener as HTMLElement).click();
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
  // goes to — once it is in — or on a new hash of the same page.
  const nuxtApp = useNuxtApp();
  let landed = '';
  function landOnce(first: boolean) {
    if (route.fullPath === landed) return;
    landed = route.fullPath;
    void land(route.hash, first);
  }
  let stopPageHook: (() => void) | undefined;
  onMounted(() => {
    landOnce(true);
    stopPageHook = nuxtApp.hook('page:finish', () => landOnce(false));
  });
  watch(
    () => route.hash,
    () => landOnce(false),
  );
  onBeforeUnmount(() => {
    stopPageHook?.();
    clear();
  });
}
