import { inArray } from 'drizzle-orm';
import type { ContentFieldModelValue } from '#layers/thei/shared/content';
import type { ProjectEditData } from '#layers/thei/shared/admin/project';
import type { ProjectSectionItem } from '#layers/thei/shared/project-content-item';
import type { EventEditData } from '#layers/thei/shared/event';
import type { DiaryEditData } from '#layers/thei/shared/diary';
import type { PageEditData } from '#layers/thei/shared/page';
import type { TagEditData, TagEditItem } from '#layers/thei/shared/tag';
import type {
  RelationEditItem,
  RelationNote,
} from '#layers/thei/shared/relation';
import {
  RELATION_TYPE_OF_WORD,
  type RelationWord,
} from '#layers/thei/shared/relation';
import type { ExternalLinkListItem } from '#layers/thei/shared/external-link';
import { randomId } from '#layers/thei/shared/utils/random-id';
import { refuse as fail } from '../../entity-patch/text';
import type { ProfileEditData } from '#layers/thei/shared/profile';
import type { StatusHistoryItem } from '#layers/thei/shared/status';
import { tagIdOf, type EntityKey } from '../../entity-kinds';
import { textFromMarkdown } from '../../mcp/text-input';
import { normalizeSynonyms } from '#layers/thei/shared/synonyms';
import {
  checkedAccess,
  checkedPeriods,
  checkedRelationEnd,
} from '../../entity-patch/validate';

/**
 * The fields of each kind's edit form as an action and an editor key name
 * them, and how a change to them is laid over the form.
 */

export type Changes = Record<string, unknown>;

/** What each kind's form takes, for the tool description and refusals. */
export const FORM_FIELDS = {
  project: [
    'title',
    'summary',
    'access',
    'showcase',
    'cv',
    'reminder',
    'synonyms',
    'slug',
    'publicId',
    'icon',
    'banner',
    'showcaseFiles',
    'files',
    'links',
    'tags',
    'relations',
    'description',
    'notes',
    'sections',
    'sectionOrder',
    'statuses',
    'actionText',
  ],
  'project-section': [
    'title',
    'summary',
    'private',
    'periods',
    'body',
    'banner',
    'slug',
    'publicId',
  ],
  event: [
    'title',
    'summary',
    'access',
    'reminder',
    'synonyms',
    'slug',
    'publicId',
    'periods',
    'banner',
    'files',
    'links',
    'tags',
    'relations',
    'body',
    'notes',
  ],
  'diary-entry': ['date', 'access', 'reminder', 'body', 'notes', 'relations'],
  page: [
    'title',
    'summary',
    'access',
    'reminder',
    'synonyms',
    'slug',
    'icon',
    'body',
    'notes',
  ],
  tag: ['title', 'description', 'synonyms', 'slug', 'publicId', 'icon'],
  profile: [
    'displayName',
    'slogan',
    'nickname',
    'about',
    'banner',
    'favicon',
    'links',
    'statuses',
  ],
} as const;

export type FormKind = keyof typeof FORM_FIELDS;

export const FORM_REFERENCE = `\
Fields by kind — a change names only the fields it changes:
- project: title, summary, access (public | link-only | private), showcase and cv (true/false: among chosen projects, in the résumé), reminder, synonyms [names], slug, publicId, icon and banner (a file id, or null), showcaseFiles [{ file, caption?, private? }], files [{ file, title, caption?, private? }], links [{ url, note?, private? }], tags [names], relations [{ ref, kind?: related | depends-on | affects, note? or notes? }], description and notes (editing Markdown), sections [{ id?, …section fields }] (merged by id; one without an id is added; remove one with a delete action on its ref), sectionOrder [section ids], statuses [{ id, text }] (its status lines rewritten in place, each by its id; the rest stay), actionText (the words on its button).
- project-section: title, summary, private (true/false), periods [{ startDate, endDate, precision?, precisionNote?, label? }], body (editing Markdown), banner, slug, publicId. A section with periods is a stage; it needs a body or periods.
- event: title, summary, access, reminder, synonyms [names], slug, publicId, periods (at least one), banner, files, links, tags, relations, body (needed) and notes.
- diary-entry: date (YYYY-MM-DD, one entry a day), access (public | private), reminder, body (needed), notes, relations. No title, no tags, ever.
- page: title, summary, access, reminder, synonyms [names], slug, icon, body, notes.
- tag: title, description, synonyms [names], slug, publicId, icon.
- profile: displayName, slogan, nickname, about (editing Markdown), banner, favicon, links [{ url, name?, note?, private? }], statuses [{ id, text }] (as a project's).
A list given replaces the list it names: what it leaves out goes. Each item names what it is — a relation its ref, a file its file id, a link its url — and keeps whatever else it leaves out: a relation its kind and note, a file its title, caption and privacy, a link its note and name. read_entity lists them in this very shape. A relation's note is one for both sides (note) or one per side (notes: { this, other }). A file is an id from upload_file, import_file or read_entity; in a text it is ::media{asset=<id>}. Pictures, files and links are the owner's choice: change them only when the owner asks.`;

