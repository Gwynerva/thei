// Every screen of Thei worth looking at, and how to reach it on a seeded
// site: chosen by what an entity is (a project with the most sections, an
// event with a banner), never by an id. A screen that is not an address of
// its own — a modal, a popup — is reached by the steps a person takes from
// one. The sweep study plays each of them, and `lab warm` opens each address
// once so a dev server has compiled them.
import type {
  Role,
  SiteEntity,
  SiteIndex,
  StepAction,
  StepOptions,
} from './types';

/**
 * A step from the address to the screen, found the way a person finds it:
 * by role and name, by visible words or by label, never by `data-*` or a
 * class (`README.md`, "Studies").
 */
export interface ScreenStep {
  label: string;
  action: StepAction;
  options?: StepOptions;
}

export interface Screen {
  id: string;
  title: string;
  role: Role;
  /** The base-relative address of the screen on this site, or why there is none. */
  path(index: SiteIndex): string;
  /** What a person does after opening the address to reach the screen. */
  steps?(index: SiteIndex): ScreenStep[];
  /** Recent searches the browser holds before the screen opens. */
  searchHistory?(index: SiteIndex): string[];
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The first words of a title, as a name starts with them: up to the first
 * mark the site may set otherwise (a quote, a dash), which a typed title
 * and a shown one need not share.
 */
function startOf(title: string) {
  const words = /^[\p{L}\p{N} ]+/u.exec(title)?.[0]?.trim() || title;
  return new RegExp(`^${escapeRegExp(words)}`);
}

function richest(
  index: SiteIndex,
  kind: SiteEntity['kind'] | readonly SiteEntity['kind'][],
  score: (entity: SiteEntity) => number,
  test: (entity: SiteEntity) => boolean = () => true,
) {
  const kinds: readonly SiteEntity['kind'][] =
    typeof kind === 'string' ? [kind] : kind;
  const candidates = Object.values(index.entities).filter(
    (entity) => kinds.includes(entity.kind) && test(entity),
  );
  if (!candidates.length)
    throw new Error(
      `The archive has no ${kinds.join(' or ')} for this screen.`,
    );
  return candidates.sort(
    (a, b) => score(b) - score(a) || a.ref.localeCompare(b.ref),
  )[0]!;
}

const n = (entity: SiteEntity, fact: string) => Number(entity.facts[fact] ?? 0);
const open = (entity: SiteEntity) => entity.access !== 'private';

const project = (index: SiteIndex) =>
  richest(
    index,
    'project',
    (e) =>
      n(e, 'sections') * 3 +
      n(e, 'excerpts') * 2 +
      n(e, 'excerptsAbout') +
      n(e, 'words') / 100,
    (e) => e.access === 'public',
  );
const event = (index: SiteIndex) =>
  richest(
    index,
    'event',
    (e) =>
      n(e, 'pictures') +
      n(e, 'files') +
      n(e, 'excerpts') * 2 +
      (e.facts.hasBanner ? 5 : 0),
    (e) => e.access === 'public',
  );
const section = (index: SiteIndex) =>
  richest(
    index,
    'section',
    (e) => n(e, 'words') / 50 + (e.facts.hasBanner ? 5 : 0) + n(e, 'periods'),
    (e) => open(e) && Boolean(e.facts.dated),
  );
const diary = (index: SiteIndex) =>
  richest(
    index,
    'diary',
    (e) =>
      n(e, 'pictures') * 2 +
      n(e, 'words') / 100 +
      n(e, 'relations') +
      n(e, 'excerpts') * 2,
    // A day still to come waits: a stranger cannot open it yet.
    (e) => e.access === 'public' && !e.facts.future,
  );
/** An excerpt a stranger may read: of an open parent, not private. */
const excerpt = (index: SiteIndex) =>
  richest(
    index,
    'excerpt',
    (e) => n(e, 'words') / 50 + (e.facts.hasBanner ? 5 : 0) + n(e, 'about') * 2,
    (e) => e.access === 'public',
  );
/** An excerpt its parent's form opens on: not private, so its row is named by its title alone. */
const ownExcerpt = (index: SiteIndex) =>
  richest(
    index,
    'excerpt',
    (e) => n(e, 'words') / 50 + n(e, 'about') * 2,
    (e) => !e.facts.private,
  );
/**
 * What the most excerpts are about: its form lists them on a tab of its
 * relations, and deleting it asks what becomes of them.
 */
const subjectOfExcerpts = (index: SiteIndex) =>
  richest(
    index,
    ['project', 'event', 'diary'],
    (e) => n(e, 'excerptsAbout'),
    (e) => n(e, 'excerptsAbout') > 0,
  );
/** A general section, open in the tab a project's form shows first. */
const generalSection = (index: SiteIndex) =>
  richest(
    index,
    'section',
    (e) => n(e, 'words') / 50 + n(e, 'pictures'),
    (e) => !e.facts.dated && !e.facts.private,
  );
/** The library's videos are listed by a filter of its own: one must be there. */
const requireVideo = (index: SiteIndex) => {
  const found = Object.values(index.files).some(
    (file) => file.kind === 'video',
  );
  if (!found) throw new Error('The archive has no video for this screen.');
};
const page = (index: SiteIndex) =>
  richest(
    index,
    'page',
    (e) => n(e, 'words'),
    (e) => e.access === 'public',
  );
const tag = (index: SiteIndex) =>
  richest(
    index,
    'tag',
    (e) => n(e, 'usedBy'),
    (e) => n(e, 'usedBy') > 0,
  );

export const SCREENS: Screen[] = [
  // What a visitor sees.
  { id: 'home', title: 'Home page', role: 'visitor', path: () => '/' },
  { id: 'life', title: 'Life', role: 'visitor', path: () => '/life/' },
  { id: 'tags', title: 'Tags', role: 'visitor', path: () => '/tags/' },
  {
    id: 'tag',
    title: 'A tag',
    role: 'visitor',
    path: (index) => tag(index).publicUrl!,
  },
  { id: 'pages', title: 'Pages', role: 'visitor', path: () => '/pages/' },
  {
    id: 'page',
    title: 'A page',
    role: 'visitor',
    path: (index) => page(index).publicUrl!,
  },
  {
    id: 'project',
    title: 'A project',
    role: 'visitor',
    path: (index) => project(index).publicUrl!,
  },
  {
    id: 'project-timeline',
    title: "A project's timeline",
    role: 'visitor',
    path: (index) => `${project(index).publicUrl!}timeline/`,
  },
  {
    id: 'section',
    title: 'A dated section',
    role: 'visitor',
    path: (index) => section(index).publicUrl!,
  },
  {
    id: 'excerpt',
    title: 'An excerpt',
    role: 'visitor',
    path: (index) => excerpt(index).publicUrl!,
  },
  {
    id: 'event',
    title: 'An event',
    role: 'visitor',
    path: (index) => event(index).publicUrl!,
  },
  {
    id: 'diary-entry',
    title: 'A diary entry',
    role: 'visitor',
    path: (index) => diary(index).publicUrl!,
  },
  {
    // A visitor's window of a file — here an avatar of the history, which
    // the archive has several of — the window an address naming a file
    // open (`#…~open`) opens too. The address itself names the file by an
    // id the site made, which the index does not keep.
    id: 'file-window',
    title: "A file's window",
    role: 'visitor',
    path: () => '/',
    steps: () => [
      {
        label: 'Open the history of avatars',
        action: { click: { role: 'button', name: /^1 of \d+$/ } },
        options: { answer: { role: 'button', name: 'Avatar', exact: true } },
      },
      {
        label: 'Open an avatar',
        action: { click: { role: 'button', name: 'Avatar', exact: true } },
        options: { answer: { role: 'dialog' }, timeoutMs: 15_000 },
      },
    ],
  },
  {
    id: 'search',
    title: 'Search results',
    role: 'visitor',
    path: (index) =>
      `/search/?q=${encodeURIComponent((project(index).title ?? '').split(/\s+/)[0] ?? '')}`,
  },
  {
    id: 'quick-search',
    title: 'Quick search with recent searches',
    role: 'visitor',
    path: () => '/',
    searchHistory: (index) =>
      [project(index), event(index), tag(index)].map((entity) =>
        (entity.title ?? '').split(/\s+/).slice(0, 2).join(' '),
      ),
    steps: () => [
      {
        label: 'Open search',
        action: { click: { role: 'link', name: 'Search' } },
        options: { answer: { role: 'group', name: /searched for/i } },
      },
    ],
  },
  {
    id: 'rewind',
    title: 'This day in other years',
    role: 'visitor',
    path: () => '/rewind/',
  },
  // What the owner sees.
  { id: 'dashboard', title: 'Dashboard', role: 'owner', path: () => '/admin/' },
  {
    id: 'admin-projects',
    title: 'Projects',
    role: 'owner',
    path: () => '/admin/projects/',
  },
  {
    id: 'admin-project',
    title: 'A project form',
    role: 'owner',
    path: (index) => project(index).adminUrl,
  },
  {
    id: 'admin-section',
    title: "A project's section",
    role: 'owner',
    path: (index) => generalSection(index).adminUrl,
    steps: (index) => [
      {
        label: 'Open the section',
        action: {
          click: {
            role: 'button',
            name: startOf(generalSection(index).title ?? ''),
          },
        },
        options: { answer: { role: 'dialog' }, timeoutMs: 15_000 },
      },
    ],
  },
  {
    id: 'admin-excerpt',
    title: "An excerpt in its parent's form",
    role: 'owner',
    path: (index) =>
      index.entities[ownExcerpt(index).parent!]?.adminUrl ??
      ownExcerpt(index).adminUrl,
    steps: (index) => [
      {
        label: 'Open the excerpt',
        action: {
          click: {
            role: 'button',
            name: startOf(ownExcerpt(index).title ?? ''),
          },
        },
        options: { answer: { role: 'dialog' }, timeoutMs: 15_000 },
      },
    ],
  },
  {
    id: 'admin-excerpts-about',
    title: 'The excerpts about an entity, in its form',
    role: 'owner',
    path: (index) => subjectOfExcerpts(index).adminUrl,
    steps: () => [
      {
        label: 'Look at the excerpts about it',
        action: { click: { role: 'tab', name: /^Excerpts\b/ } },
        options: {
          answer: { role: 'button', name: /^Edit excerpt: / },
          timeoutMs: 15_000,
        },
      },
    ],
  },
  {
    // Only looked at: the pane's own Delete is never pressed.
    id: 'admin-excerpts-on-delete',
    title: 'Deleting what excerpts are about',
    role: 'owner',
    path: (index) => subjectOfExcerpts(index).adminUrl,
    steps: () => [
      {
        label: 'Ask to delete it',
        action: { click: { role: 'button', name: 'Delete', exact: true } },
        options: {
          answer: { role: 'button', name: 'Keep the excerpts about it' },
          timeoutMs: 15_000,
        },
      },
    ],
  },
  {
    id: 'admin-events',
    title: 'Events',
    role: 'owner',
    path: () => '/admin/events/',
  },
  {
    id: 'admin-event',
    title: 'An event form',
    role: 'owner',
    path: (index) => event(index).adminUrl,
  },
  {
    id: 'admin-diary',
    title: 'Diary',
    role: 'owner',
    path: () => '/admin/diary/',
  },
  {
    id: 'admin-diary-entry',
    title: 'A diary form',
    role: 'owner',
    path: (index) => diary(index).adminUrl,
  },
  {
    id: 'admin-diary-text',
    title: "A diary entry's text",
    role: 'owner',
    path: (index) => diary(index).adminUrl,
    steps: () => [
      {
        label: 'Open the text of the entry',
        action: { click: { role: 'button', name: /Entry content/ } },
        options: { answer: { role: 'dialog' }, timeoutMs: 20_000 },
      },
    ],
  },
  {
    id: 'admin-pages',
    title: 'Pages',
    role: 'owner',
    path: () => '/admin/pages/',
  },
  {
    id: 'admin-page',
    title: 'A page form',
    role: 'owner',
    path: (index) => page(index).adminUrl,
  },
  {
    id: 'admin-tags',
    title: 'Tags',
    role: 'owner',
    path: () => '/admin/tags/',
  },
  {
    id: 'admin-tag',
    title: 'A tag form',
    role: 'owner',
    path: (index) => tag(index).adminUrl,
  },
  {
    id: 'admin-about',
    title: 'About me',
    role: 'owner',
    path: () => '/admin/about/',
  },
  {
    id: 'admin-assets',
    title: 'File library',
    role: 'owner',
    path: () => '/admin/assets/',
  },
  {
    // The picker that reuses stored files, opened from an event's form, so
    // what is here — the event and what it is related to — stands first.
    id: 'admin-file-picker',
    title: 'Picking a stored file again',
    role: 'owner',
    path: (index) => event(index).adminUrl,
    steps: () => [
      {
        label: 'Add a file to the event',
        action: { click: { role: 'button', name: 'Add File' } },
        options: { answer: { role: 'button', name: 'Reuse' } },
      },
      {
        label: 'Reuse a stored file',
        action: { click: { role: 'button', name: 'Reuse' } },
        options: {
          answer: { role: 'searchbox', name: 'Search files' },
          timeoutMs: 15_000,
        },
      },
      {
        label: 'Search the diary of a year',
        action: {
          fill: { role: 'searchbox', name: 'Search files' },
          text: 'diary 2019',
        },
        options: { answer: { text: 'Diary entries' }, timeoutMs: 15_000 },
      },
    ],
  },
  {
    id: 'admin-video',
    title: "A video's window",
    role: 'owner',
    path: (index) => {
      requireVideo(index);
      return '/admin/assets/?type=video';
    },
    steps: () => [
      {
        label: 'Open a video',
        action: { click: { role: 'button', name: /^Video · / } },
        options: { answer: { role: 'dialog' }, timeoutMs: 15_000 },
      },
      {
        label: 'Look at its preview frame',
        action: { look: { role: 'group', name: 'Preview' } },
        options: { optional: true },
      },
      {
        label: 'Look at its description',
        action: { look: { label: 'File description' } },
        options: { optional: true },
      },
    ],
  },
  {
    id: 'admin-settings',
    title: 'Settings',
    role: 'owner',
    path: () => '/admin/settings/',
  },
  { id: 'admin-ai', title: 'AI', role: 'owner', path: () => '/admin/ai/' },
  {
    id: 'admin-updates',
    title: 'Updates',
    role: 'owner',
    path: () => '/admin/updates/',
  },
];
