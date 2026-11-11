// What an archive uses of what Thei can show (FORMAT.md, "What an archive
// covers"): every construct of the texts, every access level, every kind of
// period, status, relation and file, files described and not, the banners
// of events and sections, tags with an icon and without, icons that are
// pictures and videos — counted, and held against a minimum. What the format
// cannot say at all is in `fields.ts`.
import { resolveDay } from './dates';
import type { TextScan } from './dialect';
import { excerptsWithPicture } from './facts';
import type { Archive } from './model';
import { archiveEntities, archiveExcerpts, refOf } from './texts';

/** Constructs of Lab Markdown a release must use, by the names `scanText` counts. */
export const TEXT_CONSTRUCTS = [
  'paragraph',
  'heading-2',
  'heading-3',
  'quote',
  'quote-caption',
  'quote-centered',
  'list-unordered',
  'list-ordered',
  'list-start',
  'list-checklist',
  'list-nested',
  'list-counter-lower-roman',
  'delimiter',
  'media',
  'media-layout-centered',
  'media-layout-natural',
  'media-layout-stretch',
  'gallery',
  'audio',
  'file',
  'files',
  'link-card',
  'card',
  'card-fragment',
  'card-note',
  'embed',
  'private',
  'spoiler',
  'bold',
  'italic',
  'strike',
  'line-break',
  'hint',
  'link-external',
  'link-external-note',
  'link-relative',
  'link-entity',
  'link-entity-fragment',
  'link-entity-heading',
  'link-entity-note',
] as const;

export const FILE_EXTENSIONS = [
  'jpg',
  'png',
  'gif',
  'webp',
  'avif',
  'svg',
  'mp4',
  'webm',
  'mov',
  'mp3',
  'ogg',
  'wav',
  'flac',
  'm4a',
  'pdf',
  'txt',
  'csv',
  'json',
  'zip',
] as const;

export interface UsageLine {
  name: string;
  count: number;
  min: number;
}

/**
 * What the archive uses. `min` is what a release must reach for constructs
 * (five); the conformance archive is held to one of each.
 */