/**
 * Keys a form carries only to be written — the edits of a status history —
 * never read back as such: what they change reads in `statusTexts`.
 */
export const FORM_WRITE_ONLY = new Set([
  'newStatuses',
  'updatedStatuses',
  'deletedStatusIds',
]);

/**
 * Status lines rewritten in place, each by its id, its picture and day kept:
 * what an owner's history reads afterwards, and the edits that write it.
 */
function statusChanges(
  form: { statusTexts?: Record<string, string>; updatedStatuses?: unknown[] },
  value: unknown,
) {
  const items = list(value, 'statuses');
  const texts = { ...(form.statusTexts ?? {}) };
  const { db, schema } = THEI_SERVER.useDb();
  const pictures = new Map(
    (
      db
        .select({
          id: schema.statuses.id,
          assetUuid: schema.statuses.assetUuid,
        })
        .from(schema.statuses)
        .where(
          inArray(
            schema.statuses.id,
            items.map((item) => String(item.id)),
          ),
        )
        .all() as { id: string; assetUuid: string | null }[]
    ).map((row) => [row.id, row.assetUuid]),
  );
  const updated = items.map((item) => {
    const id = String(item.id);
    if (!(id in texts)) fail(`There is no status ${id} here.`);
    texts[id] = text(item.text, 'a status');
    const assetUuid = pictures.get(id);
    return { id, text: texts[id]!, ...(assetUuid ? { assetUuid } : {}) };
  });
  return {
    statusTexts: texts,
    updatedStatuses: [...(form.updatedStatuses ?? []), ...updated],
  };
}

export function assertKnown(kind: FormKind, changes: Changes) {
  const known = FORM_FIELDS[kind] as readonly string[];
  const unknown = Object.keys(changes).filter((key) => !known.includes(key));
  if (unknown.length)
    fail(
      `A ${kind} has no field ${unknown.map((key) => `"${key}"`).join(', ')}; its fields are ${known.join(', ')}.`,
    );
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string') fail(`${field} takes text.`);
  return value;
}

function flag(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') fail(`${field} takes true or false.`);
  return value;
}

function file(value: unknown, field: string): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !/^a-/.test(value))
    fail(`${field} takes a file id (a-…) or null.`);
  return value;
}

function list(value: unknown, field: string): Record<string, unknown>[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => !item || typeof item !== 'object')
  )
    fail(`${field} takes a list of objects.`);
  return value as Record<string, unknown>[];
}

async function markdown(
  value: unknown,
  previous: ContentFieldModelValue | null | undefined,
  field: string,
): Promise<ContentFieldModelValue | null> {
  if (value === null || value === '') return null;
  const written = await textFromMarkdown(
    text(value, field),
    previous?.data ?? null,
  );
  return { ...(previous ?? {}), data: written.data } as ContentFieldModelValue;
}

/** The stored items of a list by their key, to keep what a change leaves out. */
function storedBy<T>(stored: T[] | undefined, key: (item: T) => string) {
  return new Map((stored ?? []).map((item) => [key(item), item]));
}

/**
 * A relation's note: one for both sides (`note`), one per side (`notes`), or
 * — named neither — the note it has now.
 */
