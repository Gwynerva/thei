import type { ProjectSectionItem } from '#layers/thei/shared/project-content-item';
import { randomId } from '#layers/thei/shared/utils/random-id';
import { refuse as fail } from '../../entity-patch/text';
import { deleteProject } from '../../projects/edit';
import { deleteEvent } from '../../events/edit';
import { deleteDiaryEntry } from '../../diary/edit';
import { deletePageEdit } from '../../pages/edit';
import { deleteTag } from '../../tags-edit/edit';
import { entityVersion, type EntityKey } from '../../entity-kinds';
import type { FormKind } from './changes';
import { CHANGED_SINCE, found, loadForm, saved, tagRow } from './load';

/**
 * Making and deleting entities as the admin's own forms do.
 */

/** What a kind of entity is made with, before the fields asked for. */
export function startingForm(kind: FormKind, title: string): unknown {
  const slug = THEI_SERVER.language.slugify(title);
  switch (kind) {
    case 'project':
      return {
        title,
        summary: '',
        humanReadableSlug: slug,
        publicId: randomId(14),
        access: 'private',
        showcase: false,
        cv: false,
        synonyms: [],
        sections: [],
      };
    case 'event':
      return {
        title,
        summary: '',
        humanReadableSlug: slug,
        publicId: randomId(14),
        access: 'private',
        synonyms: [],
        periods: [],
        content: null,
      };
    case 'page':
      return {
        title,
        summary: '',
        slug,
        access: 'private',
        synonyms: [],
        content: null,
      };
    case 'tag':
      return {
        title,
        slug: slug || 'tag',
        publicId: randomId(14),
        description: '',
        synonyms: [],
      };
    default:
      return undefined;
  }
}

/** Deletes an entity with everything that is its own. */
export async function removeEntity(
  key: EntityKey,
  options: {
    onWrite?: (tx: any, schema: any) => void;
    /**
     * The version of the form it is deleted from — a section's project's —
     * checked where it cannot change underneath: a change landing since it
     * was read refuses the deletion.
     */
    expectedVersion?: number;
  } = {},
) {
  const { onWrite, expectedVersion } = options;
  const beforeWrite = (tx: any) => {
    if (
      expectedVersion !== undefined &&
      entityVersion(key, tx) !== expectedVersion
    )
      fail(CHANGED_SINCE);
  };
  switch (key.kind) {
    case 'project':
      await found(THEI_SERVER.projects.findByUuid(key.id), key);
      await deleteProject(key.id, { onWrite, beforeWrite });
      return;
    case 'project-section': {
      const loaded = await loadForm(key);
      saved(
        await loaded.save(
          {
            ...loaded.form,
            sections: (loaded.form.sections ?? []).filter(
              (section: ProjectSectionItem) => section.sectionUuid !== key.id,
            ),
          },
          { expectedUpdatedAt: expectedVersion ?? loaded.version, onWrite },
        ),
      );
      return;
    }
    case 'event':
      await found(THEI_SERVER.events.findByUuid(key.id), key);
      await deleteEvent(key.id, { onWrite, beforeWrite });
      return;
    case 'diary-entry':
      await deleteDiaryEntry(
        await found(THEI_SERVER.diary.findByUuid(key.id), key),
        { onWrite, beforeWrite },
      );
      return;
    case 'page':
      await deletePageEdit(
        await found(THEI_SERVER.pages.findByUuid(key.id), key),
        { onWrite, beforeWrite },
      );
      return;
    case 'tag':
      await deleteTag(tagRow(key), { onWrite, beforeWrite });
      return;
    case 'profile':
      fail('The profile cannot be deleted.');
  }
}
