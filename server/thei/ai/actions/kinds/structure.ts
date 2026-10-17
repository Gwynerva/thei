import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ProjectEditData } from '#layers/thei/shared/admin/project';
import type { EventEditData } from '#layers/thei/shared/event';
import type { DiaryEditData } from '#layers/thei/shared/diary';
import type { PageEditData } from '#layers/thei/shared/page';
import type { TagEditData } from '#layers/thei/shared/tag';
import { refuse as fail } from '../../../entity-patch/text';
import { createProject } from '../../../projects/create';
import { createEvent } from '../../../events/create';
import { createDiaryEntryFromForm } from '../../../diary/create';
import { createPage } from '../../../pages/create';
import { createTag } from '../../../tags-edit/create';
import {
  entityFace,
  entityVersion,
  findEntity,
  formOwnerVersion,
  type EntityKey,
} from '../../../entity-kinds';
import {
  assertKnown,
  diaryChanges,
  eventChanges,
  pageChanges,
  projectChanges,
  tagChanges,
  type Changes,
} from '../../forms/changes';
import { removeEntity, startingForm } from '../../forms/entities';
import {
  CHANGED_SINCE,
  loadForm,
  saved,
  type LoadedForm,
} from '../../forms/load';
import { assetIdsIn } from '../values';
import type { AiActionKindDef, PartStateRow } from '../types';

/**
 * Actions that make an entity or delete one. A new entity may come with
 * parts of its own — a project's sections, tags, relations — each of which
 * the owner may leave out; they dim when the entity itself is unticked. A
 * deletion is final, and never the model's sure call.
 */

const CREATED_KINDS = [
  'project',
  'project-section',
  'event',
  'diary-entry',
  'page',
  'tag',
] as const;
type CreatedKind = (typeof CREATED_KINDS)[number];

/** The lists of a new entity's fields the owner decides item by item. */
const PART_LISTS = ['sections', 'tags', 'relations'] as const;

/** The parts of a new entity, by the id the owner decides them under. */
function createPartIds(fields: Changes): string[] {
  return PART_LISTS.flatMap((list) =>
    Array.isArray(fields[list])
      ? (fields[list] as unknown[]).map((_, index) => `${list}:${index}`)
      : [],
  );
}

/** The fields as the owner left them: the parts they unticked gone. */
function fieldsDecided(fields: Changes, states: Map<string, string>): Changes {
  const next = { ...fields };
  for (const list of PART_LISTS)
    if (Array.isArray(next[list]))
      next[list] = (next[list] as unknown[]).filter(
        (_, index) => states.get(`${list}:${index}`) !== 'kept',
      );
  return next;
}

function titleOf(entity: CreatedKind, fields: Changes): string {
  if (entity === 'diary-entry')
    return typeof fields.date === 'string' ? fields.date : '';
  return typeof fields.title === 'string'
    ? fields.title.replace(/\s+/g, ' ').trim()
    : '';
}

/** The form a new entity would be saved with: what checks it now. */
async function newForm(
  entity: CreatedKind,
  fields: Changes,
  project: EntityKey | undefined,
) {
  const title = titleOf(entity, fields);
  const none = { kind: entity, id: '' } as EntityKey;
  switch (entity) {
    case 'project':
      if (!title) fail('A project needs its title.');
      return projectChanges(
        startingForm(entity, title) as ProjectEditData,
        fields,
        none,
      );
    case 'project-section': {
      if (!project)
        fail('A section belongs to a project: name it as the target.');
      if (!title) fail('A section needs its title.');
      const loaded = await loadForm(project);
      const next = await projectChanges(
        loaded.form,
        { sections: [fields] },
        project,
      );
      return { loaded, next };
    }
    case 'event':
      if (!title) fail('An event needs its title.');
      return eventChanges(
        startingForm(entity, title) as EventEditData,
        fields,
        none,
      );
    case 'diary-entry': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(title))
        fail('A diary entry needs its day: date, YYYY-MM-DD.');
      if (findEntity(`diary-entry:${title}`))
        fail(
          `There is an entry for ${title} already: one a day. Add to it instead.`,
        );
      const base = {
        date: title,
        access: 'private',
        content: null,
        relations: [],
        reminder: '',
        notes: null,
      } as unknown as DiaryEditData;
      return diaryChanges(base, fields, none);
    }
    case 'page':
      if (!title) fail('A page needs its title.');
      return pageChanges(startingForm(entity, title) as PageEditData, fields);
    case 'tag':
      if (!title) fail('A tag needs its title.');
      return tagChanges(startingForm(entity, title) as TagEditData, fields);
  }
}

