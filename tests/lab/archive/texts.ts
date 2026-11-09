// Every entity of an archive by its ref, and every text it holds: what the
// checks, the seeder and the index walk over.
import type {
  Archive,
  ArchiveDiaryEntry,
  ArchiveEvent,
  ArchiveExcerpt,
  ArchivePage,
  ArchiveProject,
  ArchiveSection,
  ArchiveTag,
} from './model';

export type ArchiveEntity =
  | { kind: 'project'; ref: string; item: ArchiveProject }
  | { kind: 'section'; ref: string; item: ArchiveSection }
  | { kind: 'excerpt'; ref: string; item: ArchiveExcerpt }
  | { kind: 'event'; ref: string; item: ArchiveEvent }
  | { kind: 'diary'; ref: string; item: ArchiveDiaryEntry }
  | { kind: 'page'; ref: string; item: ArchivePage }
  | { kind: 'tag'; ref: string; item: ArchiveTag };

export const refOf = {
  project: (item: ArchiveProject) => `project:${item.id}`,
  section: (item: ArchiveSection) => `section:${item.project}/${item.id}`,
  excerpt: (item: ArchiveExcerpt) =>
    `excerpt:${item.parent.kind}/${item.parent.id}/${item.id}`,
  event: (item: ArchiveEvent) => `event:${item.id}`,
  diary: (item: ArchiveDiaryEntry) => `diary:${item.date}`,
  page: (item: ArchivePage) => `page:${item.id}`,
  tag: (item: ArchiveTag) => `tag:${item.id}`,
};

/** The ref of an excerpt's parent: `excerpt:diary/2021-03-04/x` → `diary:2021-03-04`. */
export function parentRefOf(excerpt: ArchiveExcerpt): string {
  return `${excerpt.parent.kind}:${excerpt.parent.id}`;
}

const excerptsOf = (items: ArchiveExcerpt[]) =>
  items.map((excerpt) => ({
    kind: 'excerpt' as const,
    ref: refOf.excerpt(excerpt),
    item: excerpt,
  }));

/** Every entity, each parent followed by its sections and excerpts. */
export function archiveEntities(archive: Archive): ArchiveEntity[] {
  return [
    ...archive.tags.map((item) => ({
      kind: 'tag' as const,
      ref: refOf.tag(item),
      item,
    })),
    ...archive.pages.map((item) => ({
      kind: 'page' as const,
      ref: refOf.page(item),
      item,
    })),
    ...archive.projects.flatMap((item) => [
      { kind: 'project' as const, ref: refOf.project(item), item },
      ...item.sections.map((section) => ({
        kind: 'section' as const,
        ref: refOf.section(section),
        item: section,
      })),
      ...excerptsOf(item.excerpts),
    ]),
    ...archive.events.flatMap((item) => [
      { kind: 'event' as const, ref: refOf.event(item), item },
      ...excerptsOf(item.excerpts),
    ]),
    ...archive.diary.flatMap((item) => [
      { kind: 'diary' as const, ref: refOf.diary(item), item },
      ...excerptsOf(item.excerpts),
    ]),
  ];
}

/** Every excerpt of the archive. */
export function archiveExcerpts(archive: Archive): ArchiveExcerpt[] {
  return [
    ...archive.projects.flatMap((item) => item.excerpts),
    ...archive.events.flatMap((item) => item.excerpts),
    ...archive.diary.flatMap((item) => item.excerpts),
  ];
}

export interface ArchiveText {
  /** Whose text: a ref, or `profile`. */
  owner: string;
  slot: 'body' | 'notes' | 'about';
  file: string;
  markdown: string;
}

/** Every text written in Lab Markdown. A tag's description is plain words. */
export function archiveTexts(archive: Archive): ArchiveText[] {
  const texts: ArchiveText[] = [];
  const add = (
    owner: string,
    slot: ArchiveText['slot'],
    file: string,
    markdown: string,
  ) => {
    if (markdown.trim()) texts.push({ owner, slot, file, markdown });
  };
  if (archive.person)
    add('profile', 'about', archive.person.file, archive.person.about);
  for (const entity of archiveEntities(archive)) {
    if (entity.kind === 'tag') continue;
    add(entity.ref, 'body', entity.item.file, entity.item.body);
    if ('notes' in entity.item)
      add(entity.ref, 'notes', entity.item.file, entity.item.notes);
  }
  return texts;
}