function relationNote(
  item: Record<string, unknown>,
  kept: RelationNote | undefined,
): RelationNote | undefined {
  if (item.notes !== undefined && item.notes !== null) {
    if (typeof item.notes !== 'object')
      fail('notes takes { this, other }: what each side says.');
    const notes = item.notes as Record<string, unknown>;
    const currentText =
      notes.this === undefined ? '' : text(notes.this, 'notes.this');
    const relatedText =
      notes.other === undefined ? '' : text(notes.other, 'notes.other');
    return currentText || relatedText
      ? { type: 'split', currentText, relatedText }
      : undefined;
  }
  if (item.note !== undefined)
    return item.note === null || item.note === ''
      ? undefined
      : { type: 'shared', text: text(item.note, 'note') };
  return kept;
}

/**
 * Relations as a client lists them. A relation named without its kind or
 * its note keeps the ones it has.
 */
export function relations(
  value: unknown,
  owner: EntityKey,
  stored?: RelationEditItem[],
): RelationEditItem[] {
  const kept = storedBy(
    stored,
    (item) => `${item.entityType}:${item.entityId}`,
  );
  return list(value, 'relations').map((item) => {
    const other = checkedRelationEnd(owner, item.ref);
    const before = kept.get(`${other.kind}:${other.id}`);
    const type =
      item.kind === undefined && before
        ? before.type
        : RELATION_TYPE_OF_WORD[item.kind as RelationWord];
    if (!type) fail('A relation is related, depends-on or affects.');
    const noteNow = relationNote(item, before?.note);
    return {
      entityType: other.kind,
      entityId: other.id,
      type,
      ...(noteNow ? { note: noteNow } : {}),
    } as RelationEditItem;
  });
}

function tags(value: unknown): TagEditItem[] {
  if (!Array.isArray(value)) fail('tags takes a list of tag names.');
  const refs = value.filter(
    (item) => typeof item === 'string' && item.startsWith('tag:'),
  );
  const { db, schema } = THEI_SERVER.useDb();
  const titles = new Map(
    refs.length
      ? db
          .select({ tagUuid: schema.tags.tagUuid, title: schema.tags.title })
          .from(schema.tags)
          .where(inArray(schema.tags.tagUuid, refs.map(tagIdOf)))
          .all()
          .map((row) => [`tag:${row.tagUuid}`, row.title])
      : [],
  );
  return value.map((item) => {
    const name = typeof item === 'string' ? (titles.get(item) ?? item) : '';
    if (!name.trim() || name.startsWith('tag:'))
      fail(
        `"${String(item)}" is not a tag name or a ref of a tag that exists.`,
      );
    return { title: name.trim() };
  });
}

/** Links by their address; one named without a note keeps the one it has. */
function links(
  value: unknown,
  stored?: ExternalLinkListItem[],
): ExternalLinkListItem[] {
  const kept = storedBy(stored, (item) => item.url);
  return list(value, 'links').map((item) => {
    const url = text(item.url, 'url');
    const before = kept.get(url);
    return {
      url,
      note:
        item.note === undefined
          ? (before?.note ?? '')
          : text(item.note, 'note'),
      isPrivate:
        item.private === undefined
          ? (before?.isPrivate ?? false)
          : flag(item.private, 'private'),
    };
  });
}

type ShowcaseFile = { assetUuid: string; caption?: string; isPrivate: boolean };
type OtherFile = ShowcaseFile & { title: string };

/** Files by their id; what an item leaves out stays as it is. */
function showcaseFiles(value: unknown, stored?: ShowcaseFile[]) {
  const kept = storedBy(stored, (item) => item.assetUuid);
  return list(value, 'showcaseFiles').map((item): ShowcaseFile => {
    const assetUuid =
      file(item.file, 'file') ?? fail('Each showcase file needs its file id.');
    const before = kept.get(assetUuid);
    return {
      assetUuid,
      caption:
        item.caption === undefined
          ? before?.caption
          : text(item.caption, 'caption'),
      isPrivate:
        item.private === undefined
          ? (before?.isPrivate ?? false)
          : flag(item.private, 'private'),
    };
  });
}

