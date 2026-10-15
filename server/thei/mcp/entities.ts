import { and, asc, eq, inArray } from 'drizzle-orm';
import type {
  ContentOutputData,
  ContentSlot,
} from '#layers/thei/shared/content';
import {
  contentEntityReference,
  contentInlineLinksFromData,
  type ContentEntityType,
} from '#layers/thei/shared/content-link';
import { contentToEditMarkdown } from '#layers/thei/shared/content-edit-markdown/serialize';
import { buildDiaryUrl } from '#layers/thei/shared/diary-url';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { buildPageUrl } from '#layers/thei/shared/page-url';
import type { Period } from '#layers/thei/shared/period';
import {
  buildProjectSectionUrl,
  buildProjectUrl,
} from '#layers/thei/shared/project-url';
import {
  RELATION_WORD_OF_TYPE,
  type RelationNote,
  type RelationWord,
} from '#layers/thei/shared/relation';
import { buildTagUrl } from '#layers/thei/shared/tag-url';
import { readPeriods, readPeriodsOf } from '../periods';
import { PROFILE_ID } from '#layers/thei/shared/profile';
import {
  ENTITY_KINDS,
  ENTITY_TEXT_SLOTS,
  entityFace,
  entityFaces,
  findEntity,
  parseRef,
  refOf,
  type EntityKey,
  type EntityKind,
} from '../entity-kinds';
import { loadRelationTargets, readRelationRows } from '../relations';
import { siteUrl } from '../site-url';
import type { McpCallContext } from './context';
import { McpToolError } from './result';
import { aboutText } from './text-about';
import { formView, type FormKind } from '../ai/forms/changes';
import { loadForm } from '../ai/forms/load';

/**
 * Everything on the site as an MCP client refers to it and reads it. What a
 * kind is and how it is named is the registry's (`entity-kinds.ts`); this is
 * how a model reads it. Reading is always as the owner: the token speaks for
 * them.
 */

/** The entity a ref names, or a refusal the model can read. */
export function resolveRef(ref: unknown): EntityKey {
  if (typeof ref !== 'string' || !ref.trim())
    throw new McpToolError('A ref is needed, such as project:<id>.');
  const value = ref.trim();
  if (!parseRef(value))
    throw new McpToolError(
      `Not a ref: "${value}". Refs look like ${ENTITY_KINDS.filter((k) => k !== 'profile').join(':<id>, ')}:<id> or profile; a diary entry is diary-entry:YYYY-MM-DD.`,
    );
  const key = findEntity(value);
  if (key) return key;
  const day = /^diary-entry:(\d{4}-\d{2}-\d{2})$/.exec(value)?.[1];
  throw new McpToolError(
    day
      ? `There is no diary entry on ${day}.`
      : `Nothing found for ${value}: it may have been deleted, or the id is mistyped. Find it again with search_archive or list_entities.`,
  );
}

export interface McpText {
  name: string;
  /** What the text is and who reads it, for the model to know what it holds. */
  about: string;
  /** Only the owner sees it, whatever the entity's access. */
  private: boolean;
  /** Changes whenever the text is saved; a write names the one it read. */
  version: number | null;
  markdown: string;
}

export interface McpRelation {
  ref: string;
  title: string;
  /** Read from this entity's side. */
  kind: RelationWord;
  note?: RelationNote;
}

export interface McpLinkedEntity {
  ref: string;
  title: string;
  /** Linked in the text; whether a relation joins the two as well. */
  related: boolean;
}

export interface McpEntityView {
  ref: string;
  kind: EntityKind;
  title: string;
  /** Changes whenever the entity's own fields are saved. */
  version: number;
  fields: Record<string, unknown>;
  texts: McpText[];
  periods?: Period[];
  tags?: { ref: string; title: string }[];
  relations?: McpRelation[];
  linkedInText?: McpLinkedEntity[];
  sections?: {
    ref: string;
    title: string;
    summary: string;
    isPrivate: boolean;
    periods: Period[];
    hasBody: boolean;
  }[];
  project?: { ref: string; title: string };
  /** A section with dates: its place among the project's stages, in time. */
  stage?: { index: number; count: number };
  urls: { admin: string; public?: string };
}

