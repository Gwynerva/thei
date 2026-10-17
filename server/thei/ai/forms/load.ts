import { and, eq } from 'drizzle-orm';
import type { ProjectSectionItem } from '#layers/thei/shared/project-content-item';
import { EntityEditConflict, type EntityEditOptions } from '../../entity-edit';
import { refuse as fail } from '../../entity-patch/text';
import { readProjectEdit, saveProjectEdit } from '../../projects/edit';
import { readEventEdit, saveEventEdit } from '../../events/edit';
import { readDiaryEdit, saveDiaryEdit } from '../../diary/edit';
import { readPageEdit, savePageEdit } from '../../pages/edit';
import { readTagEdit, saveTagEdit } from '../../tags-edit/edit';
import { getAdminProfile, saveProfile } from '../../profile';
import { formOwnerOf, refOf, type EntityKey } from '../../entity-kinds';
import {
  type Changes,
  projectChanges,
  eventChanges,
  diaryChanges,
  pageChanges,
  tagChanges,
  profileChanges,
} from './changes';

/**
 * An entity's edit form read as it stands, with the version it was read at
 * and the admin's own save that writes it back.
 */

export const CHANGED_SINCE =
  'It has changed since you read it. Read it again and make the change over what is there now.';
export const CHANGED_AFTER =
  'It has been changed again since; undoing it would undo that too. Change it back by hand.';

type SaveResult = { type: string; message?: string; code?: string };

/** Refuses a save the admin's own save refused, in the words it gave. */
export function saved(result: SaveResult) {
  if (result.type === 'success') return;
  fail(
    result.code === 'changed'
      ? CHANGED_SINCE
      : (result.message ?? 'The change was refused.'),
  );
}

export async function found<T>(
  find: Promise<T | undefined | null>,
  key: EntityKey,
): Promise<T> {
  return (await find) ?? fail(`Nothing found for ${refOf(key)}.`);
}

type StatusOwner = { type: 'project' | 'profile'; id: string };

function statusRows(owner: StatusOwner) {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select({
      id: schema.statuses.id,
      text: schema.statuses.text,
      assetUuid: schema.statuses.assetUuid,
    })
    .from(schema.statuses)
    .where(
      and(
        eq(schema.statuses.ownerType, owner.type),
        eq(schema.statuses.ownerId, owner.id),
      ),
    )
    .all() as { id: string; text: string; assetUuid: string | null }[];
}

/**
 * Every status line of an owner, by id: what a change of them is told
 * against, the whole history and not only the page a form shows.
 */
function statusTextsOf(owner: StatusOwner) {
  return Object.fromEntries(
    statusRows(owner).map((row) => [row.id, row.text]),
  ) as Record<string, string>;
}

/**
 * A form as its save takes it. Its status lines are read as `statusTexts`,
 * and written as the edits of those that read otherwise now — each its
 * picture and day kept — so a change of them and its undo are one field.
 */
function writable(form: any, owner: StatusOwner) {
  const { statusTexts, ...rest } = form;
  const texts = (statusTexts ?? {}) as Record<string, string>;
  const updated = statusRows(owner).flatMap((row) =>
    row.id in texts && texts[row.id] !== row.text
      ? [
          {
            id: row.id,
            text: texts[row.id]!,
            ...(row.assetUuid ? { assetUuid: row.assetUuid } : {}),
          },
        ]
      : [],
  );
  if (!updated.length) return rest;
  const named = new Set(updated.map((status) => status.id));
  return {
    ...rest,
    updatedStatuses: [
      ...((rest.updatedStatuses ?? []) as { id: string }[]).filter(
        (status) => !named.has(status.id),
      ),
      ...updated,
    ],
  };
}

export function tagRow(key: EntityKey) {
  const { db, schema } = THEI_SERVER.useDb();
  return (
    db
      .select()
      .from(schema.tags)
      .where(eq(schema.tags.tagUuid, key.id))
      .get() ?? fail(`Nothing found for ${refOf(key)}.`)
  );
}

/**
 * The form an entity is edited in, as it stands — a section's is its
 * project's — with the version it was read at, none for a tag or the
 * profile, and the save that writes it back.
 */
