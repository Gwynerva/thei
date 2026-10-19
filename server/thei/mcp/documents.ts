import { and, eq, inArray } from 'drizzle-orm';
import {
  contentPlainText,
  type ContentOutputData,
} from '#layers/thei/shared/content';
import type { Period } from '#layers/thei/shared/period';
import { saysLittle, textWords } from '#layers/thei/shared/search/match';
import { readPeriodsOf } from '../periods';
import { PROFILE_ID } from '#layers/thei/shared/profile';
import {
  ENTITY_KINDS,
  ENTITY_TEXT_SLOTS,
  refOf,
  type EntityKind,
} from '../entity-kinds';

/**
 * Every entity of the site as one searchable, listable record: its ref, what
 * to call it, when it happened, all the words it holds — private notes
 * included, since a token reads as the owner — and a digest of them: its
 * opening words and the words that set it apart from the rest of the
 * archive.
 *
 * The digest is what lets a model go over hundreds of entities without
 * reading each in full, and it costs nothing: no model writes it. The whole
 * set is built once and kept until the content changes — the same writes
 * that drop the search index drop this one (`invalidateMcpDocuments`).
 */
export interface McpDocument {
  ref: string;
  kind: EntityKind;
  /** The stored id: a uuid, or `profile` — a diary entry's ref names its day. */
  id: string;
  title: string;
  summary: string;
  access?: string;
  /** A diary entry's day. */
  date?: string;
  periods?: Period[];
  /** The project a section belongs to. */
  project?: string;
  updatedAt: number;
  /** Every word the entity holds, texts and fields together. */
  text: string;
  /** The opening words of its main text: a diary entry's first sentences. */
  lead: string;
  /** Words frequent in it and rare elsewhere, as it writes them. */
  keywords: string[];
  /** How many words its texts hold. */
  words: number;
  relationCount?: number;
  tagRefs?: string[];
  /** Other names it is found by: a tag's, a project's, an event's, a page's. */
  synonyms?: string[];
  /** The entities a tag is on. */
  usedBy?: string[];
}

/** How long an opening may run, in characters. */
const LEAD_LENGTH = 240;
/** Keywords told of each entity. */
const KEYWORDS = 8;
/** A word in more than this share of the archive sets nothing apart. */
const COMMON_SHARE = 0.25;

type OwnerText = { slot: string; text: string };

function textsByOwner(
  kind: EntityKind,
  ids: string[],
): Map<string, OwnerText[]> {
  const byOwner = new Map<string, OwnerText[]>();
  const slots = ENTITY_TEXT_SLOTS[kind].map((text) => text.slot);
  if (!ids.length || !slots.length) return byOwner;
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select({
      ownerId: schema.content.ownerId,
      slot: schema.content.slot,
      data: schema.content.data,
    })
    .from(schema.content)
    .where(
      and(
        eq(schema.content.ownerType, kind as never),
        inArray(schema.content.slot, slots),
      ),
    )
    .all();
  const wanted = new Set(ids);
  for (const row of rows) {
    if (!wanted.has(row.ownerId)) continue;
    const list = byOwner.get(row.ownerId) ?? [];
    list.push({
      slot: row.slot,
      text: contentPlainText(row.data as ContentOutputData),
    });
    byOwner.set(row.ownerId, list);
  }
  return byOwner;
}

/** All of an entity's texts, its main one first. */
function textsOf(kind: EntityKind, texts: OwnerText[] | undefined) {
  const main = ENTITY_TEXT_SLOTS[kind][0]?.slot;
  return [...(texts ?? [])].sort(
    (a, b) => Number(b.slot === main) - Number(a.slot === main),
  );
}

/** The opening of a text, cut at a sentence where it can be. */
function leadOf(text: string | undefined): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= LEAD_LENGTH) return flat;
  const cut = flat.slice(0, LEAD_LENGTH);
  const sentence = cut.search(/[.!?…](?=\s)[^.!?…]*$/);
  return sentence > LEAD_LENGTH / 3
    ? cut.slice(0, sentence + 1)
    : `${cut.replace(/\s+\S*$/, '')}…`;
}

