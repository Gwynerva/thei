/**
 * Where a find of the search leads on its page, as the hash of its address:
 * the block of a text, a file in it or of the page, a related entity, a link,
 * a status, a part of the page. The server writes it (`placeHref`), the page
 * reads it and brings the place out of whatever hides it — a spoiler, a
 * gallery's other slide, a list cut short, a tab, a closed history, the
 * sheet of a phone (`app/composables/search-landing.ts`).
 *
 * - `b-<block>`, `b-<block>~<file>`: a block of a text, a file shown in it;
 * - `f-<file>`: a file of the page outside its text, its showcase or files;
 * - `r-<kind>~<address>`: a related entity, on the relations block;
 * - `l-<address>`: a link of the page;
 * - `statuses~<day>`: a status, in the history of statuses;
 * - `<part>`: a part of the page, one of `LANDING_ZONES`.
 *
 * The words found follow as a text fragment, `:~:text=…`, which a browser
 * opening the address afresh marks itself, where it can. With no place
 * before them, the page is looked through for the words: a block a text
 * keeps no id for is found by them all the same.
 */
export const LANDING_ZONES = [
  'icon',
  'banner',
  'showcase',
  'files',
  'links',
  'tags',
  'periods',
  'facts',
  'statuses',
  'owner-notes',
] as const;
export type LandingZone = (typeof LANDING_ZONES)[number];

export interface LandingPlace {
  block?: string;
  /** A file, by the id the page names it by: its public one. */
  file?: string;
  relation?: { kind: string; href: string };
  link?: string;
  /** A status, by its day. */
  status?: string;
  zone?: LandingZone;
}

export interface LandingTarget extends LandingPlace {
  /** The words found, to mark where they stand. */
  words: string[];
}

const DIRECTIVE = ':~:';

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** The hash of a place, without its `#`; empty for the page as a whole. */
export function landingHash(place: LandingPlace): string {
  const encode = encodeURIComponent;
  if (place.block)
    return place.file
      ? `b-${place.block}~${encode(place.file)}`
      : `b-${place.block}`;
  if (place.file) return `f-${encode(place.file)}`;
  if (place.relation)
    return `r-${place.relation.kind}~${encode(place.relation.href)}`;
  if (place.link) return `l-${encode(place.link)}`;
  if (place.status) return `statuses~${place.status}`;
  return place.zone ?? '';
}

/** The words of a text fragment, as a page marks them. */
function fragmentWords(directive: string | undefined): string[] {
  const text = /(?:^|&)text=([^&]*)/u.exec(directive ?? '')?.[1];
  if (!text) return [];
  return decode(text)
    .split(/\s+/u)
    .filter((word) => word.length > 1);
}

/** The place a hash names, and the words found there; none for any other. */
export function parseLandingHash(hash: string): LandingTarget | undefined {
  const raw = hash.replace(/^#/u, '');
  const cut = raw.indexOf(DIRECTIVE);
  const place = cut === -1 ? raw : raw.slice(0, cut);
  const words = fragmentWords(
    cut === -1 ? undefined : raw.slice(cut + DIRECTIVE.length),
  );
  let match: RegExpExecArray | null;
  if ((match = /^b-([\w-]+)(?:~(.+))?$/u.exec(place)))
    return {
      block: match[1]!,
      ...(match[2] ? { file: decode(match[2]) } : {}),
      words,
    };
  if ((match = /^f-(.+)$/u.exec(place)))
    return { file: decode(match[1]!), words };
  if ((match = /^r-([\w-]+)~(.+)$/u.exec(place)))
    return { relation: { kind: match[1]!, href: decode(match[2]!) }, words };
  if ((match = /^l-(.+)$/u.exec(place)))
    return { link: decode(match[1]!), words };
  if ((match = /^statuses~(\d{4}-\d{2}-\d{2})$/u.exec(place)))
    return { zone: 'statuses', status: match[1]!, words };
  if ((LANDING_ZONES as readonly string[]).includes(place))
    return { zone: place as LandingZone, words };
  // The page itself: the words are looked for in it.
  return !place && words.length ? { words } : undefined;
}
