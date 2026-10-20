// Every screen of Thei worth looking at, and how to reach it on a seeded
// site: chosen by what an entity is (a project with the most sections, an
// event with a banner), never by an id. The sweep study plays each of them,
// and `lab warm` opens each once so a dev server has compiled them.
import type { Role, SiteEntity, SiteIndex } from './types';

export interface Screen {
  id: string;
  title: string;
  role: Role;
  /** The base-relative address of the screen on this site, or why there is none. */
  path(index: SiteIndex): string;
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
    (e) => e.access === 'public',
  );
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
