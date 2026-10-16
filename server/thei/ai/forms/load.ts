import { and, eq } from 'drizzle-orm';
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

/**
 * Every status line of an owner, by id: what a change of them is told
 * against, the whole history and not only the page a form shows.
 */
function statusTextsOf(type: 'project' | 'profile', id: string) {
  const { db, schema } = THEI_SERVER.useDb();
  return Object.fromEntries(
    db
      .select({ id: schema.statuses.id, text: schema.statuses.text })
      .from(schema.statuses)
      .where(
        and(
          eq(schema.statuses.ownerType, type),
          eq(schema.statuses.ownerId, id),
        ),
      )
      .all()
      .map((row: { id: string; text: string }) => [row.id, row.text]),
  ) as Record<string, string>;
}

/** A form as its save takes it: what was read only for the AI left out. */
function writable(form: any) {
  const { statusTexts: _texts, ...rest } = form;
  return rest;
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
          statusTexts: statusTextsOf('project', key.id),
        },
        version: project.updatedAt,
        save: (form, options) =>
          saveProjectEdit(key.id, writable(form), options),
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
      const { data } = await getAdminProfile();
      return {
        owner: key,
        form: { ...data, statusTexts: statusTextsOf('profile', key.id) },
        version: data.version ?? 0,
        async save(form, options) {
          try {
            // The record is written in the save's own transaction.
            await saveProfile(writable(form), options);
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