export interface LoadedForm {
  /** Whose form it is: the entity, or a section's project. */
  owner: EntityKey;
  form: any;
  version: number;
  save(form: any, options: EntityEditOptions): Promise<SaveResult>;
}

export async function loadForm(key: EntityKey): Promise<LoadedForm> {
  switch (key.kind) {
    case 'project': {
      const project = await found(THEI_SERVER.projects.findByUuid(key.id), key);
      return {
        owner: key,
        form: {
          ...(await readProjectEdit(project)),
          statusTexts: statusTextsOf({ type: 'project', id: key.id }),
        },
        version: project.updatedAt,
        save: (form, options) =>
          saveProjectEdit(
            key.id,
            writable(form, { type: 'project', id: key.id }),
            options,
          ),
      };
    }
    case 'project-section':
      return loadForm(
        formOwnerOf(key) ?? fail(`Nothing found for ${refOf(key)}.`),
      );
    case 'event': {
      const event = await found(THEI_SERVER.events.findByUuid(key.id), key);
      return {
        owner: key,
        form: await readEventEdit(event),
        version: event.updatedAt,
        save: (form, options) => saveEventEdit(key.id, form, options),
      };
    }
    case 'diary-entry': {
      const entry = await found(THEI_SERVER.diary.findByUuid(key.id), key);
      return {
        owner: key,
        form: await readDiaryEdit(entry),
        version: entry.updatedAt,
        save: (form, options) => saveDiaryEdit(entry, form, options),
      };
    }
    case 'page': {
      const page = await found(THEI_SERVER.pages.findByUuid(key.id), key);
      return {
        owner: key,
        form: await readPageEdit(page),
        version: page.updatedAt,
        save: (form, options) => savePageEdit(page, form, options),
      };
    }
    case 'tag': {
      const tag = tagRow(key);
      return {
        owner: key,
        form: await readTagEdit(tag),
        version: tag.updatedAt,
        save: (form, options) => saveTagEdit(tag, form, options),
      };
    }
    case 'profile': {
      const { data, statuses } = await getAdminProfile();
      return {
        owner: key,
        form: {
          ...data,
          // Read with the form, as a project's are, for a model to name
          // them; the profile's save takes them as `statusTexts` alone.
          statuses,
          statusTexts: statusTextsOf({ type: 'profile', id: key.id }),
        },
        version: data.version ?? 0,
        async save({ statuses: _shown, ...form }, options) {
          try {
            // The record is written in the save's own transaction.
            await saveProfile(
              writable(form, { type: 'profile', id: key.id }),
              options,
            );
          } catch (error) {
            if (error instanceof EntityEditConflict)
              return { type: 'error', code: 'changed' };
            return {
              type: 'error',
              message:
                (error as { message?: string }).message ??
                'The profile was refused.',
            };
          }
          return { type: 'success' };
        },
      };
    }
  }
}

/**
 * What of the form an entity is: a section its own item among its project's
 * sections, any other entity the whole form. What an action on it kept and
 * compares is this part alone, so another section's change leaves it be.
 */
export function formPart(key: EntityKey, form: any): any {
  if (key.kind !== 'project-section') return form;
  return ((form.sections ?? []) as ProjectSectionItem[]).find(
    (section) => section.sectionUuid === key.id,
  );
}

/** The form with the entity's part put back: what is saved. */
export function withFormPart(key: EntityKey, form: any, part: any): any {
  if (key.kind !== 'project-section') return part;
  return {
    ...form,
    sections: ((form.sections ?? []) as ProjectSectionItem[]).map((section) =>
      section.sectionUuid === key.id ? part : section,
    ),
  };
}

/** A change laid over the form it is made in. */
export async function changedForm(
  key: EntityKey,
  loaded: LoadedForm,
  changes: Changes,
): Promise<any> {
  const form = loaded.form;
  switch (key.kind) {
    case 'project':
      return projectChanges(form, changes, key);
    case 'project-section':
      return projectChanges(
        form,
        { sections: [{ ...changes, id: key.id }] },
        loaded.owner,
      );
    case 'event':
      return eventChanges(form, changes, key);
    case 'diary-entry':
      return diaryChanges(form, changes, key);
    case 'page':
      return pageChanges(form, changes);
    case 'tag':
      return tagChanges(form, changes);
    case 'profile':
      return profileChanges(form, changes);
  }
}