function readText(
  ownerType: EntityKind,
  ownerId: string,
  name: string,
  slot: ContentSlot,
  isPrivate: boolean,
): McpText & { data: ContentOutputData | null } {
  const { db, schema } = THEI_SERVER.useDb();
  const row = db
    .select()
    .from(schema.content)
    .where(
      and(
        eq(schema.content.ownerType, ownerType as never),
        eq(schema.content.ownerId, ownerId),
        eq(schema.content.slot, slot),
      ),
    )
    .get();
  const data = (row?.data as ContentOutputData | undefined) ?? null;
  return {
    name,
    about: '',
    private: isPrivate,
    version: row?.updatedAt ?? null,
    markdown: data ? contentToEditMarkdown(data) : '',
    data,
  };
}

function readTexts(key: EntityKey) {
  return ENTITY_TEXT_SLOTS[key.kind].map((text) =>
    readText(key.kind, key.id, text.name, text.slot, text.private),
  );
}

function tagsOf(containerType: 'project' | 'event', containerId: string) {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select({ id: schema.tags.tagUuid, title: schema.tags.title })
    .from(schema.tagUsages)
    .innerJoin(schema.tags, eq(schema.tags.tagUuid, schema.tagUsages.tagUuid))
    .where(
      and(
        eq(schema.tagUsages.containerType, containerType),
        eq(schema.tagUsages.containerId, containerId),
      ),
    )
    .orderBy(asc(schema.tagUsages.sortOrder))
    .all()
    .map((tag) => ({
      ref: refOf({ kind: 'tag', id: tag.id }),
      title: tag.title,
    }));
}

async function relationsOf(
  type: 'project' | 'event' | 'diary-entry',
  id: string,
): Promise<McpRelation[]> {
  const rows = readRelationRows({ type, id });
  const targets = await loadRelationTargets(rows.map((row) => row.other));
  return rows.flatMap((row) => {
    const target = targets.get(`${row.other.type}:${row.other.id}`);
    if (!target) return [];
    return [
      {
        ref: refOf({
          kind: row.other.type,
          id: row.other.id,
          date: target.date,
        }),
        title: target.title,
        kind: RELATION_WORD_OF_TYPE[row.type],
        ...(row.note ? { note: row.note } : {}),
      },
    ];
  });
}

/** Titles for entities linked from texts, as refs a client can follow. */
export async function describeEntityLinks(
  links: { entityType: ContentEntityType; entityId: string }[],
): Promise<Map<string, { ref: string; title: string }>> {
  const faces = entityFaces(
    links.map((link) => ({ kind: link.entityType, id: link.entityId })),
  );
  return new Map(
    [...faces].map(([id, face]) => [id, { ref: face.ref, title: face.title }]),
  );
}

/** Entities the texts link to, inline or as cards, once each. */
function entityLinksIn(texts: { data: ContentOutputData | null }[]) {
  const seen = new Map<
    string,
    { entityType: ContentEntityType; entityId: string }
  >();
  for (const text of texts) {
    if (!text.data) continue;
    for (const link of contentInlineLinksFromData(text.data as never))
      if (link.kind === 'entity')
        seen.set(`${link.entityType}:${link.entityId}`, link);
    for (const block of text.data.blocks)
      if (block.type === 'entityLink') {
        const reference = contentEntityReference(
          (block.data as Record<string, unknown>).entityType,
          (block.data as Record<string, unknown>).entityId,
        );
        if (reference)
          seen.set(`${reference.entityType}:${reference.entityId}`, reference);
      }
  }
  return [...seen.values()];
}

async function linkedInText(
  texts: { data: ContentOutputData | null }[],
  relations: McpRelation[],
): Promise<McpLinkedEntity[]> {
  const links = entityLinksIn(texts);
  if (!links.length) return [];
  const described = await describeEntityLinks(links);
  const related = new Set(relations.map((relation) => relation.ref));
  return links.flatMap((link) => {
    const found = described.get(`${link.entityType}:${link.entityId}`);
    return found ? [{ ...found, related: related.has(found.ref) }] : [];
  });
}

function stripData<T extends { data: unknown }>(texts: T[]): Omit<T, 'data'>[] {
  return texts.map(({ data: _data, ...text }) => text);
}

/** One entity as the owner sees it, everything an AI client may need. */
export async function readEntity(
  key: EntityKey,
  context: McpCallContext,
): Promise<McpEntityView> {
  const view = await readEntityView(key, context);
  return {
    ...view,
    fields: { ...view.fields, ...(await editableFields(key)) },
    texts: view.texts.map((text) => ({
      ...text,
      about: aboutText(view, text),
    })),
  };
}

