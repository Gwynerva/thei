import {
  createError,
  getQuery,
  getRouterParam,
  setHeader,
  type H3Event,
} from 'h3';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type {
  PublicExcerptResponse,
  PublicExcerptsPage,
} from '#layers/thei/shared/api/public';
import { dateFromDiaryUrlPart } from '#layers/thei/shared/diary-url';
import { publicIdFromEventUrlPart } from '#layers/thei/shared/event-url';
import type { ExcerptParentType } from '#layers/thei/shared/excerpt';
import { publicIdFromExcerptUrlPart } from '#layers/thei/shared/excerpt-url';
import { publicIdFromProjectUrlPart } from '#layers/thei/shared/project-url';
import { resolveEntityViewer } from '../access-links/viewer';
import { sendContextAsset } from '../assets/context-access';
import { listExcerpts } from '../excerpts';
import {
  eventExcerptParent,
  excerptAccess,
  excerptOpens,
  findExcerptParentByAddress,
  type ExcerptParentInfo,
} from '../excerpts/parents';
import {
  buildExcerptNeighbours,
  buildPublicExcerpt,
  buildPublicExcerptsPage,
  findOpenParentExcerpt,
} from './excerpts';

/**
 * The routes of excerpts, the same for a diary entry, an event and a
 * project but for how the entity is found: each route file finds it by the
 * part of the address it names (`routeExcerptEntity`) and hands it here.
 */

/**
 * A diary entry, an event or a project by the part of a route's address
 * that names it: an entry by its day, an event by its uuid or public id, a
 * project by its public id. Nothing found is a 404.
 */
export async function routeExcerptEntity(
  event: H3Event,
  type: ExcerptParentType,
  param: string,
): Promise<ExcerptParentInfo> {
  const part = getRouterParam(event, param) ?? '';
  let found: ExcerptParentInfo | undefined;
  switch (type) {
    case 'diary-entry': {
      const date = dateFromDiaryUrlPart(part);
      found = date
        ? await findExcerptParentByAddress({ type, date })
        : undefined;
      break;
    }
    case 'event': {
      const byUuid = await THEI_SERVER.events.findByUuid(part);
      found = byUuid
        ? eventExcerptParent(byUuid)
        : await findExcerptParentByAddress({
            type,
            publicId: publicIdFromEventUrlPart(part),
          });
      break;
    }
    case 'project':
      found = await findExcerptParentByAddress({
        type,
        publicId: publicIdFromProjectUrlPart(part),
      });
      break;
  }
  if (!found) throw createError({ statusCode: 404 });
  return found;
}

/**
 * An excerpt's own page. Its parent's share link covers it, as a project's
 * covers its sections; a private excerpt is the private side's alone, and
 * one about something private, that something's too.
 */
export async function sendPublicExcerpt(
  event: H3Event,
  parent: ExcerptParentInfo,
): Promise<PublicExcerptResponse> {
  const viewer = await resolveEntityViewer(event, parent.type, parent.id);
  if (parent.access === ProjectEventAccessLevel.Private && !viewer.asOwner)
    throw createError({ statusCode: 404 });
  const publicId = publicIdFromExcerptUrlPart(
    getRouterParam(event, 'excerpt') ?? '',
  );
  const found = findOpenParentExcerpt(parent, viewer, publicId);
  if (!found) throw createError({ statusCode: 404 });
  const { excerpt, visible } = found;
  if (excerptAccess(excerpt, parent) === ProjectEventAccessLevel.LinkOnly)
    setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
  const [response, neighbours] = await Promise.all([
    buildPublicExcerpt(excerpt, parent, viewer),
    buildExcerptNeighbours(visible, excerpt, parent, viewer),
  ]);
  return { ...response, neighbours };
}

/** One page of the excerpts about an entity, for the block that shows them. */
export async function sendPublicExcerptsAbout(
  event: H3Event,
  target: ExcerptParentInfo,
  pageSize?: number,
): Promise<PublicExcerptsPage> {
  const viewer = await resolveEntityViewer(event, target.type, target.id);
  if (target.access === ProjectEventAccessLevel.Private && !viewer.asOwner)
    throw createError({ statusCode: 404 });
  return buildPublicExcerptsPage(
    { type: target.type, id: target.id },
    getQuery(event).page,
    viewer,
    pageSize,
  );
}

/** An excerpt's banner, the one file an excerpt holds outside its text. */
export async function sendExcerptBanner(
  event: H3Event,
  parent: ExcerptParentInfo,
) {
  if (getRouterParam(event, 'role') !== 'banner')
    throw createError({ statusCode: 404 });
  // The address judges the file by this parent, so the excerpt has to be
  // this parent's own.
  const publicId = publicIdFromExcerptUrlPart(
    getRouterParam(event, 'excerpt') ?? '',
  );
  const excerpt = listExcerpts(parent).find(
    (item) => item.publicId === publicId,
  );
  if (!excerpt) throw createError({ statusCode: 404 });
  return sendContextAsset(event, {
    ownerType: 'excerpt',
    ownerId: excerpt.excerptUuid,
    // A stranger has it where the stricter of its parent and what it is
    // about is open and it is not private; anyone else where its page opens
    // for them, by whichever links that takes.
    access: excerptAccess(excerpt, parent),
    opens: (viewer) => excerptOpens(viewer, excerpt, parent),
    role: 'banner',
    filename: getRouterParam(event, 'filename') ?? '',
  });
}
