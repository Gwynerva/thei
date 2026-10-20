// Every entity of an archive by its ref, and every text it holds: what the
// checks, the seeder and the index walk over.
import type {
  Archive,
  ArchiveDiaryEntry,
  ArchiveEvent,
  ArchivePage,
  ArchiveProject,
  ArchiveSection,
  ArchiveTag,
} from './model';

export type ArchiveEntity =
  | { kind: 'project'; ref: string; item: ArchiveProject }
  | { kind: 'section'; ref: string; item: ArchiveSection }
  | { kind: 'event'; ref: string; item: ArchiveEvent }
  | { kind: 'diary'; ref: string; item: ArchiveDiaryEntry }
  | { kind: 'page'; ref: string; item: ArchivePage }
  | { kind: 'tag'; ref: string; item: ArchiveTag };

export const refOf = {
  project: (item: ArchiveProject) => `project:${item.id}`,
  section: (item: ArchiveSection) => `section:${item.project}/${item.id}`,
  event: (item: ArchiveEvent) => `event:${item.id}`,
  diary: (item: ArchiveDiaryEntry) => `diary:${item.date}`,
  page: (item: ArchivePage) => `page:${item.id}`,
  tag: (item: ArchiveTag) => `tag:${item.id}`,
};

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
    ]),
    ...archive.events.map((item) => ({
      kind: 'event' as const,
      ref: refOf.event(item),
      item,
    })),
    ...archive.diary.map((item) => ({
      kind: 'diary' as const,
      ref: refOf.diary(item),
      item,
    })),
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
