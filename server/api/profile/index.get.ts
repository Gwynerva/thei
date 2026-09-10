import {
  PROFILE_ID,
  type PublicProfileResponse,
} from '#layers/thei/shared/profile';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { and, eq, sql } from 'drizzle-orm';
import {
  getPinnedPages,
  getProfileHistory,
  getProfileIdentity,
  getProfileLinks,
} from '../../thei/profile';
import { buildPublicContentData } from '../../thei/public/content';
import {
  buildPublicEventSummary,
  buildPublicProjectReference,
  buildPublicProjectSummary,
  buildPublicTagListItems,
  canListPublicEntity,
} from '../../thei/public/entities';

export default defineEventHandler(
  async (event): Promise<PublicProfileResponse> => {
    const isAdmin = await THEI_SERVER.isAdmin(event);
    const { db, schema } = THEI_SERVER.useDb();
    const identity = await getProfileIdentity();
    const p = identity.profile;
    const projects = db
      .select()
      .from(schema.projects)
      .all()
      .filter((p) => canListPublicEntity(p.access, isAdmin))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const showcaseProjects = db
      .select()
      .from(schema.projects)
      .where(
        isAdmin
          ? eq(schema.projects.showcase, true)
          : and(
              eq(schema.projects.showcase, true),
              eq(schema.projects.access, ProjectEventAccessLevel.Public),
            ),
      )
      .orderBy(sql`random()`)
      .limit(12)
      .all();
    const events = db
      .select()
      .from(schema.events)
      .all()
      .filter((p) => canListPublicEntity(p.access, isAdmin))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const projectIds = new Set(projects.map((p) => p.projectUuid));
    const eventIds = new Set(events.map((p) => p.eventUuid));
    const usages = db.select().from(schema.tagUsages).all();
    const counts = new Map<
      string,
      { projectCount: number; eventCount: number }
    >();
    for (const usage of usages) {
      const count = counts.get(usage.tagUuid) ?? {
        projectCount: 0,
        eventCount: 0,
      };
      if (
        usage.containerType === 'project' &&
        projectIds.has(usage.containerId)
      )
        count.projectCount += 1;
      else if (
        usage.containerType === 'event' &&
        eventIds.has(usage.containerId)
      )
        count.eventCount += 1;
      counts.set(usage.tagUuid, count);
    }
    const tags = db
      .select()
      .from(schema.tags)
      .all()
      .map((tag) => ({
        tag,
        projectCount: counts.get(tag.tagUuid)?.projectCount ?? 0,
        eventCount: counts.get(tag.tagUuid)?.eventCount ?? 0,
      }))
      .filter((t) => t.projectCount + t.eventCount > 0)
      .sort(
        (a, b) =>
          b.projectCount + b.eventCount - a.projectCount - a.eventCount ||
          a.tag.title.localeCompare(b.tag.title),
      )
      .slice(0, 5);
    const [
      aboutContent,
      pinnedPages,
      externalLinks,
      avatars,
      statuses,
      projectItems,
      showcaseItems,
      eventItems,
      tagItems,
    ] = await Promise.all([
      buildPublicContentData(
        'profile',
        PROFILE_ID,
        'profile-about',
        { type: 'profile', title: p.displayName },
        isAdmin,
      ),
      getPinnedPages(),
      getProfileLinks(isAdmin),
      getProfileHistory('avatars', undefined, false, 1),
      getProfileHistory('statuses', undefined, false, 1),
      Promise.all(projects.slice(0, 3).map(buildPublicProjectSummary)),
      Promise.all(showcaseProjects.map(buildPublicProjectReference)),
      Promise.all(
        events.slice(0, 3).map((e) => buildPublicEventSummary(e, isAdmin)),
      ),
      buildPublicTagListItems(tags),
    ]);
    return {
      displayName: p.displayName,
      slogan: p.slogan,
      nickname: p.nickname,
      birthDate: p.birthDate,
      facts: p.facts,
      avatarMedia: identity.avatarMedia,
      bannerMedia: identity.bannerMedia,
      faviconMedia: identity.faviconMedia,
      avatarCount: avatars.total,
      currentStatus: statuses.items[0],
      statusCount: statuses.total,
      aboutContent,
      pinnedPages,
      externalLinks,
      showcaseProjects: showcaseItems,
      projects: { count: projects.length, items: projectItems },
      events: { count: events.length, items: eventItems },
      tags: tagItems,
    };
  },
);