export const createAction: AiActionKindDef<'create'> = {
  kind: 'create',
  reference:
    'A new entity, private until the owner shows it: entity — project, project-section, event, diary-entry, page or tag — and fields as update names them. It has no target, but for a section, which names its project as the target. A project’s sections, tags and relations come in its fields, each a part the owner may leave out. A diary entry needs its day (date) and a body: one a day.',
  schema: z.object({
    entity: z.enum(CREATED_KINDS),
    fields: z.record(z.string(), z.unknown()),
  }),
  // Only a section has a target: its project.
  targets: ['project'],
  async prepare(key, input) {
    const entity = input.entity as CreatedKind;
    const fields = input.fields as Changes;
    if (entity === 'project-section') {
      if (key?.kind !== 'project')
        fail('A section belongs to a project: name it as the target.');
    } else if (key) fail(`A new ${entity} has no target.`);
    if (entity === 'project' && 'sectionOrder' in fields)
      fail('A new project takes its sections in the order given.');
    assertKnown(entity, fields);
    // Checked as it would be saved, so a mistake shows now.
    await newForm(entity, fields, key);
    const parts = createPartIds(fields);
    return {
      payload: { kind: 'create', entity, fields },
      base: null,
      dropped: [],
      assetUuids: [...assetIdsIn(fields)],
      parts,
    };
  },
  identity: (payload) => [
    payload.entity,
    titleOf(payload.entity, payload.fields),
  ],
  async apply(key, row, context, write) {
    const payload = row.payload as { entity: CreatedKind; fields: Changes };
    const ids = createPartIds(payload.fields);
    const states = new Map<string, string>(
      ids.map((id) => [id, context.parts?.[id] ?? 'accepted']),
    );
    const fields = fieldsDecided(payload.fields, states);
    const parts: PartStateRow[] = ids.map((id) => ({
      id,
      state: states.get(id) === 'kept' ? 'kept' : 'applied',
    }));
    const outcome = parts.length ? { parts } : undefined;
    let created: EntityKey | undefined;
    const onCreate =
      (kind: EntityKey['kind'], versionBefore?: number) =>
      (tx: any, schema: any, id: string) => {
        created = { kind, id } as EntityKey;
        write(
          tx,
          schema,
          {
            kind: 'create',
            created,
            ...(versionBefore === undefined ? {} : { versionBefore }),
            versionAfter: formOwnerVersion(created, tx),
          },
          outcome,
        );
      };
    const form = await newForm(payload.entity, fields, key);
    switch (payload.entity) {
      case 'project':
        saved(
          await createProject(form as ProjectEditData, {
            onCreate: onCreate('project'),
          }),
        );
        break;
      case 'project-section': {
        const { loaded, next } = form as {
          loaded: LoadedForm;
          next: ProjectEditData;
        };
        const section = next.sections!.find((item) => !item.sectionUuid)!;
        saved(
          await loaded.save(next, {
            expectedUpdatedAt: loaded.version,
            onWrite: (tx, schema) => {
              const made = tx
                .select({ id: schema.projectContentSections.sectionUuid })
                .from(schema.projectContentSections)
                .where(
                  eq(schema.projectContentSections.publicId, section.publicId),
                )
                .get() as { id: string } | undefined;
              if (!made) fail('The section was not made.');
              onCreate('project-section', loaded.version)(tx, schema, made.id);
            },
          }),
        );
        break;
      }
      case 'event':
        saved(
          await createEvent(form as EventEditData, {
            onCreate: onCreate('event'),
          }),
        );
        break;
      case 'diary-entry':
        saved(
          await createDiaryEntryFromForm(form as DiaryEditData, {
            onCreate: onCreate('diary-entry'),
          }),
        );
        break;
      case 'page':
        saved(
          await createPage(form as PageEditData, {
            onCreate: onCreate('page'),
          }),
        );
        break;
      case 'tag':
        saved(
          await createTag(form as TagEditData, { onCreate: onCreate('tag') }),
        );
        break;
    }
    return created ?? fail('It was made, but its id could not be read back.');
  },
  evaluate(key, row) {
    const payload = row.payload as { entity: CreatedKind; fields: Changes };
    if (payload.entity === 'project-section' && (!key || !entityFace(key)))
      return { state: 'gone' };
    if (
      payload.entity === 'diary-entry' &&
      findEntity(`diary-entry:${titleOf('diary-entry', payload.fields)}`)
    )
      return { state: 'stale' };
    return { state: 'open' };
  },
  summary(payload) {
    const title = titleOf(payload.entity, payload.fields);
    const parts = PART_LISTS.flatMap((list) =>
      Array.isArray(payload.fields[list]) &&
      (payload.fields[list] as unknown[]).length
        ? [
            `${(payload.fields[list] as unknown[]).length} ${
              (payload.fields[list] as unknown[]).length === 1
                ? list.slice(0, -1)
                : list
            }`,
          ]
        : [],
    );
    return `New ${payload.entity} "${title}"${parts.length ? ` with ${parts.join(', ')}` : ''}`;
  },
};

export const deleteAction: AiActionKindDef<'delete'> = {
  kind: 'delete',
  reference:
    'Deletes the target with everything that is its own. Final, so never sure: propose it only when the owner asked for it.',
  schema: z.object({}),
  targets: [
    'project',
    'project-section',
    'event',
    'diary-entry',
    'page',
    'tag',
  ],
  async prepare(key) {
    if (!key) fail('Name what it deletes.');
    if (key.kind === 'profile') fail('The profile cannot be deleted.');
    return {
      payload: { kind: 'delete' },
      base: { version: entityVersion(key) },
      dropped: [],
    };
  },
  identity: () => [],
  async apply(key, row, _context, write) {
    if (!key || !entityFace(key)) fail('It is gone already.');
    const base = (row.base ?? {}) as { version?: number };
    // The owner decided over the entity as it was proposed.
    if (entityVersion(key) !== base.version) fail(CHANGED_SINCE);
    await removeEntity(key, {
      // A section is deleted from its project's form, checked as it is read.
      expectedVersion:
        key.kind === 'project-section' ? undefined : base.version,
      onWrite: (tx, schema) => write(tx, schema, { kind: 'final' }),
    });
    return key;
  },
  evaluate(key, row) {
    if (!key || !entityFace(key)) return { state: 'done' };
    const base = (row.base ?? {}) as { version?: number };
    return entityVersion(key) === base.version
      ? { state: 'open' }
      : { state: 'stale' };
  },
  summary: () => 'Delete it, with everything that is its own',
};
