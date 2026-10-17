import { eq } from 'drizzle-orm';
import { contentHeadingAnchors } from '#layers/thei/shared/content-headings';
import type { ContentEntityType } from '#layers/thei/shared/content-link';
import type { ContentEntityOutline } from '#layers/thei/shared/admin/content-entity-outline';
import {
  isDatedSection,
  sortStagesNewestFirst,
} from '#layers/thei/shared/project-content-item';
import { entityPageText } from '../entity-kinds';
import { listProjectSections } from '../projects/content-sections';

/**
 * The places inside an entity a link may lead to: the anchors of the
 * headings of the text its page shows — counted the way the page counts
 * them (`content-headings.ts`), in the site's language — and the places the
 * page names itself.
 */

async function headingsOf(type: ContentEntityType, id: string) {
  if (type === 'tag') return [];
  const text = entityPageText(type);
  if (!text) return [];
  const field = await THEI_SERVER.content.buildFieldValue(type, id, text.slot);
  return contentHeadingAnchors(field?.data, THEI_SERVER.language.slugify);
}

function titleOf(
  type: 'project' | 'project-section' | 'event' | 'page',
  id: string,
) {
  const { db, schema } = THEI_SERVER.useDb();
  switch (type) {
    case 'project':
      return db
        .select({ title: schema.projects.title })
        .from(schema.projects)
        .where(eq(schema.projects.projectUuid, id))
        .get()?.title;
    case 'project-section':
      return db
        .select({ title: schema.projectContentSections.title })
        .from(schema.projectContentSections)
        .where(eq(schema.projectContentSections.sectionUuid, id))
        .get()?.title;
    case 'event':
      return db
        .select({ title: schema.events.title })
        .from(schema.events)
        .where(eq(schema.events.eventUuid, id))
        .get()?.title;
    case 'page':
      return db
        .select({ title: schema.pages.title })
        .from(schema.pages)
        .where(eq(schema.pages.pageUuid, id))
        .get()?.title;
  }
}

/**
 * Where inside an entity a link may lead, for a picker; nothing for one that
 * is gone. A project lists its sections as its page does — the general ones
 * in the owner's order, then the stages newest first, each with its number
 * from the oldest — and a section names its project.
 */
export async function entityOutline(
  type: ContentEntityType,
  id: string,
): Promise<ContentEntityOutline | undefined> {
  const { db, schema } = THEI_SERVER.useDb();
  let title: string | undefined;
  let parent: ContentEntityOutline['parent'];
  let sections: ContentEntityOutline['sections'];
  if (type === 'diary-entry') {
    title = db
      .select({ date: schema.diaryEntries.date })
      .from(schema.diaryEntries)
      .where(eq(schema.diaryEntries.diaryUuid, id))
      .get()?.date;
  } else if (type === 'tag') {
    title = db
      .select({ title: schema.tags.title })
      .from(schema.tags)
      .where(eq(schema.tags.tagUuid, id))
      .get()?.title;
  } else {
    title = titleOf(type, id);
  }
  if (title === undefined) return undefined;

  if (type === 'project') {
    const all = listProjectSections(id);
    const stages = sortStagesNewestFirst(all);
    sections = [
      ...all
        .filter((section) => !isDatedSection(section))
        .map((section) => ({
          entityId: section.sectionUuid,
          title: section.title,
        })),
      ...stages.map((section, index) => ({
        entityId: section.sectionUuid,
        title: section.title,
        stage: { number: stages.length - index, count: stages.length },
      })),
    ];
  }
  if (type === 'project-section') {
    const row = db
      .select({
        projectUuid: schema.projectContentSections.projectUuid,
      })
      .from(schema.projectContentSections)
      .where(eq(schema.projectContentSections.sectionUuid, id))
      .get();
    const project = row && titleOf('project', row.projectUuid);
    if (row && project !== undefined)
      parent = { entityId: row.projectUuid, title: project };
  }

  return {
    entityType: type,
    entityId: id,
    title,
    headings: (await headingsOf(type, id)).map((heading) => ({
      id: heading.id,
      title: heading.title,
      level: heading.level,
      private: heading.private,
    })),
    ...(sections ? { sections } : {}),
    ...(parent ? { parent } : {}),
  };
}
