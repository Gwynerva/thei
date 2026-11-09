/**
 * Where a link leads on its page, as the hash of its address: the block of a
 * text, a file in it or among the page's own, a related entity, a link, a
 * status, an avatar, a part of the page, a heading. The search writes it for
 * its finds (`placeHref`), the file's window for the file it shows, the feed
 * of a life for a status or an avatar; the page reads it and brings the place
 * out of whatever hides it — a spoiler, a gallery's other slide, a list cut
 * short, a tab, a closed history, the sheet of a phone
 * (`app/composables/landing.ts`).
 *
 * - `b-<block>`, `b-<block>~<file>`: a block of a text, a file shown in it;
 * - `<zone>~<item>`: an item of a part of the page — a file of its showcase
 *   or of its files, a status by its day, an avatar of the history;
 * - `r-<kind>~<address>`: a related entity, on the relations block;
 * - `l-<address>`: a link of the page;
 * - `<zone>`: a part of the page, one of `LANDING_ZONES`;
 * - `~open` after a place of a file or an avatar: its window open on it;
 * - anything else: an anchor, the id of an element of the page — a heading,
 *   the block of related entities.
 *
 * The words found follow as a text fragment, `:~:text=…`, which a browser
 * opening the address afresh marks itself, where it can. With no place
 * before them, the page is looked through for the words: a block a text
 * keeps no id for is found by them all the same.
 */
const LANDING_ZONES = [
  'icon',
  'banner',
  'showcase',
  'files',
  'links',
  'tags',
  'periods',
  'facts',
  'statuses',
  'avatars',
  'owner-notes',
] as const;
export type LandingZone = (typeof LANDING_ZONES)[number];

/** The parts of a page whose files a hash names one by one. */
const FILE_ZONES = ['showcase', 'files'] as const;
type FileZone = (typeof FILE_ZONES)[number];

function isFileZone(zone: LandingZone | undefined): zone is FileZone {
  return (FILE_ZONES as readonly (string | undefined)[]).includes(zone);
}

export interface LandingPlace {
  block?: string;
  /**
   * A file, by the id the page names it by: its public one. Named with its
   * block, or with the part of the page it stands in, `showcase` or `files`.
   */
  file?: string;
  relation?: { kind: string; href: string };
  link?: string;
  /** A status, by its day. */
  status?: string;
  /** An avatar of the history, by its id. */
  avatar?: string;
  zone?: LandingZone;
  /** The window of its file, or of its avatar, open on it. */
  open?: boolean;
  /** An element of the page by its own id: a heading, a block of the page. */
  anchor?: string;
}

export interface LandingTarget extends LandingPlace {
  /** The words found, to mark where they stand. */
  words: string[];
}

const DIRECTIVE = ':~:';
const OPEN = '~open';

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
  const opened = (hash: string) => (place.open ? `${hash}${OPEN}` : hash);
  if (place.block)
    return place.file
      ? opened(`b-${place.block}~${encode(place.file)}`)
      : `b-${place.block}`;
  if (place.file && isFileZone(place.zone))
    return opened(`${place.zone}~${encode(place.file)}`);
  if (place.relation)
    return `r-${place.relation.kind}~${encode(place.relation.href)}`;
  if (place.link) return `l-${encode(place.link)}`;
  if (place.status) return `statuses~${place.status}`;
  if (place.avatar) return opened(`avatars~${encode(place.avatar)}`);
  if (place.anchor) return encode(place.anchor);
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

/** The place a hash names, and the words found there; none for an empty one. */
export function parseLandingHash(hash: string): LandingTarget | undefined {
  const raw = hash.replace(/^#/u, '');
  const cut = raw.indexOf(DIRECTIVE);
  const place = cut === -1 ? raw : raw.slice(0, cut);
  const words = fragmentWords(
    cut === -1 ? undefined : raw.slice(cut + DIRECTIVE.length),
  );
  const open = (mark: string | undefined) => (mark ? { open: true } : {});
  let match: RegExpExecArray | null;
  if ((match = /^b-([\w-]+)(?:~(.+?))?(~open)?$/u.exec(place)))
    return {
      block: match[1]!,
      ...(match[2] ? { file: decode(match[2]), ...open(match[3]) } : {}),
      words,
    };
  if ((match = /^(showcase|files)~(.+?)(~open)?$/u.exec(place)))
    return {
      zone: match[1] as FileZone,
      file: decode(match[2]!),
      ...open(match[3]),
      words,
    };
  if ((match = /^r-([\w-]+)~(.+)$/u.exec(place)))
    return { relation: { kind: match[1]!, href: decode(match[2]!) }, words };
  if ((match = /^l-(.+)$/u.exec(place)))
    return { link: decode(match[1]!), words };
  if ((match = /^statuses~(\d{4}-\d{2}-\d{2})$/u.exec(place)))
    return { zone: 'statuses', status: match[1]!, words };
  if ((match = /^avatars~(.+?)(~open)?$/u.exec(place)))
    return {
      zone: 'avatars',
      avatar: decode(match[1]!),
      ...open(match[2]),
      words,
    };
  if ((LANDING_ZONES as readonly string[]).includes(place))
    return { zone: place as LandingZone, words };
  if (place) return { anchor: decode(place), words };
  // The page itself: the words are looked for in it.
  return words.length ? { words } : undefined;
}

/**
 * Whether a hash names a place by what the page marks it with rather than by
 * an element's id: the router finds no element by it, and leaves it to the
 * landing (`app/router.options.ts`).
 */
export function isLandingPlaceHash(hash: string): boolean {
  const target = parseLandingHash(hash);
  return Boolean(target && !target.anchor);
}