function relationCounts(): Map<string, number> {
  const { db, schema } = THEI_SERVER.useDb();
  const counts = new Map<string, number>();
  for (const row of db
    .select({
      firstType: schema.entityRelations.firstType,
      firstId: schema.entityRelations.firstId,
      secondType: schema.entityRelations.secondType,
      secondId: schema.entityRelations.secondId,
    })
    .from(schema.entityRelations)
    .all()) {
    for (const key of [
      `${row.firstType}:${row.firstId}`,
      `${row.secondType}:${row.secondId}`,
    ])
      counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function tagUsages() {
  const { db, schema } = THEI_SERVER.useDb();
  const byContainer = new Map<string, string[]>();
  const byTag = new Map<string, string[]>();
  for (const row of db.select().from(schema.tagUsages).all()) {
    const container = refOf({
      kind: row.containerType as EntityKind,
      id: row.containerId,
    });
    const tag = refOf({ kind: 'tag', id: row.tagUuid });
    byContainer.set(`${row.containerType}:${row.containerId}`, [
      ...(byContainer.get(`${row.containerType}:${row.containerId}`) ?? []),
      tag,
    ]);
    byTag.set(row.tagUuid, [...(byTag.get(row.tagUuid) ?? []), container]);
  }
  return { byContainer, byTag };
}

type Draft = Omit<McpDocument, 'lead' | 'keywords' | 'words'> & {
  main?: string;
};

function buildDocuments(): McpDocument[] {
  const { db, schema } = THEI_SERVER.useDb();
  const drafts: Draft[] = [];
  const relations = relationCounts();
  const tags = tagUsages();
  const join = (...parts: (string | undefined)[]) =>
    parts.filter(Boolean).join('\n');
  const owned = (
    kind: EntityKind,
    texts: Map<string, OwnerText[]>,
    id: string,
  ) => textsOf(kind, texts.get(id));

  {
    const rows = db.select().from(schema.projects).all();
    const texts = textsByOwner(
      'project',
      rows.map((row) => row.projectUuid),
    );
    // A project has no dates of its own: it lasts as its stages do.
    const sections = db
      .select({
        sectionUuid: schema.projectContentSections.sectionUuid,
        projectUuid: schema.projectContentSections.projectUuid,
      })
      .from(schema.projectContentSections)
      .all();
    const sectionPeriods = readPeriodsOf(
      db,
      schema,
      'project-section',
      sections.map((section) => section.sectionUuid),
    );
    const projectPeriods = new Map<string, Period[]>();
    for (const section of sections) {
      const list = projectPeriods.get(section.projectUuid) ?? [];
      list.push(...(sectionPeriods.get(section.sectionUuid) ?? []));
      projectPeriods.set(section.projectUuid, list);
    }
    for (const row of rows) {
      const own = owned('project', texts, row.projectUuid);
      drafts.push({
        ref: `project:${row.projectUuid}`,
        id: row.projectUuid,
        kind: 'project',
        title: row.title,
        summary: row.summary,
        access: row.access,
        periods: projectPeriods.get(row.projectUuid) ?? [],
        updatedAt: row.updatedAt,
        main: own[0]?.text,
        text: join(
          row.title,
          row.summary,
          ...row.synonyms,
          ...own.map((text) => text.text),
        ),
        synonyms: row.synonyms,
        relationCount: relations.get(`project:${row.projectUuid}`) ?? 0,
        tagRefs: tags.byContainer.get(`project:${row.projectUuid}`) ?? [],
      });
    }
  }

  {
    const rows = db.select().from(schema.projectContentSections).all();
    const ids = rows.map((row) => row.sectionUuid);
    const texts = textsByOwner('project-section', ids);
    const periods = readPeriodsOf(db, schema, 'project-section', ids);
    for (const row of rows) {
      const own = owned('project-section', texts, row.sectionUuid);
      drafts.push({
        ref: `project-section:${row.sectionUuid}`,
        id: row.sectionUuid,
        kind: 'project-section',
        title: row.title,
        summary: row.summary,
        access: row.isPrivate ? 'private' : undefined,
        periods: periods.get(row.sectionUuid) ?? [],
        project: `project:${row.projectUuid}`,
        updatedAt: row.updatedAt,
        main: own[0]?.text,
        text: join(row.title, row.summary, ...own.map((text) => text.text)),
      });
    }
  }

  {
    const rows = db.select().from(schema.events).all();
    const ids = rows.map((row) => row.eventUuid);
    const texts = textsByOwner('event', ids);
    const periods = readPeriodsOf(db, schema, 'event', ids);
    for (const row of rows) {
      const own = owned('event', texts, row.eventUuid);
      drafts.push({
        ref: `event:${row.eventUuid}`,
        id: row.eventUuid,
        kind: 'event',
        title: row.title,
        summary: row.summary,
        access: row.access,
        periods: periods.get(row.eventUuid) ?? [],
        updatedAt: row.updatedAt,
        main: own[0]?.text,
        text: join(
          row.title,
          row.summary,
          ...row.synonyms,
          ...own.map((text) => text.text),
        ),
        synonyms: row.synonyms,
        relationCount: relations.get(`event:${row.eventUuid}`) ?? 0,
        tagRefs: tags.byContainer.get(`event:${row.eventUuid}`) ?? [],
      });
    }
  }

  {
    const rows = db.select().from(schema.diaryEntries).all();
    const texts = textsByOwner(
      'diary-entry',
      rows.map((row) => row.diaryUuid),
    );
    for (const row of rows) {
      const own = owned('diary-entry', texts, row.diaryUuid);
      drafts.push({
        ref: `diary-entry:${row.date}`,
        id: row.diaryUuid,
        kind: 'diary-entry',
        title: row.date,
        summary: '',
        access: row.access,
        date: row.date,
        updatedAt: row.updatedAt,
        main: own[0]?.text,
        text: join(...own.map((text) => text.text)),
        relationCount: relations.get(`diary-entry:${row.diaryUuid}`) ?? 0,
      });
    }
  }

  {
    const rows = db.select().from(schema.pages).all();
    const texts = textsByOwner(
      'page',
      rows.map((row) => row.pageUuid),
    );
    for (const row of rows) {
      const own = owned('page', texts, row.pageUuid);
      drafts.push({
        ref: `page:${row.pageUuid}`,
        id: row.pageUuid,
        kind: 'page',
        title: row.title,
        summary: row.summary,
        access: row.access,
        updatedAt: row.updatedAt,
        main: own[0]?.text,
        text: join(
          row.title,
          row.summary,
          ...row.synonyms,
          ...own.map((text) => text.text),
        ),
        synonyms: row.synonyms,
      });
    }
  }

  for (const row of db.select().from(schema.tags).all())
    drafts.push({
      ref: `tag:${row.tagUuid}`,
      id: row.tagUuid,
      kind: 'tag',
      title: row.title,
      summary: row.description,
      updatedAt: row.updatedAt,
      text: join(row.title, row.description, ...(row.synonyms ?? [])),
      synonyms: row.synonyms ?? [],
      usedBy: tags.byTag.get(row.tagUuid) ?? [],
    });

  {
    const row = db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.profileId, PROFILE_ID))
      .get();
    if (row) {
      const own = owned(
        'profile',
        textsByOwner('profile', [PROFILE_ID]),
        PROFILE_ID,
      );
      drafts.push({
        ref: 'profile',
        id: PROFILE_ID,
        kind: 'profile',
        title: row.displayName,
        summary: row.slogan,
        updatedAt: row.updatedAt,
        main: own[0]?.text,
        text: join(
          row.displayName,
          row.slogan,
          ...own.map((text) => text.text),
        ),
      });
    }
  }

  return withDigests(drafts);
}

