import {
  LIFE_SCOPE_LIFE,
  parseLifeFilter,
  type LifeFilter,
  type LifeScope,
} from '#layers/thei/shared/life';
import { publicIdFromProjectUrlPart } from '#layers/thei/shared/project-url';
import type { H3Event } from 'h3';
import {
  resolveEntityViewer,
  scopedViewer,
  siteViewer,
  type PublicViewer,
} from '../access-links/viewer';
import { canOpenPublicEntity } from './entities';

/**
 * The scope, filter and role behind one chronology request.
 *
 * Every life endpoint takes the same three query parameters, so the parsing
 * lives here instead of being repeated — and, more importantly, so the access
 * check on a project scope cannot be forgotten in one of them.
 */
export async function resolveLifeQuery(event: H3Event): Promise<{
  scope: LifeScope;
  filter: LifeFilter;
  viewer: PublicViewer;
}> {
  const query = getQuery(event);
  const projectPart = query.project;
  if (typeof projectPart !== 'string' || !projectPart)
    return {
      scope: LIFE_SCOPE_LIFE,
      filter: parseLifeFilter(query.f, LIFE_SCOPE_LIFE),
      // The whole timeline is the site's, and a share link never widens it.
      viewer: siteViewer(await THEI_SERVER.isAdmin(event)),
    };

  const project =
    (await THEI_SERVER.projects.findByUuid(projectPart)) ??
    (await THEI_SERVER.projects.findByPublicId(
      publicIdFromProjectUrlPart(projectPart),
    ));
  if (!project) throw createError({ statusCode: 404 });
  const viewer = await resolveEntityViewer(
    event,
    'project',
    project.projectUuid,
  );
  if (!canOpenPublicEntity(project.access, viewer.asOwner))
    throw createError({ statusCode: 404 });

  const scope: LifeScope = {
    kind: 'project',
    projectUuid: project.projectUuid,
  };
  return {
    scope,
    filter: parseLifeFilter(query.f, scope),
    // A share link opens this project's own points; the events and diary
    // entries gathered around it are still judged for the stranger.
    viewer: scopedViewer(viewer, 'project', project.projectUuid),
  };
}