/**
 * The pictures, files and links of an entity as its form holds them — the
 * very shape an update action takes back, so what a client reads it can return
 * unchanged.
 */
async function editableFields(
  key: EntityKey,
): Promise<Record<string, unknown>> {
  const loaded = await loadForm(key).catch(() => undefined);
  if (!loaded) return {};
  if (key.kind !== 'project-section')
    return formView(key.kind as FormKind, loaded.form);
  const section = (loaded.form.sections ?? []).find(
    (item: { sectionUuid?: string }) => item.sectionUuid === key.id,
  );
  return section ? { banner: section.bannerAssetUuid ?? null } : {};
}

/** A section's place among the dated sections of its project, by first date. */
function stageOf(projectUuid: string, sectionUuid: string) {
  const { db, schema } = THEI_SERVER.useDb();
  const ids = db
    .select({ id: schema.projectContentSections.sectionUuid })
    .from(schema.projectContentSections)
    .where(eq(schema.projectContentSections.projectUuid, projectUuid))
    .all()
    .map((row) => row.id);
  const periods = readPeriodsOf(db, schema, 'project-section', ids);
  const stages = ids
    .map((id) => ({
      id,
      start: (periods.get(id) ?? [])
        .map((period) => period.startDate)
        .sort()[0],
    }))
    .filter((stage): stage is { id: string; start: string } =>
      Boolean(stage.start),
    )
    .sort((a, b) => a.start.localeCompare(b.start));
  const index = stages.findIndex((stage) => stage.id === sectionUuid);
  return index < 0 ? undefined : { index: index + 1, count: stages.length };
}

