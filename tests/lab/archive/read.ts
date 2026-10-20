// Reads an archive folder (FORMAT.md) into memory. Strict about shape — an
// unknown key, a wrong type, a missing required field is an issue — and
// lenient about nothing else: what refs and files point at is `validate.ts`'s.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Access } from '../types';
import type {
  Archive,
  ArchiveAction,
  ArchiveDiaryEntry,
  ArchiveEvent,
  ArchiveFile,
  ArchiveFilePlacement,
  ArchiveIssue,
  ArchiveLink,
  ArchiveMeta,
  ArchiveNamedLink,
  ArchivePage,
  ArchivePeriod,
  ArchivePerson,
  ArchivePlant,
  ArchiveProject,
  ArchiveRelation,
  ArchiveSection,
  ArchiveStatus,
  ArchiveTag,
  FileKind,
} from './model';

/** The format this reader knows, and the highest revision of it. */
export const READS_FORMAT = 1;
export const READS_REVISION = 1;

export const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const RELATIVE_DAY = /^today([+-]\d+)?$/;

export interface ReadResult {
  archive: Archive;
  issues: ArchiveIssue[];
}

/** One file's frontmatter, read field by field, with what went wrong said. */
class Fields {
  private readonly used = new Set<string>();

  constructor(
    private readonly data: Record<string, unknown>,
    readonly file: string,
    private readonly issues: ArchiveIssue[],
  ) {}

  error(message: string) {
    this.issues.push({ level: 'error', file: this.file, message });
  }

  private take(key: string): unknown {
    this.used.add(key);
    return this.data[key];
  }

  has(key: string) {
    return this.data[key] !== undefined && this.data[key] !== null;
  }

  string(key: string, required = false): string {
    const value = this.take(key);
    if (value === undefined || value === null) {
      if (required) this.error(`${key} is required`);
      return '';
    }
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value);
    if (typeof value !== 'string') {
      this.error(`${key} must be words`);
      return '';
    }
    if (required && !value.trim()) this.error(`${key} is required`);
    return value;
  }

  optionalString(key: string): string | undefined {
    return this.has(key) ? this.string(key) : (this.take(key), undefined);
  }

  boolean(key: string): boolean {
    const value = this.take(key);
    if (value === undefined || value === null) return false;
    if (typeof value !== 'boolean') {
      this.error(`${key} must be true or false`);
      return false;
    }
    return value;
  }

  list(key: string): unknown[] {
    const value = this.take(key);
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      this.error(`${key} must be a list`);
      return [];
    }
    return value;
  }

  strings(key: string): string[] {
    return this.list(key).flatMap((item) => {
      if (typeof item === 'string' && item.trim()) return [item.trim()];
      this.error(`${key} holds something that is not words`);
      return [];
    });
  }

  oneOf<T extends string>(key: string, values: readonly T[], fallback: T): T {
    const value = this.take(key);
    if (value === undefined || value === null) return fallback;
    if (
      typeof value === 'string' &&
      (values as readonly string[]).includes(value)
    )
      return value as T;
    this.error(`${key} must be one of ${values.join(', ')}`);
    return fallback;
  }

  object(key: string): Fields | undefined {
    const value = this.take(key);
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'object' || Array.isArray(value)) {
      this.error(`${key} must be a map`);
      return undefined;
    }
    return new Fields(value as Record<string, unknown>, this.file, this.issues);
  }

  raw(key: string): unknown {
    return this.take(key);
  }

  /** Keys nobody asked for, except `x-` notes. */
  finish(where = '') {
    for (const key of Object.keys(this.data))
      if (!this.used.has(key) && !key.startsWith('x-'))
        this.error(`unknown key ${where}${key}`);
  }
}

function itemFields(
  item: unknown,
  parent: Fields,
  issues: ArchiveIssue[],
  what: string,
): Fields | undefined {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    parent.error(`${what} must be a map`);
    return undefined;
  }
  return new Fields(item as Record<string, unknown>, parent.file, issues);
}

export function isArchiveDate(value: string): boolean {
  return DAY.test(value) || RELATIVE_DAY.test(value);
}

function date(fields: Fields, value: string, what: string): string {
  if (!isArchiveDate(value)) fields.error(`${what} "${value}" is not a day`);
  return value;
}

const PRECISIONS = ['exact', 'day', 'month', 'year'] as const;