function otherFiles(value: unknown, stored?: OtherFile[]) {
  const kept = storedBy(stored, (item) => item.assetUuid);
  return list(value, 'files').map((item): OtherFile => {
    const assetUuid =
      file(item.file, 'file') ?? fail('Each file needs its file id.');
    const before = kept.get(assetUuid);
    return {
      assetUuid,
      title:
        item.title === undefined
          ? (before?.title ?? '')
          : text(item.title, 'title'),
      caption:
        item.caption === undefined
          ? before?.caption
          : text(item.caption, 'caption'),
      isPrivate:
        item.private === undefined
          ? (before?.isPrivate ?? false)
          : flag(item.private, 'private'),
    };
  });
}

/**
 * The fields of a form a list or a file stands in, as a client reads them —
 * exactly what it writes back: read_entity gives what an update action takes.
 */
export function formView(kind: FormKind, form: any): Record<string, unknown> {
  const fileId = (id: string | null | undefined) => id ?? null;
  const showcase = (items: ShowcaseFile[] | undefined) =>
    (items ?? []).map((item) => ({
      file: item.assetUuid,
      ...(item.caption ? { caption: item.caption } : {}),
      private: item.isPrivate,
    }));
  // The latest status lines, each with the id a change names.
  const statuses = (page: { items?: StatusHistoryItem[] } | undefined) =>
    (page?.items ?? [])
      .filter((item) => item.kind === 'regular' && item.text)
      .map((item) => ({ id: item.id, date: item.date, text: item.text }));
  const others = (items: OtherFile[] | undefined) =>
    (items ?? []).map((item) => ({
      file: item.assetUuid,
      title: item.title,
      ...(item.caption ? { caption: item.caption } : {}),
      private: item.isPrivate,
    }));
  const linkList = (
    items: (ExternalLinkListItem & { name?: string })[] | undefined,
  ) =>
    (items ?? []).map((item) => ({
      url: item.url,
      ...(item.name ? { name: item.name } : {}),
      ...(item.note ? { note: item.note } : {}),
      private: item.isPrivate,
    }));
  switch (kind) {
    case 'project':
      return {
        icon: fileId(form.iconAssetUuid),
        banner: fileId(form.bannerAssetUuid),
        showcaseFiles: showcase(form.showcaseAssets),
        files: others(form.otherAssets),
        links: linkList(form.externalLinks),
        statuses: statuses(form.statuses),
        ...(form.action?.enabled ? { actionText: form.action.text } : {}),
      };
    case 'event':
      return {
        banner: fileId(form.bannerAssetUuid),
        files: others(form.otherAssets),
        links: linkList(form.externalLinks),
      };
    case 'page':
    case 'tag':
      return { icon: fileId(form.iconAssetUuid) };
    case 'profile':
      return {
        banner: fileId(form.bannerAssetUuid),
        favicon: fileId(form.faviconAssetUuid),
        links: linkList(form.externalLinks),
        statuses: statuses(form.statuses),
      };
    default:
      return {};
  }
}

/** A section's fields laid over the section, or over a new one. */
async function sectionChanges(
  section: ProjectSectionItem,
  changes: Changes,
): Promise<ProjectSectionItem> {
  const next = { ...section };
  for (const [key, value] of Object.entries(changes)) {
    switch (key) {
      case 'id':
        break;
      case 'title':
        next.title = text(value, key);
        break;
      case 'summary':
        next.summary = text(value, key);
        break;
      case 'private':
        next.isPrivate = flag(value, key);
        break;
      case 'periods':
        next.periods = checkedPeriods(value);
        break;
      case 'body':
        next.content =
          (await markdown(value, section.content, key)) ??
          ({ data: { blocks: [] } } as unknown as ContentFieldModelValue);
        break;
      case 'banner':
        next.bannerAssetUuid = file(value, key);
        break;
      case 'slug':
        next.humanReadableSlug = text(value, key);
        break;
      case 'publicId':
        next.publicId = text(value, key);
        break;
      default:
        fail(
          `A section has no field "${key}"; its fields are ${FORM_FIELDS['project-section'].join(', ')}.`,
        );
    }
  }
  return next;
}