async function readEntityView(
  key: EntityKey,
  context: McpCallContext,
): Promise<McpEntityView> {
  const { db, schema } = THEI_SERVER.useDb();
  const url = (path: string) => siteUrl(context.event, path);
  const texts = readTexts(key);
  const admin = url(entityFace(key)?.path ?? '/admin/');

  switch (key.kind) {
    case 'project': {
      const row = db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.projectUuid, key.id))
        .get()!;
      const sectionRows = db
        .select()
        .from(schema.projectContentSections)
        .where(eq(schema.projectContentSections.projectUuid, key.id))
        .orderBy(asc(schema.projectContentSections.sortOrder))
        .all();
      const sectionPeriods = readPeriodsOf(
        db,
        schema,
        'project-section',
        sectionRows.map((section) => section.sectionUuid),
      );
      const bodies = new Set(
        sectionRows.length
          ? db
              .select({ ownerId: schema.content.ownerId })
              .from(schema.content)
              .where(
                and(
                  eq(schema.content.ownerType, 'project-section'),
                  inArray(
                    schema.content.ownerId,
                    sectionRows.map((section) => section.sectionUuid),
                  ),
                ),
              )
              .all()
              .map((content) => content.ownerId)
          : [],
      );
      const relations = await relationsOf('project', key.id);
      return {
        ref: refOf(key),
        kind: key.kind,
        title: row.title,
        version: row.updatedAt,
        fields: {
          title: row.title,
          summary: row.summary,
          access: row.access,
          showcase: row.showcase,
          cv: row.cv,
          reminder: row.reminder,
          slug: row.humanReadableSlug,
          publicId: row.publicId,
          createdAt: row.createdAt,
        },
        texts: stripData(texts),
        sections: sectionRows.map((section) => ({
          ref: refOf({ kind: 'project-section', id: section.sectionUuid }),
          title: section.title,
          summary: section.summary,
          isPrivate: section.isPrivate,
          periods: sectionPeriods.get(section.sectionUuid) ?? [],
          hasBody: bodies.has(section.sectionUuid),
        })),
        tags: tagsOf('project', key.id),
        relations,
        linkedInText: await linkedInText(texts, relations),
        urls: {
          admin,
          public: url(buildProjectUrl(row.humanReadableSlug, row.publicId)),
        },
      };
    }

    case 'project-section': {
      const row = db
        .select()
        .from(schema.projectContentSections)
        .where(eq(schema.projectContentSections.sectionUuid, key.id))
        .get()!;
      const project = db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.projectUuid, row.projectUuid))
        .get()!;
      return {
        ref: refOf(key),
        kind: key.kind,
        title: row.title,
        version: row.updatedAt,
        fields: {
          title: row.title,
          summary: row.summary,
          isPrivate: row.isPrivate,
          slug: row.humanReadableSlug,
          publicId: row.publicId,
        },
        texts: stripData(texts),
        periods: readPeriods(db, schema, 'project-section', key.id),
        project: {
          ref: refOf({ kind: 'project', id: project.projectUuid }),
          title: project.title,
        },
        stage: stageOf(project.projectUuid, key.id),
        linkedInText: await linkedInText(texts, []),
        urls: {
          admin,
          public: url(
            buildProjectSectionUrl(
              project.humanReadableSlug,
              project.publicId,
              row.humanReadableSlug,
              row.publicId,
            ),
          ),
        },
      };
    }

    case 'event': {
      const row = db
        .select()
        .from(schema.events)
        .where(eq(schema.events.eventUuid, key.id))
        .get()!;
      const relations = await relationsOf('event', key.id);
      return {
        ref: refOf(key),
        kind: key.kind,
        title: row.title,
        version: row.updatedAt,
        fields: {
          title: row.title,
          summary: row.summary,
          access: row.access,
          reminder: row.reminder,
          slug: row.humanReadableSlug,
          publicId: row.publicId,
          createdAt: row.createdAt,
        },
        texts: stripData(texts),
        periods: readPeriods(db, schema, 'event', key.id),
        tags: tagsOf('event', key.id),
        relations,
        linkedInText: await linkedInText(texts, relations),
        urls: {
          admin,
          public: url(buildEventUrl(row.humanReadableSlug, row.publicId)),
        },
      };
    }

    case 'diary-entry': {
      const row = db
        .select()
        .from(schema.diaryEntries)
        .where(eq(schema.diaryEntries.diaryUuid, key.id))
        .get()!;
      const relations = await relationsOf('diary-entry', key.id);
      return {
        ref: refOf(key),
        kind: key.kind,
        title: row.date,
        version: row.updatedAt,
        fields: {
          date: row.date,
          access: row.access,
          reminder: row.reminder,
          createdAt: row.createdAt,
        },
        texts: stripData(texts),
        relations,
        linkedInText: await linkedInText(texts, relations),
        urls: {
          admin,
          public: url(buildDiaryUrl(row.date)),
        },
      };
    }

    case 'page': {
      const row = db
        .select()
        .from(schema.pages)
        .where(eq(schema.pages.pageUuid, key.id))
        .get()!;
      return {
        ref: refOf(key),
        kind: key.kind,
        title: row.title,
        version: row.updatedAt,
        fields: {
          title: row.title,
          summary: row.summary,
          access: row.access,
          reminder: row.reminder,
          slug: row.slug,
        },
        texts: stripData(texts),
        linkedInText: await linkedInText(texts, []),
        urls: {
          admin,
          public: url(buildPageUrl(row.slug)),
        },
      };
    }

    case 'tag': {
      const row = db
        .select()
        .from(schema.tags)
        .where(eq(schema.tags.tagUuid, key.id))
        .get()!;
      const usages = db
        .select()
        .from(schema.tagUsages)
        .where(eq(schema.tagUsages.tagUuid, key.id))
        .all();
      const described = await loadRelationTargets(
        usages.map((usage) => ({
          type: usage.containerType,
          id: usage.containerId,
        })),
      );
      return {
        ref: refOf(key),
        kind: key.kind,
        title: row.title,
        version: row.updatedAt,
        fields: {
          title: row.title,
          description: row.description,
          synonyms: row.synonyms ?? [],
          slug: row.slug,
          publicId: row.publicId,
          usedBy: usages.flatMap((usage) => {
            const target = described.get(
              `${usage.containerType}:${usage.containerId}`,
            );
            return target
              ? [
                  {
                    ref: refOf({
                      kind: usage.containerType,
                      id: usage.containerId,
                    }),
                    title: target.title,
                  },
                ]
              : [];
          }),
        },
        texts: [],
        urls: {
          admin,
          public: url(buildTagUrl(row.slug, row.publicId)),
        },
      };
    }

    case 'profile': {
      const row = db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.profileId, PROFILE_ID))
        .get()!;
      return {
        ref: 'profile',
        kind: key.kind,
        title: row.displayName,
        version: row.updatedAt,
        fields: {
          displayName: row.displayName,
          slogan: row.slogan,
          nickname: row.nickname,
          birthDate: row.birthDate,
        },
        texts: stripData(texts),
        linkedInText: await linkedInText(texts, []),
        urls: { admin, public: url('/') },
      };
    }
  }
}