function periods(
  fields: Fields,
  key: string,
  issues: ArchiveIssue[],
): ArchivePeriod[] {
  return fields.list(key).flatMap((item): ArchivePeriod[] => {
    if (typeof item === 'string') {
      const [start = '', end = start] = item
        .split('..')
        .map((part) => part.trim());
      return [
        {
          start: date(fields, start, 'a period'),
          end: date(fields, end, 'a period'),
          precision: 'exact',
          doubt: '',
          label: '',
        },
      ];
    }
    const period = itemFields(item, fields, issues, 'a period');
    if (!period) return [];
    const start = period.string('start', true);
    const end = period.string('end') || start;
    const result: ArchivePeriod = {
      start: date(period, start, 'start'),
      end: date(period, end, 'end'),
      precision: period.oneOf('precision', PRECISIONS, 'exact'),
      doubt: period.string('doubt'),
      label: period.string('label'),
    };
    if (result.doubt && result.precision === 'exact')
      period.error('a period with a doubt needs a precision other than exact');
    period.finish('in a period: ');
    return [result];
  });
}

function statuses(fields: Fields, issues: ArchiveIssue[]): ArchiveStatus[] {
  return fields.list('statuses').flatMap((item): ArchiveStatus[] => {
    const status = itemFields(item, fields, issues, 'a status');
    if (!status) return [];
    const empty = status.boolean('empty');
    const result: ArchiveStatus = {
      date: date(status, status.string('date', true), 'a status date'),
      text: status.string('text'),
      file: status.optionalString('file'),
      empty,
    };
    if (empty && (result.text || result.file))
      status.error('an empty status has no text and no file');
    if (!empty && !result.text.trim() && !result.file)
      status.error('a status needs text or a file, or empty: true');
    status.finish('in a status: ');
    return [result];
  });
}

const RELATION_KINDS = ['related', 'depends-on', 'affects'] as const;

function relations(fields: Fields, issues: ArchiveIssue[]): ArchiveRelation[] {
  return fields.list('relations').flatMap((item): ArchiveRelation[] => {
    const relation = itemFields(item, fields, issues, 'a relation');
    if (!relation) return [];
    const result: ArchiveRelation = {
      to: relation.string('to', true),
      kind: relation.oneOf('kind', RELATION_KINDS, 'related'),
    };
    const note = relation.optionalString('note');
    const notes = relation.object('notes');
    if (note !== undefined && notes)
      relation.error('a relation has a note or notes, not both');
    if (note !== undefined) result.note = note;
    if (notes) {
      result.notes = {
        this: notes.string('this'),
        other: notes.string('other'),
      };
      notes.finish('in notes: ');
    }
    relation.finish('in a relation: ');
    return [result];
  });
}

function links(fields: Fields, issues: ArchiveIssue[]): ArchiveLink[] {
  return fields.list('links').flatMap((item): ArchiveLink[] => {
    const link = itemFields(item, fields, issues, 'a link');
    if (!link) return [];
    const result = {
      url: link.string('url', true),
      note: link.string('note'),
      private: link.boolean('private'),
    };
    link.finish('in a link: ');
    return [result];
  });
}

function namedLinks(
  fields: Fields,
  issues: ArchiveIssue[],
): ArchiveNamedLink[] {
  return fields.list('links').flatMap((item): ArchiveNamedLink[] => {
    const link = itemFields(item, fields, issues, 'a link');
    if (!link) return [];
    const result = {
      url: link.string('url', true),
      name: link.string('name'),
      note: link.string('note'),
      private: link.boolean('private'),
    };
    link.finish('in a link: ');
    return [result];
  });
}

function placements(
  fields: Fields,
  key: string,
  issues: ArchiveIssue[],
  withTitle: boolean,
): ArchiveFilePlacement[] {
  return fields.list(key).flatMap((item): ArchiveFilePlacement[] => {
    if (typeof item === 'string')
      return [{ file: item, caption: '', private: false }];
    const placement = itemFields(item, fields, issues, `an item of ${key}`);
    if (!placement) return [];
    const result: ArchiveFilePlacement = {
      file: placement.string('file', true),
      caption: placement.string('caption'),
      private: placement.boolean('private'),
    };
    if (withTitle) {
      const title = placement.optionalString('title');
      if (title !== undefined) result.title = title;
    }
    placement.finish(`in ${key}: `);
    return [result];
  });
}

/** `favicon`, `standard`, or `file:<id>`. */
function keywordOrFile<T extends string>(
  fields: Fields,
  key: string,
  keywords: readonly T[],
): T | { file: string } | undefined {
  const value = fields.optionalString(key);
  if (value === undefined) return undefined;
  if ((keywords as readonly string[]).includes(value)) return value as T;
  if (value.startsWith('file:') && value.length > 5)
    return { file: value.slice(5) };
  fields.error(`${key} must be one of ${keywords.join(', ')}, or file:<id>`);
  return undefined;
}