function newSection(title: string): ProjectSectionItem {
  return {
    title,
    summary: '',
    humanReadableSlug: THEI_SERVER.language.slugify(title),
    publicId: randomId(14),
    isPrivate: false,
    periods: [],
    content: { data: { blocks: [] } } as unknown as ContentFieldModelValue,
  };
}

export async function projectChanges(
  form: ProjectEditData,
  changes: Changes,
  key: EntityKey,
): Promise<ProjectEditData> {
  const next: ProjectEditData = { ...form };
  for (const [field, value] of Object.entries(changes)) {
    switch (field) {
      case 'title':
      case 'summary':
      case 'reminder':
        next[field] = text(value, field);
        break;
      case 'synonyms':
        next.synonyms = names(value, next.title);
        break;
      case 'access':
        next.access = checkedAccess(key.kind, value) as never;
        break;
      case 'showcase':
      case 'cv':
        next[field] = flag(value, field);
        break;
      case 'statuses':
        Object.assign(next, statusChanges(next as never, value));
        break;
      case 'actionText':
        if (!next.action) fail('The project has no button.');
        next.action = { ...next.action, text: text(value, field) };
        break;
      case 'slug':
        next.humanReadableSlug = text(value, field);
        break;
      case 'publicId':
        next.publicId = text(value, field);
        break;
      case 'icon':
        next.iconAssetUuid = file(value, field);
        break;
      case 'banner':
        next.bannerAssetUuid = file(value, field);
        break;
      case 'showcaseFiles':
        next.showcaseAssets = showcaseFiles(
          value,
          form.showcaseAssets as ShowcaseFile[],
        ) as never;
        break;
      case 'files':
        next.otherAssets = otherFiles(
          value,
          form.otherAssets as OtherFile[],
        ) as never;
        break;
      case 'links':
        next.externalLinks = links(value, form.externalLinks);
        break;
      case 'tags':
        next.tags = tags(value);
        break;
      case 'relations':
        next.relations = relations(value, key, form.relations);
        break;
      case 'description':
        next.descriptionContent = await markdown(
          value,
          form.descriptionContent,
          field,
        );
        break;
      case 'notes':
        next.notes = await markdown(value, form.notes, field);
        break;
      case 'sections': {
        // Over what the change made of them so far: an order given first stays.
        const current = [...(next.sections ?? form.sections ?? [])];
        for (const change of list(value, field)) {
          const id = change.id;
          if (id !== undefined) {
            const at = current.findIndex(
              (section) => section.sectionUuid === id,
            );
            if (at < 0) fail(`The project has no section ${String(id)}.`);
            current[at] = await sectionChanges(current[at]!, change);
          } else {
            if (typeof change.title !== 'string' || !change.title.trim())
              fail('A new section needs its title.');
            current.push(
              await sectionChanges(newSection(change.title), change),
            );
          }
        }
        next.sections = current;
        break;
      }
      case 'sectionOrder': {
        if (!Array.isArray(value))
          fail('sectionOrder takes the section ids in order.');
        const sections = next.sections ?? form.sections ?? [];
        const order = value.map(String);
        if (new Set(order).size !== order.length)
          fail('sectionOrder names each section once.');
        const ordered = order.map(
          (id) =>
            sections.find((section) => section.sectionUuid === id) ??
            fail(`The project has no section ${id}.`),
        );
        next.sections = [
          ...ordered,
          ...sections.filter(
            (section) => !order.includes(section.sectionUuid ?? ''),
          ),
        ];
        break;
      }
    }
  }
  return next;
}

