import { eq } from 'drizzle-orm';
import { dateFromDiaryUrlPart } from '#layers/thei/shared/diary-url';
import { publicIdFromEventUrlPart } from '#layers/thei/shared/event-url';
import {
  publicIdFromProjectSectionUrlPart,
  publicIdFromProjectUrlPart,
} from '#layers/thei/shared/project-url';
import { entityFace, findEntity, type EntityKey } from '../entity-kinds';

/**
 * The entity a public page shows, by its address: what the admin bar's ✦
 * starts a session about there, as it does in the entity's form. A public
 * address names an entity by its public id, a slug or a day; a session names
 * it by its id.
 */
export function entityAtPath(
  path: string,
): { ref: string; title: string } | undefined {
  const { db, schema } = THEI_SERVER.useDb();
  const idOf = (table: any, id: any, column: any, value: string) =>
    (
      db.select({ id }).from(table).where(eq(column, value)).get() as
        { id: string } | undefined
    )?.id;

  let key: EntityKey | undefined;
  const section = /^\/projects\/[^/]+\/sections\/([^/]+)\/$/.exec(path);
  const project = /^\/projects\/([^/]+)\/$/.exec(path);
  const event = /^\/events\/([^/]+)\/$/.exec(path);
  const diary = /^\/diary\/([^/]+)\/$/.exec(path);
  const page = /^\/pages\/([^/]+)\/$/.exec(path);
  if (section) {
    const table = schema.projectContentSections;
    const id = idOf(
      table,
      table.sectionUuid,
      table.publicId,
      publicIdFromProjectSectionUrlPart(section[1]!),
    );
    key = id ? { kind: 'project-section', id } : undefined;
  } else if (project) {
    const id = idOf(
      schema.projects,
      schema.projects.projectUuid,
      schema.projects.publicId,
      publicIdFromProjectUrlPart(project[1]!),
    );
    key = id ? { kind: 'project', id } : undefined;
  } else if (event) {
    const id = idOf(
      schema.events,
      schema.events.eventUuid,
      schema.events.publicId,
      publicIdFromEventUrlPart(event[1]!),
    );
    key = id ? { kind: 'event', id } : undefined;
  } else if (diary) {
    const date = dateFromDiaryUrlPart(diary[1]!);
    key = date ? findEntity(`diary-entry:${date}`) : undefined;
  } else if (page) {
    const id = idOf(
      schema.pages,
      schema.pages.pageUuid,
      schema.pages.slug,
      decodeURIComponent(page[1]!),
    );
    key = id ? { kind: 'page', id } : undefined;
  }
  const face = key ? entityFace(key) : undefined;
  return face ? { ref: face.ref, title: face.title } : undefined;
}