function action(fields: Fields): ArchiveAction | undefined {
  const item = fields.object('action');
  if (!item) return undefined;
  const result: ArchiveAction = {
    text: item.string('text', true),
    link: item.optionalString('link'),
    file: item.optionalString('file'),
    color: item.optionalString('color'),
    private: item.boolean('private'),
    icon: keywordOrFile(item, 'icon', ['favicon'] as const),
    background:
      keywordOrFile(item, 'background', [
        'standard',
        'auto',
        'accent',
      ] as const) ?? 'standard',
    size: item.oneOf(
      'size',
      ['natural', 'contain', 'cover', 'stretch'] as const,
      'natural',
    ),
    repeat: item.oneOf(
      'repeat',
      ['no-repeat', 'repeat-x', 'repeat-y', 'repeat'] as const,
      'no-repeat',
    ),
  };
  if (Boolean(result.link) === Boolean(result.file))
    item.error('an action button has a link or a file, one of them');
  if (result.color && !/^#[0-9a-f]{6}$/i.test(result.color))
    item.error('an action colour is #rrggbb');
  item.finish('in action: ');
  return result;
}

const ACCESS = ['public', 'link-only', 'private'] as const;

function access(fields: Fields): Access {
  return fields.oneOf('access', ACCESS, 'public');
}

/** A Markdown file: its frontmatter and its body. */
function readEntityFile(
  path: string,
  file: string,
  issues: ArchiveIssue[],
): { fields: Fields; body: string } | undefined {
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '');
  if (text.includes('\r'))
    issues.push({ level: 'error', file, message: 'line endings must be LF' });
  const normalized = text.replace(/\r\n?/g, '\n');
  let data: Record<string, unknown> = {};
  let body = normalized;
  if (normalized.startsWith('---\n')) {
    const end = normalized.indexOf('\n---', 4);
    const after = end < 0 ? -1 : normalized.indexOf('\n', end + 4);
    if (end < 0 || (after < 0 && normalized.length > end + 4)) {
      issues.push({
        level: 'error',
        file,
        message: 'the frontmatter is not closed by ---',
      });
      return undefined;
    }
    try {
      const parsed = parseYaml(normalized.slice(4, end + 1)) ?? {};
      if (typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('the frontmatter is not a map');
      data = parsed as Record<string, unknown>;
    } catch (error) {
      issues.push({
        level: 'error',
        file,
        message: `the frontmatter is not valid YAML: ${(error as Error).message.split('\n')[0]}`,
      });
      return undefined;
    }
    body = after < 0 ? '' : normalized.slice(after + 1);
  }
  return { fields: new Fields(data, file, issues), body: body.trim() };
}

function readYamlFile(
  path: string,
  file: string,
  issues: ArchiveIssue[],
): unknown {
  try {
    return parseYaml(readFileSync(path, 'utf8'));
  } catch (error) {
    issues.push({
      level: 'error',
      file,
      message: `not valid YAML: ${(error as Error).message.split('\n')[0]}`,
    });
    return undefined;
  }
}

function listDir(path: string): string[] {
  return existsSync(path) ? readdirSync(path).sort() : [];
}

function checkId(
  id: string,
  file: string,
  issues: ArchiveIssue[],
  what = 'id',
) {
  if (!ID_PATTERN.test(id) || id.length > 48)
    issues.push({
      level: 'error',
      file,
      message: `${what} "${id}" is not [a-z0-9-], at most 48 characters`,
    });
}

export function readArchive(dir: string): ReadResult {
  const issues: ArchiveIssue[] = [];
  const at = (path: string) => relative(dir, path).replaceAll('\\', '/');

  // ---------------------------------------------------------- archive.yaml
  const metaPath = join(dir, 'archive.yaml');
  let meta: ArchiveMeta = {
    format: READS_FORMAT,
    revision: 0,
    version: '0.0.0',
    title: '',
    language: 'ru',
    span: { start: '', end: '' },
  };
  if (!existsSync(metaPath)) {
    issues.push({ level: 'error', file: 'archive.yaml', message: 'missing' });
  } else {
    const data = readYamlFile(metaPath, 'archive.yaml', issues);
    if (data && typeof data === 'object') {
      const fields = new Fields(
        data as Record<string, unknown>,
        'archive.yaml',
        issues,
      );
      const span = fields.object('span');
      meta = {
        format: Number(fields.raw('format')),
        revision: Number(fields.raw('revision') ?? 0),
        version: fields.string('version', true),
        title: fields.string('title', true),
        language: fields.string('language', true),
        span: {
          start: span?.string('start', true) ?? '',
          end: span?.string('end', true) ?? '',
        },
      };
      span?.finish('in span: ');
      fields.finish();
      if (meta.format !== READS_FORMAT)
        fields.error(
          `format ${meta.format} is not the format ${READS_FORMAT} this reader knows`,
        );
      else if (!(meta.revision <= READS_REVISION))
        fields.error(
          `revision ${meta.revision} is newer than ${READS_REVISION}, the newest this reader knows: update the adapter (tests/lab/archive/)`,
        );
      for (const day of [meta.span.start, meta.span.end])
        if (day && !DAY.test(day))
          fields.error(`span holds "${day}", not a day`);
    }
  }

  // ------------------------------------------------------------- person.md
  let person: ArchivePerson | undefined;
  const personPath = join(dir, 'person.md');
  if (existsSync(personPath)) {
    const read = readEntityFile(personPath, 'person.md', issues);
    if (read) {
      const { fields, body } = read;
      person = {
        file: 'person.md',
        name: fields.string('name', true),
        nickname: fields.string('nickname'),
        birthDate: fields.has('birthDate')
          ? date(fields, fields.string('birthDate'), 'birthDate')
          : '',
        slogan: fields.string('slogan'),
        avatars: fields.strings('avatars'),
        banner: fields.optionalString('banner'),
        favicon: fields.optionalString('favicon'),
        facts: fields.list('facts').flatMap((item) => {
          const fact = itemFields(item, fields, issues, 'a fact');
          if (!fact) return [];
          const result = {
            name: fact.string('name', true),
            value: fact.string('value', true),
          };
          fact.finish('in a fact: ');
          return [result];
        }),
        links: namedLinks(fields, issues),
        pinned: fields.strings('pinned'),
        statuses: statuses(fields, issues),
        about: body,
      };
      fields.finish();
    }
  }

  // ------------------------------------------------------------------ tags
  const tags: ArchiveTag[] = [];
  for (const name of listDir(join(dir, 'tags'))) {
    const path = join(dir, 'tags', name);
    if (!name.endsWith('.md')) continue;
    const file = at(path);
    const read = readEntityFile(path, file, issues);
    if (!read) continue;
    const id = basename(name, '.md');
    checkId(id, file, issues);
    const { fields, body } = read;
    tags.push({
      file,
      id,
      title: fields.string('title', true),
      slug: fields.optionalString('slug'),
      synonyms: fields.strings('synonyms'),
      icon: fields.optionalString('icon'),
      description: body,
    });
    fields.finish();
  }

  // ----------------------------------------------------------------- pages
  const pages: ArchivePage[] = [];
  for (const name of listDir(join(dir, 'pages'))) {
    if (!name.endsWith('.md')) continue;
    const path = join(dir, 'pages', name);
    const file = at(path);
    const read = readEntityFile(path, file, issues);
    if (!read) continue;
    const id = basename(name, '.md');
    checkId(id, file, issues);
    const { fields, body } = read;
    pages.push({
      file,
      id,
      title: fields.string('title', true),
      summary: fields.string('summary', true),
      slug: fields.optionalString('slug') ?? id,
      access: access(fields),
      icon: fields.optionalString('icon'),
      synonyms: fields.strings('synonyms'),
      reminder: fields.string('reminder'),
      notes: fields.string('notes'),
      body,
    });
    if (!body) fields.error('a page needs a body');
    fields.finish();
  }

  // -------------------------------------------------------------- projects
  const projects: ArchiveProject[] = [];
  for (const id of listDir(join(dir, 'projects'))) {
    const folder = join(dir, 'projects', id);
    if (!statSync(folder).isDirectory()) continue;
    const path = join(folder, 'project.md');
    const file = at(path);
    checkId(id, file, issues);
    if (!existsSync(path)) {
      issues.push({ level: 'error', file, message: 'missing' });
      continue;
    }
    const read = readEntityFile(path, file, issues);
    if (!read) continue;
    const { fields, body } = read;
    const sections: ArchiveSection[] = [];
    const seenOrder = new Map<number, string>();
    for (const name of listDir(join(folder, 'sections'))) {
      if (!name.endsWith('.md')) continue;
      const sectionPath = join(folder, 'sections', name);
      const sectionFile = at(sectionPath);
      const match = /^(\d{2,3})-(.+)\.md$/.exec(name);
      if (!match) {
        issues.push({
          level: 'error',
          file: sectionFile,
          message: 'a section file is named <NN>-<id>.md',
        });
        continue;
      }
      const order = Number(match[1]);
      const sectionId = match[2]!;
      checkId(sectionId, sectionFile, issues);
      if (seenOrder.has(order))
        issues.push({
          level: 'error',
          file: sectionFile,
          message: `its number ${match[1]} is also ${seenOrder.get(order)}'s`,
        });
      seenOrder.set(order, name);
      const sectionRead = readEntityFile(sectionPath, sectionFile, issues);
      if (!sectionRead) continue;
      const section = sectionRead.fields;
      const result: ArchiveSection = {
        file: sectionFile,
        id: sectionId,
        project: id,
        order,
        title: section.string('title', true),
        summary: section.string('summary'),
        slug: section.optionalString('slug'),
        private: section.boolean('private'),
        periods: periods(section, 'periods', issues),
        banner: section.optionalString('banner'),
        body: sectionRead.body,
      };
      for (const forbidden of ['relations', 'tags'])
        if (section.has(forbidden)) {
          section.error(`a section has no ${forbidden}`);
          section.raw(forbidden);
        }
      if (!result.body && !result.periods.length)
        section.error('a section needs a body, periods, or both');
      section.finish();
      if (sections.some((other) => other.id === sectionId))
        section.error(`section id ${sectionId} is taken in this project`);
      sections.push(result);
    }
    projects.push({
      file,
      id,
      title: fields.string('title', true),
      summary: fields.string('summary', true),
      slug: fields.optionalString('slug'),
      access: access(fields),
      featured: fields.boolean('featured'),
      cv: fields.boolean('cv'),
      icon: fields.optionalString('icon'),
      banner: fields.optionalString('banner'),
      tags: fields.strings('tags'),
      synonyms: fields.strings('synonyms'),
      reminder: fields.string('reminder'),
      notes: fields.string('notes'),
      links: links(fields, issues),
      files: placements(fields, 'files', issues, true),
      showcase: placements(fields, 'showcase', issues, false),
      statuses: statuses(fields, issues),
      action: action(fields),
      relations: relations(fields, issues),
      body,
      sections,
    });
    fields.finish();
  }

  // ---------------------------------------------------------------- events
  const events: ArchiveEvent[] = [];
  for (const year of listDir(join(dir, 'events'))) {
    const folder = join(dir, 'events', year);
    if (!statSync(folder).isDirectory()) {
      issues.push({
        level: 'error',
        file: at(folder),
        message: 'events live in events/<YYYY>/',
      });
      continue;
    }
    for (const name of listDir(folder)) {
      if (!name.endsWith('.md')) continue;
      const path = join(folder, name);
      const file = at(path);
      const read = readEntityFile(path, file, issues);
      if (!read) continue;
      const id = basename(name, '.md');
      checkId(id, file, issues);
      const { fields, body } = read;
      const event: ArchiveEvent = {
        file,
        id,
        year,
        title: fields.string('title', true),
        summary: fields.string('summary', true),
        slug: fields.optionalString('slug'),
        access: access(fields),
        periods: periods(fields, 'periods', issues),
        banner: fields.optionalString('banner'),
        tags: fields.strings('tags'),
        synonyms: fields.strings('synonyms'),
        reminder: fields.string('reminder'),
        notes: fields.string('notes'),
        links: links(fields, issues),
        files: placements(fields, 'files', issues, true),
        action: action(fields),
        relations: relations(fields, issues),
        body,
      };
      if (!event.periods.length)
        fields.error('an event needs at least one period');
      if (!body) fields.error('an event needs a body');
      fields.finish();
      events.push(event);
    }
  }

  // ----------------------------------------------------------------- diary
  const diary: ArchiveDiaryEntry[] = [];
  const readDiaryFile = (path: string, date: string) => {
    const file = at(path);
    const read = readEntityFile(path, file, issues);
    if (!read) return;
    const { fields, body } = read;
    for (const forbidden of ['title', 'summary', 'tags'])
      if (fields.has(forbidden))
        fields.error(`a diary entry has no ${forbidden}`);
    diary.push({
      file,
      date,
      access: access(fields),
      reminder: fields.string('reminder'),
      notes: fields.string('notes'),
      relations: relations(fields, issues),
      body,
    });
    if (!body) fields.error('a diary entry needs a body');
    // The forbidden keys were reported above, not as unknown ones.
    for (const forbidden of ['title', 'summary', 'tags']) fields.raw(forbidden);
    fields.finish();
  };
  for (const year of listDir(join(dir, 'diary'))) {
    const folder = join(dir, 'diary', year);
    if (!statSync(folder).isDirectory()) continue;
    for (const name of listDir(folder)) {
      if (!name.endsWith('.md')) continue;
      const day = basename(name, '.md');
      const path = join(folder, name);
      if (year === 'relative') {
        if (!/^today\+\d+$/.test(day))
          issues.push({
            level: 'error',
            file: at(path),
            message: 'a relative entry is named today+<N>.md',
          });
        else readDiaryFile(path, day);
      } else if (!DAY.test(day) || !day.startsWith(`${year}-`)) {
        issues.push({
          level: 'error',
          file: at(path),
          message: `a diary file of ${year} is named ${year}-MM-DD.md`,
        });
      } else readDiaryFile(path, day);
    }
  }

  // ----------------------------------------------------------------- files
  const files: ArchiveFile[] = [];
  const KINDS = ['image', 'video', 'audio', 'document', 'other'] as const;
  for (const name of listDir(join(dir, 'files'))) {
    if (!name.endsWith('.yaml')) continue;
    const path = join(dir, 'files', name);
    const file = at(path);
    const data = readYamlFile(path, file, issues);
    if (!data || typeof data !== 'object') continue;
    const id = basename(name, '.yaml');
    checkId(id, file, issues);
    const fields = new Fields(data as Record<string, unknown>, file, issues);
    const source = fields.object('source');
    const origin = fields.has('origin')
      ? fields.oneOf(
          'origin',
          ['commons', 'generated', 'original'] as const,
          'original',
        )
      : (fields.raw('origin'), undefined);
    const item: ArchiveFile = {
      file,
      id,
      kind: fields.oneOf<FileKind>('kind', KINDS, 'other'),
      ext: fields.string('ext', true).toLowerCase(),
      title: fields.string('title', true),
      description: fields.string('description'),
      origin,
      source: source
        ? {
            page: source.optionalString('page'),
            download: source.optionalString('download'),
            retrieved: source.optionalString('retrieved'),
          }
        : undefined,
      author: fields.string('author', origin !== 'generated'),
      licence: fields.string('licence', true),
      licenceUrl: fields.optionalString('licenceUrl'),
      attribution: fields.optionalString('attribution'),
      transform: fields.optionalString('transform'),
      people: fields.has('people')
        ? fields.oneOf('people', ['none', 'incidental'] as const, 'none')
        : (fields.raw('people'), undefined),
      truth: fields.optionalString('truth'),
    };
    source?.finish('in source: ');
    fields.finish();
    files.push(item);
  }

  // ---------------------------------------------------------------- plants
  const plants: ArchivePlant[] = [];
  const plantsPath = join(dir, 'plants.yaml');
  if (existsSync(plantsPath)) {
    const data = readYamlFile(plantsPath, 'plants.yaml', issues);
    if (data !== undefined && data !== null && !Array.isArray(data))
      issues.push({
        level: 'error',
        file: 'plants.yaml',
        message: 'must be a list',
      });
    for (const item of Array.isArray(data) ? data : []) {
      if (!item || typeof item !== 'object') {
        issues.push({
          level: 'error',
          file: 'plants.yaml',
          message: 'a plant must be a map',
        });
        continue;
      }
      const fields = new Fields(
        item as Record<string, unknown>,
        'plants.yaml',
        issues,
      );
      const plant: ArchivePlant = {
        id: fields.string('id', true),
        ref: fields.optionalString('ref'),
        file: fields.optionalString('file'),
        traits: fields.strings('traits'),
        where: fields.optionalString('where'),
        word: fields.optionalString('word'),
        detail: fields.optionalString('detail'),
      };
      if (Boolean(plant.ref) === Boolean(plant.file))
        fields.error(
          `plant ${plant.id}: a plant names a ref or a file, one of them`,
        );
      if (!plant.traits.length) fields.error(`plant ${plant.id}: no traits`);
      fields.finish(`in plant ${plant.id}: `);
      plants.push(plant);
    }
  }

  return {
    archive: {
      dir,
      meta,
      person,
      tags,
      pages,
      projects,
      events,
      diary,
      files,
      plants,
    },
    issues,
  };
}