export async function eventChanges(
  form: EventEditData,
  changes: Changes,
  key: EntityKey,
) {
  const next: EventEditData = { ...form };
  for (const [field, value] of Object.entries(changes)) {
    switch (field) {
      case 'title':
      case 'summary':
      case 'reminder':
        next[field] = text(value, field);
        break;
      case 'synonyms':
        next.synonyms = names(value, next.title);
        break;
      case 'access':
        next.access = checkedAccess(key.kind, value) as never;
        break;
      case 'slug':
        next.humanReadableSlug = text(value, field);
        break;
      case 'publicId':
        next.publicId = text(value, field);
        break;
      case 'periods':
        next.periods = checkedPeriods(value);
        break;
      case 'banner':
        next.bannerAssetUuid = file(value, field);
        break;
      case 'files':
        next.otherAssets = otherFiles(
          value,
          form.otherAssets as OtherFile[],
        ) as never;
        break;
      case 'links':
        next.externalLinks = links(value, form.externalLinks);
        break;
      case 'tags':
        next.tags = tags(value);
        break;
      case 'relations':
        next.relations = relations(value, key, form.relations);
        break;
      case 'body':
        next.content = (await markdown(value, form.content, field)) as never;
        break;
      case 'notes':
        next.notes = await markdown(value, form.notes, field);
        break;
    }
  }
  return next;
}

export async function diaryChanges(
  form: DiaryEditData,
  changes: Changes,
  key: EntityKey,
) {
  const next: DiaryEditData = { ...form };
  for (const [field, value] of Object.entries(changes)) {
    switch (field) {
      case 'date':
        next.date = text(value, field);
        break;
      case 'access':
        next.access = checkedAccess(key.kind, value) as never;
        break;
      case 'reminder':
        next.reminder = text(value, field);
        break;
      case 'body':
        next.content = (await markdown(value, form.content, field)) as never;
        break;
      case 'notes':
        next.notes = await markdown(value, form.notes, field);
        break;
      case 'relations':
        next.relations = relations(value, key, form.relations);
        break;
    }
  }
  return next;
}

export async function pageChanges(form: PageEditData, changes: Changes) {
  const next: PageEditData = { ...form };
  for (const [field, value] of Object.entries(changes)) {
    switch (field) {
      case 'title':
      case 'summary':
      case 'reminder':
        (next as Record<string, unknown>)[field] = text(value, field);
        break;
      case 'synonyms':
        next.synonyms = names(value, next.title);
        break;
      case 'access':
        next.access = checkedAccess('page', value) as never;
        break;
      case 'slug':
        next.slug = text(value, field);
        break;
      case 'icon':
        next.iconAssetUuid = file(value, field);
        break;
      case 'body':
        next.content = (await markdown(value, form.content, field)) as never;
        break;
      case 'notes':
        next.notes = await markdown(value, form.notes, field);
        break;
    }
  }
  return next;
}

/** Other names, as the entity titled `title` keeps them. */
function names(value: unknown, title: string): string[] {
  const synonyms = normalizeSynonyms(value, title);
  if (typeof synonyms === 'string') fail(`synonyms: ${synonyms}.`);
  return synonyms;
}

export function tagChanges(form: TagEditData, changes: Changes) {
  const next: TagEditData = { ...form };
  for (const [field, value] of Object.entries(changes)) {
    switch (field) {
      case 'title':
      case 'description':
      case 'slug':
      case 'publicId':
        (next as Record<string, unknown>)[field] = text(value, field);
        break;
      case 'synonyms':
        next.synonyms = names(value, next.title);
        break;
      case 'icon':
        next.iconAssetUuid = file(value, field);
        break;
    }
  }
  return next;
}

export async function profileChanges(form: ProfileEditData, changes: Changes) {
  const next: ProfileEditData = { ...form };
  for (const [field, value] of Object.entries(changes)) {
    switch (field) {
      case 'displayName':
      case 'slogan':
      case 'nickname':
        next[field] = text(value, field);
        break;
      case 'statuses':
        Object.assign(next, statusChanges(next as never, value));
        break;
      case 'about':
        next.aboutContent = await markdown(value, form.aboutContent, field);
        break;
      case 'banner':
        next.bannerAssetUuid = file(value, field) ?? null;
        break;
      case 'favicon':
        next.faviconAssetUuid = file(value, field) ?? null;
        break;
      case 'links': {
        const named = storedBy(form.externalLinks, (item) => item.url);
        next.externalLinks = links(value, form.externalLinks).map((link) => {
          const item = list(value, field).find(
            (listed) => listed.url === link.url,
          )!;
          return {
            ...link,
            name:
              item.name === undefined
                ? (named.get(link.url)?.name ?? '')
                : text(item.name, 'name'),
          };
        });
        break;
      }
    }
  }
  return next;
}