export function archiveUsage(
  archive: Archive,
  scans: Map<string, TextScan>,
  options: { min: number; seedDay: string },
): UsageLine[] {
  const counts = new Map<string, number>();
  const add = (name: string, amount = 1) =>
    counts.set(name, (counts.get(name) ?? 0) + amount);
  for (const scan of scans.values())
    for (const [name, amount] of scan.constructs) add(`text: ${name}`, amount);

  // Access of every kind that has one.
  for (const entity of archiveEntities(archive))
    if (
      entity.kind !== 'tag' &&
      entity.kind !== 'section' &&
      entity.kind !== 'excerpt'
    )
      add(`access: ${entity.kind} ${entity.item.access}`);
  for (const project of archive.projects)
    for (const section of project.sections) {
      add(section.private ? 'section: private' : 'section: public');
      add(section.periods.length ? 'section: dated' : 'section: general');
    }
  // Excerpts: of each kind of parent, private and public, of a private
  // parent, with a summary, about each kind of target.
  const access = new Map(
    archiveEntities(archive).map((entity) => [
      entity.ref,
      'access' in entity.item ? entity.item.access : 'public',
    ]),
  );
  const excerpts = archiveExcerpts(archive);
  const named = {
    project: 'a project',
    event: 'an event',
    diary: 'a diary entry',
  };
  for (const excerpt of excerpts) {
    add(`excerpt: of ${named[excerpt.parent.kind]}`);
    add(excerpt.private ? 'excerpt: private' : 'excerpt: public');
    if (access.get(`${excerpt.parent.kind}:${excerpt.parent.id}`) === 'private')
      add('excerpt: of a private parent');
    if (excerpt.summary.trim()) add('excerpt: with a summary');
    if (excerpt.banner) add('banner: an excerpt');
    add(
      `excerpt: about ${named[excerpt.about.to.split(':')[0] as keyof typeof named]}`,
    );
    // Hidden from strangers by what it is about, whatever its own switch says.
    const subjectAccess = access.get(excerpt.about.to);
    if (subjectAccess === 'private') add('excerpt: about a private subject');
    if (subjectAccess === 'link-only')
      add('excerpt: about a link-only subject');
  }
  for (const entry of archive.diary)
    if (!entry.body.trim() && entry.excerpts.length)
      add('excerpt: the whole of a diary entry');
  // An event or a diary entry with no picture of its own, shown by the
  // first picture of its excerpts.
  for (const ref of excerptsWithPicture(archive, scans))
    add(
      ref.startsWith('event:')
        ? 'picture: an event by its excerpts'
        : 'picture: a diary entry by its excerpts',
    );

  // Tags: a tag may carry an icon, and most do not.
  for (const tag of archive.tags)
    add(tag.icon ? 'tag: with an icon' : 'tag: without an icon');
  // Icons of tags, pages and projects: a picture or a video.
  const kindOf = new Map(archive.files.map((file) => [file.id, file.kind]));
  for (const icon of [
    ...archive.tags.map((tag) => tag.icon),
    ...archive.pages.map((page) => page.icon),
    ...archive.projects.map((project) => project.icon),
  ])
    if (icon)
      add(kindOf.get(icon) === 'video' ? 'icon: a video' : 'icon: a picture');

  // Periods.
  const allPeriods = [
    ...archive.events.flatMap((event) => event.periods),
    ...archive.projects.flatMap((project) =>
      project.sections.flatMap((section) => section.periods),
    ),
  ];
  for (const period of allPeriods) {
    add(`period: precision ${period.precision}`);
    add(period.label ? 'period: labelled' : 'period: unlabelled');
    if (period.doubt) add('period: with a doubt');
    if (resolveDay(period.end, options.seedDay) > options.seedDay)
      add('period: still running');
    if (period.start === period.end) add('period: one day');
  }

  // Statuses.
  for (const status of [
    ...(archive.person?.statuses ?? []),
    ...archive.projects.flatMap((project) => project.statuses),
  ]) {
    add(
      status.empty
        ? 'status: empty'
        : status.file
          ? 'status: with a picture'
          : 'status: words only',
    );
  }

  // Relations, an excerpt's among them.
  for (const _excerpt of excerpts) add('relation: from an excerpt');
  for (const relation of [
    ...archive.projects.flatMap((project) => project.relations),
    ...archive.events.flatMap((event) => event.relations),
    ...archive.diary.flatMap((entry) => entry.relations),
    ...excerpts.map((excerpt) => excerpt.about),
  ]) {
    add(`relation: ${relation.kind}`);
    add(
      relation.notes
        ? 'relation: a note per side'
        : relation.note
          ? 'relation: a shared note'
          : 'relation: no note',
    );
  }

  // Files: extensions, a description or none, and files standing in more
  // than one place.
  for (const file of archive.files) {
    add(`file: .${file.ext}`);
    add(
      file.description.trim()
        ? 'file: with a description'
        : 'file: without a description',
    );
  }
  const places = new Map<string, number>();
  const place = (id: string | undefined) =>
    id && places.set(id, (places.get(id) ?? 0) + 1);
  for (const scan of scans.values())
    for (const item of scan.files) place(item.id);
  for (const project of archive.projects) {
    [
      project.icon,
      project.banner,
      ...project.files.map((f) => f.file),
      ...project.showcase.map((f) => f.file),
    ].forEach(place);
    for (const section of project.sections) place(section.banner);
  }
  for (const event of archive.events)
    [event.banner, ...event.files.map((f) => f.file)].forEach(place);
  for (const excerpt of excerpts) place(excerpt.banner);
  // Banners: an event's or a section's stands for it on every card too.
  for (const event of archive.events) if (event.banner) add('banner: an event');
  for (const project of archive.projects)
    for (const section of project.sections)
      if (section.banner) add('banner: a section');
  for (const tag of archive.tags) place(tag.icon);
  add(
    'file: in more than one place',
    [...places.values()].filter((n) => n > 1).length,
  );

  // Words hidden until a reader acts.
  let thirdSlides = 0;
  let secondFiles = 0;
  for (const scan of scans.values()) {
    const gallery = scan.files.filter((item) => item.as === 'gallery').length;
    const group = scan.files.filter((item) => item.as === 'files').length;
    if (gallery >= 3) thirdSlides++;
    if (group >= 2) secondFiles++;
  }
  add('hidden: a third slide of a gallery', thirdSlides);
  add('hidden: a second file of a group', secondFiles);

  const lines: UsageLine[] = [];
  const need = (name: string, min: number) =>
    lines.push({ name, count: counts.get(name) ?? 0, min });
  for (const construct of TEXT_CONSTRUCTS)
    need(`text: ${construct}`, options.min);
  for (const kind of ['project', 'event', 'diary', 'page'])
    for (const access of ['public', 'link-only', 'private'])
      need(`access: ${kind} ${access}`, 1);
  for (const name of ['section: private', 'section: dated', 'section: general'])
    need(name, 1);
  for (const name of [
    'tag: with an icon',
    'tag: without an icon',
    'icon: a picture',
    'icon: a video',
  ])
    need(name, 1);
  for (const precision of ['exact', 'day', 'month', 'year'])
    need(`period: precision ${precision}`, 1);
  for (const name of [
    'period: labelled',
    'period: unlabelled',
    'period: with a doubt',
    'period: still running',
    'period: one day',
  ])
    need(name, 1);
  for (const name of [
    'status: empty',
    'status: with a picture',
    'status: words only',
  ])
    need(name, 1);
  for (const kind of ['related', 'depends-on', 'affects'])
    need(`relation: ${kind}`, 1);
  for (const name of [
    'relation: a note per side',
    'relation: a shared note',
    'relation: from an excerpt',
  ])
    need(name, 1);
  for (const name of [
    'excerpt: of a project',
    'excerpt: of an event',
    'excerpt: of a diary entry',
    'excerpt: private',
    'excerpt: public',
    'excerpt: of a private parent',
    'excerpt: with a summary',
    'excerpt: about a project',
    'excerpt: about an event',
    'excerpt: about a diary entry',
    'excerpt: about a private subject',
    'excerpt: the whole of a diary entry',
  ])
    need(name, 1);
  for (const ext of FILE_EXTENSIONS) need(`file: .${ext}`, 1);
  need('file: in more than one place', 1);
  need('file: with a description', 1);
  need('file: without a description', 1);
  need('banner: an event', 1);
  need('banner: a section', 1);
  need('banner: an excerpt', 1);
  // An event shown so is only counted, for the record: the archive has
  // none yet.
  need('picture: a diary entry by its excerpts', 1);
  need('hidden: a third slide of a gallery', 1);
  need('hidden: a second file of a group', 1);
  // Whatever else the archive uses, for the record.
  for (const [name, count] of counts)
    if (!lines.some((line) => line.name === name))
      lines.push({ name, count, min: 0 });
  return lines;
}
