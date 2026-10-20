// What FORMAT.md asks of an archive as a whole: every ref and file resolves,
// a file stands only where its kind can, days are days, relations join what
// may be joined, once. `read.ts` has already checked each file's own shape.
import { existsSync } from 'node:fs';
import {
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from '../../../shared/assets/formats';
import { PROJECT_ACTION_TEXT_MAX_LENGTH } from '../../../shared/project-action';
import { isCalendarDay, isRelativeDay, resolveDay } from './dates';
import { scanText, type TextScan } from './dialect';
import type { Archive, ArchiveIssue, ArchiveRelation, FileKind } from './model';
import { archiveEntities, archiveTexts } from './texts';

const IMAGES = new Set<string>(IMAGE_EXTENSIONS);
const VIDEOS = new Set<string>(VIDEO_EXTENSIONS);
const AUDIO = new Set<string>(AUDIO_EXTENSIONS);

/** What a file is to Thei, by its extension. */
export function kindOfExtension(ext: string): FileKind {
  const normalized = ext.toLowerCase() === 'jpeg' ? 'jpg' : ext.toLowerCase();
  if (IMAGES.has(normalized)) return 'image';
  if (VIDEOS.has(normalized)) return 'video';
  if (AUDIO.has(normalized)) return 'audio';
  return normalized === 'pdf' ? 'document' : 'other';
}

type Place = 'picture' | 'visual' | 'audio' | 'any';

const PLACE_WORDS: Record<Place, string> = {
  picture: 'a picture',
  visual: 'a picture or a video',
  audio: 'a recording',
  any: 'any file',
};

function fits(place: Place, kind: FileKind) {
  if (place === 'any') return true;
  if (place === 'audio') return kind === 'audio';
  if (place === 'picture') return kind === 'image';
  return kind === 'image' || kind === 'video';
}

export interface ValidateOptions {
  /** The day relative days are checked against; today by default. */
  seedDay: string;
  /** Where a file's bytes are, to check they exist; skipped when absent. */
  mediaPath?: (id: string, ext: string) => string | undefined;
}

export interface Validation {
  issues: ArchiveIssue[];
  /** Each text's scan, by `<owner>|<slot>`, for coverage and facts. */
  scans: Map<string, TextScan>;
}

export function validateArchive(
  archive: Archive,
  options: ValidateOptions,
): Validation {
  const issues: ArchiveIssue[] = [];
  const error = (file: string, message: string) =>
    issues.push({ level: 'error', file, message });
  const entities = archiveEntities(archive);
  const refs = new Map(entities.map((entity) => [entity.ref, entity]));
  const files = new Map(archive.files.map((file) => [file.id, file]));

  // ------------------------------------------------------------------ ids
  const seenRefs = new Set<string>();
  for (const entity of entities) {
    if (seenRefs.has(entity.ref))
      error(entity.item.file, `${entity.ref} is defined twice`);
    seenRefs.add(entity.ref);
  }
  const pageSlugs = new Map<string, string>();
  for (const page of archive.pages) {
    const other = pageSlugs.get(page.slug);
    if (other) error(page.file, `slug "${page.slug}" is also ${other}'s`);
    pageSlugs.set(page.slug, page.id);
  }
  const tagTitles = new Map<string, string>();
  for (const tag of archive.tags) {
    const key = tag.title.trim().toLowerCase();
    const other = tagTitles.get(key);
    if (other) error(tag.file, `title "${tag.title}" is also tag ${other}'s`);
    tagTitles.set(key, tag.id);
  }

  // ----------------------------------------------------------------- files
  for (const file of archive.files) {
    const kind = kindOfExtension(file.ext);
    if (file.kind !== kind && !(file.kind === 'document' && kind === 'other'))
      error(
        file.file,
        `kind ${file.kind} does not agree with .${file.ext}, which Thei takes for ${kind}`,
      );
    if (file.description.length > 1000)
      issues.push({
        level: 'warning',
        file: file.file,
        message: 'description longer than 1 000 characters',
      });
    const path = options.mediaPath?.(file.id, file.ext);
    if (options.mediaPath && (!path || !existsSync(path)))
      error(
        file.file,
        `its bytes are missing (${path ?? `media/${file.id}.${file.ext}`})`,
      );
  }

  const placed = (where: string, id: string | undefined, place: Place) => {
    if (!id) return;
    const file = files.get(id);
    if (!file) error(where, `file "${id}" is not in files/`);
    else if (!fits(place, file.kind))
      error(
        where,
        `file "${id}" is ${file.kind}, where ${PLACE_WORDS[place]} stands`,
      );
  };

  // ---------------------------------------------------------------- days
  const day = (where: string, value: string, what: string) => {
    const resolved = resolveDay(value, options.seedDay);
    if (!isCalendarDay(resolved))
      error(where, `${what} "${value}" is not a calendar day`);
    return resolved;
  };
  const periods = (where: string, list: { start: string; end: string }[]) => {
    for (const period of list) {
      const start = day(where, period.start, 'a period start');
      const end = day(where, period.end, 'a period end');
      if (start > end)
        error(
          where,
          `a period starts ${period.start} after it ends ${period.end}`,
        );
    }
  };
  const statuses = (
    where: string,
    list: { date: string; file?: string; empty: boolean }[],
  ) => {
    list.forEach((status, index) => {
      day(where, status.date, 'a status date');
      placed(where, status.file, 'picture');
      if (status.empty && list[index - 1]?.empty)
        error(where, 'an empty status follows another empty one');
    });
  };

  // ----------------------------------------------------------- relations
  const RELATED = new Set(['project', 'event', 'diary']);
  const pairs = new Map<string, string>();
  const relations = (where: string, from: string, list: ArchiveRelation[]) => {
    for (const relation of list) {
      const target = refs.get(relation.to);
      if (!target) {
        error(
          where,
          `relation to "${relation.to}", which is not in the archive`,
        );
        continue;
      }
      if (!RELATED.has(target.kind)) {
        error(
          where,
          `relation to ${relation.to}: only projects, events and diary entries are related`,
        );
        continue;
      }
      if (relation.to === from) {
        error(where, 'an entity is related to itself');
        continue;
      }
      const pair = [from, relation.to].sort().join(' ');
      const other = pairs.get(pair);
      if (other)
        error(
          where,
          `${from} and ${relation.to} are already related (${other})`,
        );
      pairs.set(pair, where);
    }
  };

  // ------------------------------------------------------- frontmatter
  const tags = new Set(archive.tags.map((tag) => tag.id));
  const tagList = (where: string, list: string[]) => {
    for (const tag of list)
      if (!tags.has(tag)) error(where, `tag "${tag}" is not in tags/`);
  };
  const action = (
    where: string,
    item: Archive['projects'][number]['action'],
  ) => {
    if (!item) return;
    if (Array.from(item.text).length > PROJECT_ACTION_TEXT_MAX_LENGTH)
      error(
        where,
        `the action's text is longer than ${PROJECT_ACTION_TEXT_MAX_LENGTH} characters`,
      );
    placed(where, item.file, 'any');
    if (item.icon && typeof item.icon === 'object')
      placed(where, item.icon.file, 'picture');
    if (typeof item.background === 'object')
      placed(where, item.background.file, 'picture');
  };

  if (archive.person) {
    const person = archive.person;
    for (const avatar of person.avatars) placed(person.file, avatar, 'picture');
    placed(person.file, person.banner, 'visual');
    placed(person.file, person.favicon, 'picture');
    if (person.birthDate) day(person.file, person.birthDate, 'birthDate');
    for (const page of person.pinned)
      if (!page.startsWith('page:') || !refs.has(page))
        error(person.file, `pinned "${page}" is not a page of the archive`);
    statuses(person.file, person.statuses);
  }
  for (const tag of archive.tags) placed(tag.file, tag.icon, 'picture');
  for (const page of archive.pages) placed(page.file, page.icon, 'picture');
  for (const project of archive.projects) {
    placed(project.file, project.icon, 'picture');
    placed(project.file, project.banner, 'visual');
    for (const item of project.files) placed(project.file, item.file, 'any');
    for (const item of project.showcase)
      placed(project.file, item.file, 'visual');
    tagList(project.file, project.tags);
    statuses(project.file, project.statuses);
    action(project.file, project.action);
    relations(project.file, `project:${project.id}`, project.relations);
    for (const section of project.sections) {
      placed(section.file, section.banner, 'visual');
      periods(section.file, section.periods);
    }
  }
  for (const event of archive.events) {
    placed(event.file, event.banner, 'visual');
    for (const item of event.files) placed(event.file, item.file, 'any');
    tagList(event.file, event.tags);
    periods(event.file, event.periods);
    action(event.file, event.action);
    relations(event.file, `event:${event.id}`, event.relations);
    const first = event.periods
      .map((period) => resolveDay(period.start, options.seedDay))
      .sort()[0];
    if (
      first &&
      !isRelativeDay(event.periods[0]!.start) &&
      first.slice(0, 4) !== event.year
    )
      error(
        event.file,
        `its first period starts in ${first.slice(0, 4)}, not ${event.year}`,
      );
  }

  // ----------------------------------------------------------------- diary
  const days = new Map<string, string>();
  for (const entry of archive.diary) {
    const resolved = day(entry.file, entry.date, 'its day');
    const other = days.get(resolved);
    if (other) error(entry.file, `${resolved} already has an entry (${other})`);
    days.set(resolved, entry.file);
    relations(entry.file, `diary:${entry.date}`, entry.relations);
    if (
      isRelativeDay(entry.date) &&
      archive.meta.span.end &&
      resolved <= archive.meta.span.end
    )
      error(
        entry.file,
        `${entry.date} falls on ${resolved}, not after span.end ${archive.meta.span.end}`,
      );
  }
  if (archive.meta.span.start && archive.meta.span.end)
    for (const entry of archive.diary)
      if (
        !isRelativeDay(entry.date) &&
        (entry.date < archive.meta.span.start ||
          entry.date > archive.meta.span.end)
      )
        error(
          entry.file,
          `${entry.date} lies outside the span ${archive.meta.span.start} … ${archive.meta.span.end}`,
        );

  // ----------------------------------------------------------------- texts
  const scans = new Map<string, TextScan>();
  const headingsOf = new Map<string, Set<string>>();
  for (const text of archiveTexts(archive)) {
    const scan = scanText(text.markdown);
    scans.set(`${text.owner}|${text.slot}`, scan);
    const where = `${text.file} (${text.slot})`;
    for (const problem of scan.problems) error(where, problem);
    for (const item of scan.files) {
      const place: Place =
        item.as === 'media' || item.as === 'gallery'
          ? 'visual'
          : item.as === 'audio'
            ? 'audio'
            : 'any';
      placed(`${where} line ${item.line}`, item.id, place);
    }
    if (text.slot === 'body') {
      const headings = new Set<string>();
      for (const line of text.markdown.split('\n')) {
        const match = /^#{2,3}\s+(.+?)\s*$/.exec(line);
        if (match) headings.add(match[1]!);
      }
      headingsOf.set(text.owner, headings);
    }
  }
  for (const text of archiveTexts(archive)) {
    const scan = scans.get(`${text.owner}|${text.slot}`)!;
    for (const ref of scan.refs) {
      const where = `${text.file} (${text.slot}) line ${ref.line}`;
      if (!refs.has(ref.ref))
        error(where, `"${ref.ref}" is not in the archive`);
      else if (ref.heading && !headingsOf.get(ref.ref)?.has(ref.heading))
        error(where, `${ref.ref} has no heading "${ref.heading}"`);
    }
  }

  // ---------------------------------------------------------------- plants
  for (const plant of archive.plants) {
    if (plant.ref && !refs.has(plant.ref) && plant.ref !== 'profile')
      error(
        'plants.yaml',
        `plant ${plant.id}: "${plant.ref}" is not in the archive`,
      );
    if (plant.file && !files.has(plant.file))
      error(
        'plants.yaml',
        `plant ${plant.id}: file "${plant.file}" is not in files/`,
      );
  }

  return { issues, scans };
}