/**
 * Each record's opening words and keywords: the words it uses most that few
 * others use — tf·idf over stems, so every form of a word counts as one, and
 * told in the form the record itself uses most.
 */
function withDigests(drafts: Draft[]): McpDocument[] {
  const wordsOf = drafts.map((draft) => textWords(draft.text));
  const tokensOf = wordsOf.map((words) => words.map(({ word }) => word));
  const documentFrequency = new Map<string, number>();
  const stemsOf = wordsOf.map((words) => {
    const stems = words.map(({ word, term }) => (saysLittle(word) ? '' : term));
    for (const stem of new Set(stems))
      if (stem)
        documentFrequency.set(stem, (documentFrequency.get(stem) ?? 0) + 1);
    return stems;
  });
  const total = Math.max(drafts.length, 1);
  return drafts.map(({ main, ...draft }, index) => {
    const tokens = tokensOf[index]!;
    const stems = stemsOf[index]!;
    const counts = new Map<string, number>();
    const forms = new Map<string, Map<string, number>>();
    stems.forEach((stem, at) => {
      if (!stem) return;
      counts.set(stem, (counts.get(stem) ?? 0) + 1);
      const byForm = forms.get(stem) ?? new Map<string, number>();
      byForm.set(tokens[at]!, (byForm.get(tokens[at]!) ?? 0) + 1);
      forms.set(stem, byForm);
    });
    const keywords = [...counts]
      .filter(
        ([stem]) => (documentFrequency.get(stem) ?? 0) / total <= COMMON_SHARE,
      )
      .map(([stem, count]) => ({
        stem,
        score: count * Math.log(total / (documentFrequency.get(stem) ?? 1)),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, KEYWORDS)
      .map(
        (item) => [...forms.get(item.stem)!].sort((a, b) => b[1] - a[1])[0]![0],
      );
    return {
      ...draft,
      lead: leadOf(main),
      keywords,
      words: tokens.length,
    };
  });
}

let cached: McpDocument[] | undefined;
/** The database the records were built from: another one builds anew. */
let cachedFrom: unknown;

/** The records of some kinds, built once and kept until the content changes. */
export function loadDocuments(
  kinds: readonly EntityKind[] = ENTITY_KINDS,
): McpDocument[] {
  const { db } = THEI_SERVER.useDb();
  if (cachedFrom !== db) cached = undefined;
  cachedFrom = db;
  cached ??= buildDocuments();
  const wanted = new Set(kinds);
  return cached.filter((document) => wanted.has(document.kind));
}

/** Drops the records: called after every write of content. */
export function invalidateMcpDocuments() {
  cached = undefined;
}

/** Whether a record falls on or touches the days between two dates. */
export function documentTouches(
  document: McpDocument,
  from: string | undefined,
  to: string | undefined,
): boolean {
  if (!from && !to) return true;
  const start = from ?? '0000-01-01';
  const end = to ?? '9999-12-31';
  if (document.date) return document.date >= start && document.date <= end;
  if (document.periods?.length)
    return document.periods.some(
      (period) => period.startDate <= end && period.endDate >= start,
    );
  return false;
}

/** A record's digest in one line or two: what a model reads before the whole. */
export function digestLine(document: McpDocument, when?: string): string {
  const head = [
    `- ${document.ref} — ${document.title}`,
    when ? ` (${when})` : '',
    document.access && document.access !== 'public'
      ? ` [${document.access}]`
      : '',
    ` · ${document.words} words`,
  ].join('');
  const body = [
    document.summary,
    document.lead && document.lead !== document.summary ? document.lead : '',
  ]
    .filter(Boolean)
    .join(' — ');
  const keywords = document.keywords.length
    ? `keywords: ${document.keywords.join(', ')}`
    : '';
  return [head, body && `  ${body}`, keywords && `  ${keywords}`]
    .filter(Boolean)
    .join('\n');
}
