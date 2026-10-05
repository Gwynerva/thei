import { and, eq } from 'drizzle-orm';
import {
  publicIdFromProjectSectionUrlPart,
  publicIdFromProjectUrlPart,
} from '#layers/thei/shared/project-url';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { sendContextAsset } from '../../../../../../../thei/assets/context-access';

/** A section's banner, the one file a section holds outside its body. */
export default defineEventHandler(async (event) => {
  const project = await THEI_SERVER.projects.findByPublicId(
    publicIdFromProjectUrlPart(getRouterParam(event, 'slug') ?? ''),
  );
  if (!project) throw createError({ statusCode: 404 });
  if (getRouterParam(event, 'role') !== 'banner')
    throw createError({ statusCode: 404 });
  const { db, schema } = THEI_SERVER.useDb();
  const publicId = publicIdFromProjectSectionUrlPart(
    getRouterParam(event, 'section') ?? '',
  );
  // The address judges the file by this project's access, so the section has
  // to be this project's own.
  const section = db
    .select({
      sectionUuid: schema.projectContentSections.sectionUuid,
      isPrivate: schema.projectContentSections.isPrivate,
    })
    .from(schema.projectContentSections)
    .where(
      and(
        eq(schema.projectContentSections.projectUuid, project.projectUuid),
        eq(schema.projectContentSections.publicId, publicId),
      ),
    )
    .get();
  if (!section) throw createError({ statusCode: 404 });
  return sendContextAsset(event, {
    ownerType: 'project-section',
    ownerId: section.sectionUuid,
    // A private section is the owner's and the project's share link's, as
    // its page is; any other is as visible as the project.
    access: section.isPrivate
      ? ProjectEventAccessLevel.Private
      : project.access,
    grantOwner: { entityType: 'project', entityId: project.projectUuid },
    role: 'banner',
    filename: getRouterParam(event, 'filename') ?? '',
  });
});
