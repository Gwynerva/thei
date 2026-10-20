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
  kind: SiteEntity['kind'],
  score: (entity: SiteEntity) => number,
  test: (entity: SiteEntity) => boolean = () => true,
) {
  const candidates = Object.values(index.entities).filter(
    (entity) => entity.kind === kind && test(entity),
  );
  if (!candidates.length)
    throw new Error(`The archive has no ${kind} for this screen.`);
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
    (e) => n(e, 'sections') * 3 + n(e, 'words') / 100,
    (e) => e.access === 'public',
  );
const event = (index: SiteIndex) =>
  richest(
    index,
    'event',
    (e) => n(e, 'pictures') + n(e, 'files') + (e.facts.hasBanner ? 5 : 0),
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
    (e) => n(e, 'pictures') * 2 + n(e, 'words') / 100 + n(e, 'relations'),
    // A day still to come waits: a stranger cannot open it yet.
    (e) => e.access === 'public' && !e.facts.future,
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
